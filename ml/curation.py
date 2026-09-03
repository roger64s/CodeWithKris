from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from .task_config import DEFAULT_TASK_CONFIG, TaskConfig, load_task_config
REQUIRED_COLUMNS = {
    "recording_id", "task_id", "path", "label", "speaker_id", "consent", "consent_scope",
    "include_in_training", "review_status", "reviewer_1_label", "reviewer_2_label",
    "adjudication_status", "normalized_transcript", "language", "locale", "device_type",
    "environment", "noise_level", "audio_quality_score", "speech_clarity_score",
    "speech_variation_tags", "vad_outcome", "clipping_outcome",
    "conversation_id", "turn_index", "speaker_role", "expected_result",
    "response_block", "receiver_dialogue", "reference_alignment_status",
}
TRUE_VALUES = {"yes", "true", "1"}
REVIEW_STATUSES = {"accepted", "adjudicated"}
VAD_OUTCOMES = {"retained", "manual_review", "excluded"}
CLIPPING_OUTCOMES = {"none", "retained", "manual_review", "excluded"}


def normalize_label(value: str, task_config: TaskConfig = DEFAULT_TASK_CONFIG) -> str:
    token = "".join(re.findall(r"[a-z0-9]+", unicodedata.normalize("NFKC", value).casefold()))
    labels = {
        "".join(re.findall(r"[a-z0-9]+", unicodedata.normalize("NFKC", label).casefold())): label
        for label in task_config.labels
    }
    if token not in labels:
        raise ValueError(f"Unsupported label '{value}'. Expected one of {sorted(task_config.labels)}")
    return labels[token]


def normalize_transcript(value: str) -> str:
    text = unicodedata.normalize("NFKC", value).strip()
    text = text.replace("’", "'").replace("“", '"').replace("”", '"')
    text = re.sub(r"\s+", " ", text)
    if text and text[-1] not in ".?!":
        text += "."
    return text[:1].upper() + text[1:] if text else text


def token_overlap(left: str, right: str) -> float:
    left_tokens = set(re.findall(r"[a-z0-9]+", normalize_transcript(left).lower()))
    right_tokens = set(re.findall(r"[a-z0-9]+", normalize_transcript(right).lower()))
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens) if left_tokens and right_tokens else 0.0


def comparison_key(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", unicodedata.normalize("NFKC", value).casefold()))


def krippendorff_alpha_nominal(ratings: list[list[str]]) -> float:
    pairs = [(left, right) for row in ratings for index, left in enumerate(row) for right in row[index + 1:]]
    if not pairs:
        raise ValueError("At least two reviewer ratings are required to calculate agreement.")
    observed = sum(left != right for left, right in pairs) / len(pairs)
    counts = Counter(label for row in ratings for label in row)
    total = sum(counts.values())
    expected = 1 - sum(count * (count - 1) for count in counts.values()) / (total * (total - 1))
    if expected == 0:
        return 1.0 if observed == 0 else 0.0
    return 1 - observed / expected


def _score(row: dict[str, str], field: str) -> int:
    try:
        value = int(row[field])
    except ValueError as error:
        raise ValueError(f"{row['recording_id']}: {field} must be an integer from 1 to 5.") from error
    if value not in range(1, 6):
        raise ValueError(f"{row['recording_id']}: {field} must be from 1 to 5.")
    return value


def validate_manifest(manifest_path: Path, minimum_alpha: float = 0.8, task_config: TaskConfig = DEFAULT_TASK_CONFIG) -> tuple[list[dict[str, str]], dict[str, Any]]:
    with manifest_path.open(newline="", encoding="utf-8") as manifest_file:
        reader = csv.DictReader(manifest_file)
        missing = REQUIRED_COLUMNS.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Manifest is missing columns: {', '.join(sorted(missing))}")
        rows = list(reader)
    if not rows:
        raise ValueError("Manifest contains no recordings.")

    identifiers: set[str] = set()
    ratings: list[list[str]] = []
    eligible: list[dict[str, str]] = []
    exclusion_reasons: Counter[str] = Counter()
    coverage: dict[str, Counter[str]] = defaultdict(Counter)
    included_coverage: dict[str, Counter[str]] = defaultdict(Counter)
    alignment_scores: dict[str, list[float]] = defaultdict(list)
    conversation_turns: set[tuple[str, int]] = set()
    possible_receiver_turns: list[str] = []
    for row in rows:
        recording_id = row["recording_id"].strip()
        if not recording_id or recording_id in identifiers:
            raise ValueError(f"Recording IDs must be unique and non-empty: '{recording_id}'.")
        identifiers.add(recording_id)
        if row["task_id"].strip() != task_config.task_id:
            raise ValueError(f"{recording_id}: task_id must match the active task configuration '{task_config.task_id}'.")
        row["label"] = normalize_label(row["label"], task_config)
        state = task_config.states_by_label[row["label"]]
        conversation_id = row["conversation_id"].strip()
        if not conversation_id:
            raise ValueError(f"{recording_id}: conversation_id is required.")
        turn_index = int(row["turn_index"])
        if (conversation_id, turn_index) in conversation_turns:
            raise ValueError(f"{recording_id}: conversation turn {conversation_id}/{turn_index} is duplicated.")
        conversation_turns.add((conversation_id, turn_index))
        if turn_index != state["sequence"]:
            raise ValueError(f"{recording_id}: turn_index does not match the workflow sequence for {row['label']}.")
        if row["speaker_role"].strip().lower() != "caller":
            raise ValueError(f"{recording_id}: classifier rows must contain the caller task turn; receiver dialogue is context only.")
        if row["response_block"].strip() != state["responseBlock"]:
            raise ValueError(f"{recording_id}: response_block does not match {row['label']}.")
        if row["reference_alignment_status"].strip().lower() != "reviewed":
            raise ValueError(f"{recording_id}: expected and receiver dialogue alignment requires human review.")
        row["expected_result"] = normalize_transcript(row["expected_result"])
        row["receiver_dialogue"] = normalize_transcript(row["receiver_dialogue"])
        if comparison_key(row["expected_result"]) != comparison_key(state["expectedResult"]):
            raise ValueError(f"{recording_id}: expected_result does not match the reviewed workflow table.")
        if comparison_key(row["receiver_dialogue"]) != comparison_key(state["receiverDialogue"]):
            raise ValueError(f"{recording_id}: receiver_dialogue does not match the reviewed workflow table.")
        reviewer_labels = [normalize_label(row["reviewer_1_label"], task_config), normalize_label(row["reviewer_2_label"], task_config)]
        ratings.append(reviewer_labels)
        row["normalized_transcript"] = normalize_transcript(row["normalized_transcript"])
        expected_overlap = token_overlap(row["normalized_transcript"], row["expected_result"])
        receiver_overlap = token_overlap(row["normalized_transcript"], row["receiver_dialogue"])
        alignment_scores[row["label"]].append(expected_overlap)
        if receiver_overlap > expected_overlap + 0.15:
            possible_receiver_turns.append(recording_id)
        _score(row, "audio_quality_score")
        _score(row, "speech_clarity_score")
        if row["review_status"].strip().lower() not in REVIEW_STATUSES:
            raise ValueError(f"{recording_id}: review_status must be accepted or adjudicated.")
        if reviewer_labels[0] != reviewer_labels[1] and row["adjudication_status"].strip().lower() != "resolved":
            raise ValueError(f"{recording_id}: reviewer disagreement requires resolved adjudication.")
        if reviewer_labels[0] == reviewer_labels[1] and row["label"] != reviewer_labels[0]:
            raise ValueError(f"{recording_id}: final label does not match agreeing reviewers.")
        vad_outcome = row["vad_outcome"].strip().lower()
        clipping_outcome = row["clipping_outcome"].strip().lower()
        if vad_outcome not in VAD_OUTCOMES or clipping_outcome not in CLIPPING_OUTCOMES:
            raise ValueError(f"{recording_id}: invalid VAD or clipping audit outcome.")
        included = row["include_in_training"].strip().lower() in TRUE_VALUES
        consented = row["consent"].strip().lower() in TRUE_VALUES and row["consent_scope"].strip().lower() == "model_training"
        if included and not consented:
            raise ValueError(f"{recording_id}: training inclusion requires affirmative model_training consent.")
        if included and (vad_outcome == "excluded" or clipping_outcome == "excluded"):
            raise ValueError(f"{recording_id}: an automatically excluded sample requires manual review before training inclusion.")
        if included:
            eligible.append(row)
        else:
            exclusion_reasons["no_training_consent" if not consented else "curator_excluded"] += 1
        for field in ("label", "language", "locale", "device_type", "environment", "noise_level", "speech_variation_tags"):
            value = row[field].strip() or "unspecified"
            coverage[field][value] += 1
            if included:
                included_coverage[field][value] += 1

    alpha = krippendorff_alpha_nominal(ratings)
    if alpha < minimum_alpha:
        raise ValueError(f"Krippendorff's alpha {alpha:.3f} is below the required {minimum_alpha:.3f}.")
    if not eligible:
        raise ValueError("No reviewed recordings have affirmative model-training consent and inclusion approval.")
    if possible_receiver_turns:
        raise ValueError(f"Possible receiver turns require ground-truth re-review: {possible_receiver_turns}")
    retention = {
        field: {
            value: {
                "total": total,
                "included": included_coverage[field][value],
                "retentionRate": included_coverage[field][value] / total,
            }
            for value, total in values.items()
        }
        for field, values in coverage.items()
    }
    bias_flags: list[str] = []
    for field, groups in retention.items():
        stable_groups = {value: data for value, data in groups.items() if data["total"] >= 5}
        if len(stable_groups) > 1:
            rates = [data["retentionRate"] for data in stable_groups.values()]
            if max(rates) - min(rates) > 0.2:
                bias_flags.append(f"{field}: retention-rate gap exceeds 0.20; review VAD, clipping, and curator exclusions.")
    report: dict[str, Any] = {
        "totalRecordings": len(rows),
        "eligibleRecordings": len(eligible),
        "excludedRecordings": len(rows) - len(eligible),
        "exclusionReasons": dict(exclusion_reasons),
        "krippendorffAlphaNominal": alpha,
        "minimumAlpha": minimum_alpha,
        "coverage": {field: dict(values) for field, values in coverage.items()},
        "retentionByGroup": retention,
        "filterAudit": {
            "vadOutcomes": dict(Counter(row["vad_outcome"].strip().lower() for row in rows)),
            "clippingOutcomes": dict(Counter(row["clipping_outcome"].strip().lower() for row in rows)),
            "biasFlags": bias_flags,
        },
        "taskId": task_config.task_id,
        "taskName": task_config.task_name,
        "normalization": {"unicode": "NFKC", "labels": sorted(task_config.labels), "terminalPunctuation": True, "groundTruthComparison": "case_and_punctuation_insensitive_ordered_tokens"},
        "workflowVersion": task_config.version,
        "groundTruthAlignment": {
            "classifierRole": "caller",
            "receiverDialogueUsage": "context_only",
            "meanExpectedTranscriptOverlapByClass": {
                label: sum(values) / len(values) for label, values in alignment_scores.items()
            },
            "possibleReceiverTurnCount": 0,
        },
    }
    return eligible, report


def write_report(report: dict[str, Any], output_path: Path) -> None:
    output_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a consent-gated speech-task curation manifest.")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--config", type=Path, help="Versioned task configuration JSON.")
    parser.add_argument("--report", type=Path, default=Path("curation_report.json"))
    parser.add_argument("--minimum-alpha", type=float, default=0.8)
    args = parser.parse_args()
    eligible, report = validate_manifest(args.manifest.resolve(), args.minimum_alpha, load_task_config(args.config))
    write_report(report, args.report.resolve())
    print(json.dumps({"eligibleRecordings": len(eligible), "report": str(args.report.resolve())}, indent=2))


if __name__ == "__main__":
    main()
