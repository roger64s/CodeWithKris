from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter

import joblib
import numpy as np
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .audio_features import extract_mfcc
from .curation import validate_manifest, write_report
from .task_config import DEFAULT_TASK_CONFIG, TaskConfig, load_task_config

EXPECTED_LABELS = set(DEFAULT_TASK_CONFIG.labels)

def load_dataset(manifest_path: Path, task_config: TaskConfig = DEFAULT_TASK_CONFIG) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[dict[str, object]], dict[str, object]]:
    features: list[np.ndarray] = []
    labels: list[str] = []
    speakers: list[str] = []
    workflow_records: list[dict[str, object]] = []
    rows, curation_report = validate_manifest(manifest_path, task_config=task_config)
    for row in rows:
        audio_path = (manifest_path.parent / row["path"]).resolve()
        features.append(extract_mfcc(audio_path.read_bytes(), task_config.feature_config))
        labels.append(row["label"])
        speakers.append(row["speaker_id"].strip())
        workflow_records.append({
            "conversationId": row["conversation_id"].strip(),
            "turnIndex": int(row["turn_index"]),
            "responseBlock": row["response_block"].strip(),
        })
    counts = {label: labels.count(label) for label in task_config.sequence}
    speaker_counts = {label: len({speakers[index] for index, item in enumerate(labels) if item == label}) for label in task_config.sequence}
    evaluation = task_config.evaluation_config
    minimum_samples = int(evaluation["minimumSamplesPerClass"])
    minimum_speakers = int(evaluation["minimumDistinctSpeakersPerClass"])
    if any(count < minimum_samples for count in counts.values()) or any(count < minimum_speakers for count in speaker_counts.values()):
        raise ValueError(f"At least {minimum_samples} consented recordings and {minimum_speakers} distinct speakers per class are required. Recordings: {counts}; speakers: {speaker_counts}")
    curation_report["eligibleClassCounts"] = counts
    curation_report["eligibleSpeakerCountsByClass"] = speaker_counts
    bias_flags = curation_report["filterAudit"]["biasFlags"]
    if bias_flags:
        raise ValueError(f"Training blocked by unresolved retention-bias flags: {bias_flags}")
    return np.vstack(features), np.asarray(labels), np.asarray(speakers), workflow_records, curation_report


def train(manifest_path: Path, output_dir: Path, task_config: TaskConfig = DEFAULT_TASK_CONFIG) -> dict[str, object]:
    inputs, labels, speakers, workflow_records, curation_report = load_dataset(manifest_path, task_config)
    evaluation = task_config.evaluation_config
    model_config = task_config.model_config
    splitter = StratifiedGroupKFold(n_splits=int(evaluation["folds"]), shuffle=True, random_state=int(evaluation["randomState"]))
    train_indices, test_indices = next(splitter.split(inputs, labels, groups=speakers))
    train_inputs, test_inputs = inputs[train_indices], inputs[test_indices]
    train_labels, test_labels = labels[train_indices], labels[test_indices]
    classes = list(task_config.sequence)
    if set(train_labels) != task_config.labels or set(test_labels) != task_config.labels:
        raise ValueError("The speaker-grouped split must contain every configured class in both training and test partitions.")
    model = Pipeline([
        ("scale", StandardScaler()),
        ("mlp", MLPClassifier(
            hidden_layer_sizes=tuple(model_config["hiddenLayerSizes"]),
            activation=str(model_config["activation"]),
            solver=str(model_config["solver"]),
            early_stopping=False,
            max_iter=int(model_config["maxIterations"]),
            random_state=int(evaluation["randomState"]),
        )),
    ])
    model.fit(train_inputs, train_labels)
    predictions = model.predict(test_inputs)
    model.predict_proba(test_inputs[:1])
    classifier_latencies: list[float] = []
    for item in test_inputs:
        started_at = perf_counter()
        model.predict_proba(item.reshape(1, -1))
        classifier_latencies.append((perf_counter() - started_at) * 1000)
    precision, recall, f1, _ = precision_recall_fscore_support(
        test_labels,
        predictions,
        average="weighted",
        zero_division=0,
    )
    class_precision, class_recall, class_f1, class_support = precision_recall_fscore_support(
        test_labels,
        predictions,
        labels=classes,
        zero_division=0,
    )
    conversations: dict[str, list[dict[str, object]]] = {}
    response_block_matches = 0
    for position, source_index in enumerate(test_indices):
        record = workflow_records[int(source_index)]
        predicted_label = str(predictions[position])
        predicted_block = task_config.states_by_label[predicted_label]["responseBlock"]
        response_block_matches += predicted_block == record["responseBlock"]
        conversations.setdefault(str(record["conversationId"]), []).append({
            **record,
            "expectedLabel": str(test_labels[position]),
            "predictedLabel": predicted_label,
        })
    transition_total = 0
    transition_correct = 0
    complete_conversations = 0
    for turns in conversations.values():
        ordered = sorted(turns, key=lambda item: int(item["turnIndex"]))
        complete_conversations += [item["predictedLabel"] for item in ordered] == list(task_config.sequence)
        for current, following in zip(ordered, ordered[1:]):
            if task_config.states_by_label[str(current["expectedLabel"])]["nextState"] == following["expectedLabel"]:
                transition_total += 1
                transition_correct += current["predictedLabel"] == current["expectedLabel"] and following["predictedLabel"] == following["expectedLabel"]
    model_version = f"{task_config.task_id}-mfcc-mlp-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}"
    metrics: dict[str, object] = {
        "modelVersion": model_version,
        "taskId": task_config.task_id,
        "taskName": task_config.task_name,
        "createdAt": datetime.now(UTC).isoformat(),
        "trainingSamples": int(len(train_labels)),
        "testSamples": int(len(test_labels)),
        "split": {
            "targetTrain": 0.8,
            "targetTest": 0.2,
            "actualTrain": len(train_labels) / len(labels),
            "actualTest": len(test_labels) / len(labels),
            "randomState": int(evaluation["randomState"]),
            "speakerDisjoint": True,
        },
        "accuracy": float(accuracy_score(test_labels, predictions)),
        "precisionWeighted": float(precision),
        "recallWeighted": float(recall),
        "f1Weighted": float(f1),
        "perClass": {
            label: {
                "precision": float(class_precision[index]),
                "recall": float(class_recall[index]),
                "f1": float(class_f1[index]),
                "support": int(class_support[index]),
            }
            for index, label in enumerate(classes)
        },
        "classifierLatencyMs": {
            "p50": float(np.percentile(classifier_latencies, 50)),
            "p95": float(np.percentile(classifier_latencies, 95)),
        },
        "workflowEvaluation": {
            "workflowVersion": task_config.version,
            "responseBlockAccuracy": response_block_matches / len(test_labels),
            "transitionPairAccuracy": transition_correct / transition_total if transition_total else None,
            "completeConversationAccuracy": complete_conversations / len(conversations),
            "evaluatedConversations": len(conversations),
            "evaluatedTransitions": transition_total,
        },
        "classes": classes,
        "confusionMatrix": confusion_matrix(test_labels, predictions, labels=classes).tolist(),
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    write_report(curation_report, output_dir / "curation_report.json")
    joblib.dump({
        "pipeline": model,
        "modelVersion": model_version,
        "classes": classes,
        "taskConfig": task_config.to_dict(),
        "featureConfig": task_config.feature_config,
    }, output_dir / "model.joblib")
    (output_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Train a consent-gated configurable speech-task MFCC/MLP baseline.")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--config", type=Path, help="Versioned task configuration JSON.")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    task_config = load_task_config(args.config)
    output = args.output or Path(__file__).parent / "artifacts" / task_config.task_id
    print(json.dumps(train(args.manifest.resolve(), output.resolve(), task_config), indent=2))


if __name__ == "__main__":
    main()
