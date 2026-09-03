from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_CONFIG_PATH = Path(__file__).with_name("task_configs") / "appointment-fixing.json"


@dataclass(frozen=True)
class TaskConfig:
    source: dict[str, Any]

    @property
    def task_id(self) -> str:
        return str(self.source["taskId"])

    @property
    def task_name(self) -> str:
        return str(self.source["taskName"])

    @property
    def version(self) -> str:
        return str(self.source["version"])

    @property
    def states(self) -> tuple[dict[str, Any], ...]:
        return tuple(self.source["states"])

    @property
    def sequence(self) -> tuple[str, ...]:
        return tuple(str(state["label"]) for state in self.states)

    @property
    def labels(self) -> frozenset[str]:
        return frozenset(self.sequence)

    @property
    def states_by_label(self) -> dict[str, dict[str, Any]]:
        return {str(state["label"]): state for state in self.states}

    @property
    def feature_config(self) -> dict[str, Any]:
        return dict(self.source["features"])

    @property
    def model_config(self) -> dict[str, Any]:
        return dict(self.source["model"])

    @property
    def evaluation_config(self) -> dict[str, Any]:
        return dict(self.source["evaluation"])

    def to_dict(self) -> dict[str, Any]:
        return self.source


def validate_task_config(source: dict[str, Any]) -> TaskConfig:
    required = {"schemaVersion", "taskId", "taskName", "version", "features", "model", "evaluation", "states"}
    missing = required.difference(source)
    if missing:
        raise ValueError(f"Task configuration is missing fields: {', '.join(sorted(missing))}")
    if source["schemaVersion"] != 1:
        raise ValueError("Unsupported task configuration schemaVersion.")
    if not isinstance(source["taskId"], str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", source["taskId"]):
        raise ValueError("taskId must be a lowercase kebab-case identifier.")
    if not str(source["taskName"]).strip() or not str(source["version"]).strip():
        raise ValueError("taskName and version must be non-empty.")
    if not isinstance(source.get("expectedSpeakerCount", 1), int) or source.get("expectedSpeakerCount", 1) < 1:
        raise ValueError("expectedSpeakerCount must be a positive integer.")
    states = source["states"]
    if not isinstance(states, list) or len(states) < 2:
        raise ValueError("Task configuration requires at least two workflow states.")
    labels = [str(state.get("label", "")) for state in states]
    blocks = [str(state.get("responseBlock", "")) for state in states]
    if any(not value for value in labels + blocks) or len(set(labels)) != len(labels) or len(set(blocks)) != len(blocks):
        raise ValueError("Workflow labels and response blocks must be non-empty and unique.")
    expected_sequences = list(range(1, len(states) + 1))
    if [state.get("sequence") for state in states] != expected_sequences:
        raise ValueError("Workflow state sequences must be contiguous and ordered from 1.")
    for index, state in enumerate(states):
        for field in ("expectedResult", "receiverDialogue", "responseBlock"):
            if not str(state.get(field, "")).strip():
                raise ValueError(f"Workflow state {labels[index]} requires {field}.")
        expected_next = labels[index + 1] if index + 1 < len(labels) else None
        if state.get("nextState") != expected_next:
            raise ValueError(f"Workflow state {labels[index]} must transition to {expected_next!r}.")
    features = source["features"]
    for field in ("sampleRate", "mfccCount", "nFft", "hopLength", "nMels"):
        if not isinstance(features.get(field), int) or features[field] <= 0:
            raise ValueError(f"Feature parameter {field} must be a positive integer.")
    hidden_layers = source["model"].get("hiddenLayerSizes")
    if not isinstance(hidden_layers, list) or len(hidden_layers) != 2 or any(not isinstance(size, int) or size <= 0 for size in hidden_layers):
        raise ValueError("The baseline model requires exactly two positive hidden-layer sizes.")
    evaluation = source["evaluation"]
    if evaluation.get("folds") != 5 or evaluation.get("testFraction") != 0.2:
        raise ValueError("The baseline evaluation contract requires five folds and a 0.2 test fraction.")
    for field in ("randomState", "minimumSamplesPerClass", "minimumDistinctSpeakersPerClass"):
        if not isinstance(evaluation.get(field), int):
            raise ValueError(f"Evaluation parameter {field} must be an integer.")
    if evaluation["minimumSamplesPerClass"] < 1 or evaluation["minimumDistinctSpeakersPerClass"] < 1:
        raise ValueError("Evaluation coverage thresholds must be positive.")
    return TaskConfig(source)


def load_task_config(path: Path | str | None = None) -> TaskConfig:
    configured_path = Path(path or os.getenv("TASK_CONFIG_PATH", DEFAULT_CONFIG_PATH))
    return validate_task_config(json.loads(configured_path.read_text(encoding="utf-8")))


def task_config_from_dict(source: dict[str, Any]) -> TaskConfig:
    return validate_task_config(source)


DEFAULT_TASK_CONFIG = load_task_config()