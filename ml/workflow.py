from __future__ import annotations

from typing import Any

from .task_config import DEFAULT_TASK_CONFIG, TaskConfig

WORKFLOW = DEFAULT_TASK_CONFIG.to_dict()
WORKFLOW_SEQUENCE = DEFAULT_TASK_CONFIG.sequence
WORKFLOW_BY_LABEL = DEFAULT_TASK_CONFIG.states_by_label
EXPECTED_LABELS = set(DEFAULT_TASK_CONFIG.labels)


def prediction_context(predicted_label: str, expected_label: str | None = None, task_config: TaskConfig = DEFAULT_TASK_CONFIG) -> dict[str, object]:
    states_by_label = task_config.states_by_label
    if predicted_label not in states_by_label:
        raise ValueError(f"Unknown workflow state: {predicted_label}")
    if expected_label is not None and expected_label not in states_by_label:
        raise ValueError(f"Unknown expected workflow state: {expected_label}")
    state = states_by_label[predicted_label]
    return {
        "taskId": task_config.task_id,
        "taskName": task_config.task_name,
        "workflowVersion": task_config.version,
        "sequence": state["sequence"],
        "responseBlock": state["responseBlock"],
        "nextState": state["nextState"],
        "matchesExpectedState": expected_label is None or predicted_label == expected_label,
    }


def evaluate_turn_taking(segments: list[dict[str, Any]], expected_speaker_count: int) -> dict[str, object]:
    speakers = [str(segment["speaker"]) for segment in segments]
    compressed = [speaker for index, speaker in enumerate(speakers) if index == 0 or speaker != speakers[index - 1]]
    speaker_count = len(set(speakers))
    return {
        "speakerCount": speaker_count,
        "expectedSpeakerCount": expected_speaker_count,
        "matchesExpectedSpeakerCount": speaker_count == expected_speaker_count,
        "turnCount": len(compressed),
        "speakerChanges": max(0, len(compressed) - 1),
        "speakerOrder": compressed,
    }