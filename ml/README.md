# Speech Task Baseline

This service implements a configurable, measured baseline for multi-turn commercial speech tasks. It does not include trained models or publish benchmark values. Training refuses recordings without affirmative consent and enforces the sample and speaker thresholds in the active task configuration.

`task_config.schema.json` defines the configuration contract. Versioned configurations for Appointment Fixing, Lead Generation, Follow-Up Management, and Customer Service live under `task_configs/`. Each configuration owns its class sequence, transitions, reviewed caller results, response blocks, Receiver context, acoustic parameters, two hidden-layer sizes, and evaluation settings. The classifier learns caller turns only.

## Dataset

Create a private CSV using `manifest.example.csv`. Set every row's `task_id` to the active configuration's `taskId`; labels and transitions are validated from that configuration. Do not commit raw participant audio, names, health information, consent forms, or completed manifests.

Validate reviewer agreement, consent, normalized labels, quality scales, and filtering retention before training:

```powershell
.venv\Scripts\python -m ml.curation path\to\private-manifest.csv --config ml\task_configs\customer-service.json --report path\to\curation_report.json
```

## Train and evaluate

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r ml\requirements.txt
.venv\Scripts\python -m ml.train path\to\private-manifest.csv --config ml\task_configs\customer-service.json
```

The command performs a speaker-disjoint stratified 80/20 split and writes `model.joblib`, `metrics.json`, and `curation_report.json` under `ml/artifacts/<task-id>/`. The model bundle embeds the exact task configuration and feature parameters. Metrics dynamically include every configured class plus response-block, adjacent-transition, complete-conversation, and classifier-latency results.

## Serve

```powershell
$env:ML_MODEL_ROOT = "ml\artifacts"
$env:ML_DEFAULT_TASK_ID = "appointment-fixing"
$env:ML_SERVICE_API_KEY = "replace-with-a-long-random-server-only-key"
.venv\Scripts\python -m uvicorn ml.service:app --host 127.0.0.1 --port 8001
```

Optional diarization uses `pyannote.audio`, `DIARIZATION_MODEL`, and `HF_TOKEN`. Its latency is reported separately and must be benchmarked on deployment hardware; it is not assumed to meet a 35 ms target.

Before recording inference in Supabase, apply `supabase/audio_task_inference.sql`. Recording history retains `task_id`, task configuration version, dynamic expected/predicted states, response block, expected-state match, and optional diarization evidence.