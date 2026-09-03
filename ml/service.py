from __future__ import annotations

import os
import json
import re
import tempfile
from functools import lru_cache
from pathlib import Path
from time import perf_counter
from typing import Any

import joblib
from fastapi import FastAPI, File, Form, Header, HTTPException, Query, UploadFile

from .audio_features import extract_mfcc
from .task_config import task_config_from_dict
from .workflow import evaluate_turn_taking, prediction_context

app = FastAPI(title="CodeWithKris Speech Task Inference", version="1.0.0")
MODEL_ROOT = Path(os.getenv("ML_MODEL_ROOT", Path(__file__).parent / "artifacts"))
DEFAULT_TASK_ID = os.getenv("ML_DEFAULT_TASK_ID", "appointment-fixing")


def artifact_path(task_id: str, filename: str) -> Path:
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", task_id):
        raise ValueError("task_id must be a lowercase kebab-case identifier.")
    return MODEL_ROOT / task_id / filename


@lru_cache(maxsize=8)
def load_model(task_id: str) -> dict[str, Any]:
    model_path = artifact_path(task_id, "model.joblib")
    if not model_path.exists():
        raise FileNotFoundError(f"No trained model artifact is available for task '{task_id}'.")
    bundle = joblib.load(model_path)
    task_config = task_config_from_dict(bundle["taskConfig"])
    if task_config.task_id != task_id:
        raise ValueError("Model artifact task configuration does not match its registry path.")
    return bundle


def diarize(audio_bytes: bytes, suffix: str, expected_speaker_count: int) -> dict[str, Any] | None:
    model_name = os.getenv("DIARIZATION_MODEL")
    token = os.getenv("HF_TOKEN")
    if not model_name or not token:
        return None
    try:
        from pyannote.audio import Pipeline as DiarizationPipeline
    except ImportError as error:
        raise RuntimeError("Diarization dependencies are not installed.") from error
    started_at = perf_counter()
    pipeline = DiarizationPipeline.from_pretrained(model_name, use_auth_token=token)
    with tempfile.NamedTemporaryFile(suffix=suffix) as audio_file:
        audio_file.write(audio_bytes)
        audio_file.flush()
        result = pipeline(audio_file.name)
    segments = [
        {"speaker": speaker, "startSeconds": float(turn.start), "endSeconds": float(turn.end)}
        for turn, _, speaker in result.itertracks(yield_label=True)
    ]
    return {
        **evaluate_turn_taking(segments, expected_speaker_count),
        "segments": segments,
        "latencyMs": round((perf_counter() - started_at) * 1000, 2),
        "modelReference": model_name,
    }


@app.get("/health")
def health() -> dict[str, object]:
    available_tasks = sorted(path.parent.name for path in MODEL_ROOT.glob("*/model.joblib"))
    return {"ok": True, "availableTasks": available_tasks}


@app.get("/metrics")
def metrics(task_id: str = Query(default=DEFAULT_TASK_ID), x_api_key: str = Header(default="")) -> dict[str, object]:
    expected_key = os.getenv("ML_SERVICE_API_KEY")
    if not expected_key or x_api_key != expected_key:
        raise HTTPException(status_code=401, detail="Valid internal service credentials are required.")
    try:
        metrics_path = artifact_path(task_id, "metrics.json")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not metrics_path.exists():
        raise HTTPException(status_code=503, detail=f"No measured evaluation artifact is available for task '{task_id}'.")
    return json.loads(metrics_path.read_text(encoding="utf-8"))


@app.post("/infer")
async def infer(
    audio: UploadFile = File(...),
    task_id: str = Form(...),
    expected_state: str | None = Form(default=None),
    expected_speaker_count: int | None = Form(default=None),
    x_api_key: str = Header(default=""),
) -> dict[str, object]:
    expected_key = os.getenv("ML_SERVICE_API_KEY")
    if not expected_key or x_api_key != expected_key:
        raise HTTPException(status_code=401, detail="Valid internal service credentials are required.")
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio file is required.")
    try:
        model_bundle = load_model(task_id)
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    started_at = perf_counter()
    try:
        task_config = task_config_from_dict(model_bundle["taskConfig"])
        if task_id != task_config.task_id:
            raise ValueError(f"Loaded model supports task '{task_config.task_id}', not '{task_id}'.")
        features = extract_mfcc(audio_bytes, task_config.feature_config).reshape(1, -1)
        pipeline = model_bundle["pipeline"]
        probabilities = pipeline.predict_proba(features)[0]
        best_index = int(probabilities.argmax())
        label = str(pipeline.classes_[best_index])
        confidence = float(probabilities[best_index])
        inference_latency_ms = round((perf_counter() - started_at) * 1000, 2)
        suffix = Path(audio.filename or "recording.webm").suffix or ".webm"
        state = prediction_context(label, expected_state, task_config)
        configured_speaker_count = int(task_config.source.get("expectedSpeakerCount", 1))
        diarization = diarize(audio_bytes, suffix, expected_speaker_count or configured_speaker_count)
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Audio analysis failed: {error}") from error
    return {
        "label": label,
        "confidence": confidence,
        "latencyMs": inference_latency_ms,
        "modelVersion": model_bundle["modelVersion"],
        "isFinal": True,
        "workflow": state,
        "diarization": diarization,
    }
