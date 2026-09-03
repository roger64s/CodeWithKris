import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import joblib
import numpy as np

from ml.train import EXPECTED_LABELS, train
from ml.task_config import load_task_config
from ml.workflow import WORKFLOW_BY_LABEL, WORKFLOW_SEQUENCE


class TrainingPipelineTests(unittest.TestCase):
    def test_writes_two_layer_model_and_measured_evaluation(self) -> None:
        random = np.random.default_rng(42)
        labels = list(WORKFLOW_SEQUENCE)
        inputs = np.vstack([
            random.normal(index * 4, 0.05, size=(5, 78))
            for index, _ in enumerate(labels)
        ]).astype(np.float32)
        targets = np.asarray([label for label in labels for _ in range(5)])
        speakers = np.asarray([f"speaker-{index}" for _ in labels for index in range(5)])
        workflow_records = [
            {
                "conversationId": f"conversation-{speaker_index}",
                "turnIndex": WORKFLOW_BY_LABEL[label]["sequence"],
                "responseBlock": WORKFLOW_BY_LABEL[label]["responseBlock"],
            }
            for label in labels
            for speaker_index in range(5)
        ]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            with patch("ml.train.load_dataset", return_value=(inputs, targets, speakers, workflow_records, {"krippendorffAlphaNominal": 1.0})):
                metrics = train(Path("unused.csv"), output)
            bundle = joblib.load(output / "model.joblib")
            self.assertEqual(bundle["pipeline"]["mlp"].hidden_layer_sizes, (128, 64))
            self.assertEqual(bundle["taskConfig"]["taskId"], "appointment-fixing")
            self.assertEqual(metrics["trainingSamples"], 16)
            self.assertEqual(metrics["testSamples"], 4)
            self.assertTrue((output / "metrics.json").exists())
            self.assertTrue((output / "curation_report.json").exists())
            self.assertGreaterEqual(metrics["accuracy"], 0)
            self.assertLessEqual(metrics["accuracy"], 1)
            self.assertEqual(set(metrics["perClass"]), EXPECTED_LABELS)
            self.assertGreaterEqual(metrics["classifierLatencyMs"]["p50"], 0)
            self.assertGreaterEqual(metrics["classifierLatencyMs"]["p95"], metrics["classifierLatencyMs"]["p50"])
            self.assertEqual(metrics["workflowEvaluation"]["evaluatedConversations"], 1)
            self.assertEqual(metrics["workflowEvaluation"]["evaluatedTransitions"], 3)

    def test_trains_with_non_appointment_classes(self) -> None:
        config = load_task_config(Path(__file__).with_name("task_configs") / "customer-service.json")
        random = np.random.default_rng(7)
        inputs = np.vstack([random.normal(index * 4, 0.05, size=(5, 78)) for index, _ in enumerate(config.sequence)]).astype(np.float32)
        targets = np.asarray([label for label in config.sequence for _ in range(5)])
        speakers = np.asarray([f"speaker-{index}" for _ in config.sequence for index in range(5)])
        records = [
            {
                "conversationId": f"conversation-{speaker_index}",
                "turnIndex": config.states_by_label[label]["sequence"],
                "responseBlock": config.states_by_label[label]["responseBlock"],
            }
            for label in config.sequence
            for speaker_index in range(5)
        ]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            with patch("ml.train.load_dataset", return_value=(inputs, targets, speakers, records, {"filterAudit": {"biasFlags": []}})):
                metrics = train(Path("unused.csv"), output, config)
            bundle = joblib.load(output / "model.joblib")
            self.assertEqual(metrics["taskId"], "customer-service")
            self.assertEqual(set(metrics["perClass"]), config.labels)
            self.assertEqual(bundle["classes"], list(config.sequence))


if __name__ == "__main__":
    unittest.main()