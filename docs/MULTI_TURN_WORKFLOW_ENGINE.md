# Generalized Multi-Turn Workflow Engine

## Refactoring plan

1. Configuration: define each task, state sequence, transition, response block, acoustic feature settings, MLP settings, and evaluation thresholds in versioned JSON validated by `ml/task_config.schema.json` and `ml/task_config.py`.
2. Curation: pass one active `TaskConfig` into manifest validation. Require matching `task_id`, reviewed dynamic labels, exact configured turn order, consent, reviewer agreement, and caller/Receiver separation.
3. Training: derive feature dimensions, class order, the two hidden-layer sizes, grouped split seed, minimum coverage, transition metrics, and artifact identity from the active configuration.
4. Serving: embed the full validated configuration in each model artifact and route requests through `artifacts/<task-id>/model.joblib`. Reject task/artifact mismatches.
5. Persistence: store `task_id` and `task_config_version`; validate dynamic labels and response blocks in application code while SQL enforces universal format, provenance, confidence, and latency invariants.

## Adding a task

1. Copy a configuration under `ml/task_configs/` and assign a unique kebab-case `taskId` and immutable `version`.
2. Define at least two ordered states. Labels and response blocks must be unique; every `nextState` must point to the following state and the final state must use `null`.
3. Build a private reviewed manifest whose `task_id`, labels, turn indexes, expected results, and response blocks match the configuration.
4. Run curation and training with the same `--config` path.
5. Deploy the generated directory under `ML_MODEL_ROOT` and apply `supabase/audio_task_inference.sql`.

## Compatibility

Existing Appointment Fixing behavior is represented by `ml/task_configs/appointment-fixing.json`. Legacy `appointment_mlp.joblib` artifacts must be retrained or repackaged because generalized serving requires the embedded `taskConfig` and the `artifacts/<task-id>/model.joblib` layout. Existing analyzed database rows are backfilled from their template and workflow version by the repeatable migration.