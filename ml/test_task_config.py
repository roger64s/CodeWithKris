import unittest
from pathlib import Path

from ml.task_config import load_task_config, validate_task_config
from ml.workflow import prediction_context


class TaskConfigurationTests(unittest.TestCase):
    def test_loads_every_commercial_track(self) -> None:
        config_dir = Path(__file__).with_name("task_configs")
        configs = [load_task_config(path) for path in sorted(config_dir.glob("*.json"))]
        self.assertEqual(
            {config.task_id for config in configs},
            {"appointment-fixing", "customer-service", "follow-up-management", "lead-generation"},
        )

    def test_non_appointment_config_drives_state_mapping(self) -> None:
        config = load_task_config(Path(__file__).with_name("task_configs") / "customer-service.json")
        context = prediction_context("ClarifyDetails", "ClarifyDetails", config)
        self.assertEqual(context["taskId"], "customer-service")
        self.assertEqual(context["responseBlock"], "ClarifyDetailsResponse")
        self.assertEqual(context["nextState"], "OfferResolution")

    def test_rejects_unsafe_task_identifier(self) -> None:
        source = load_task_config(Path(__file__).with_name("task_configs") / "customer-service.json").to_dict().copy()
        source["taskId"] = "../customer-service"
        with self.assertRaisesRegex(ValueError, "kebab-case"):
            validate_task_config(source)


if __name__ == "__main__":
    unittest.main()