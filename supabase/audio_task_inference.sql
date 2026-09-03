-- Apply after audio_recording_history.sql.
-- Stores only measured outputs from a versioned speech-task model.

alter table public.recordings add column if not exists analysis_status text not null default 'unavailable';
alter table public.recordings add column if not exists task_id text;
alter table public.recordings add column if not exists task_config_version text;
alter table public.recordings add column if not exists expected_subtask text;
alter table public.recordings add column if not exists model_training_consent boolean not null default false;
alter table public.recordings add column if not exists predicted_subtask text;
alter table public.recordings add column if not exists prediction_confidence numeric;
alter table public.recordings add column if not exists inference_latency_ms numeric;
alter table public.recordings add column if not exists inference_model_version text;
alter table public.recordings add column if not exists workflow_version text;
alter table public.recordings add column if not exists predicted_response_block text;
alter table public.recordings add column if not exists workflow_state_match boolean;
alter table public.recordings add column if not exists diarization jsonb;

alter table public.recordings drop constraint if exists recordings_analysis_status_check;
alter table public.recordings add constraint recordings_analysis_status_check
  check (analysis_status in ('completed', 'unavailable', 'failed'));

alter table public.recordings drop constraint if exists recordings_predicted_subtask_check;
alter table public.recordings drop constraint if exists recordings_expected_subtask_check;
alter table public.recordings drop constraint if exists recordings_predicted_response_block_check;

update public.recordings
set task_id = lower(trim(both '-' from regexp_replace(template, '[^a-zA-Z0-9]+', '-', 'g'))),
    task_config_version = coalesce(task_config_version, workflow_version)
where analysis_status = 'completed' and task_id is null;

alter table public.recordings drop constraint if exists recordings_task_id_format_check;
alter table public.recordings add constraint recordings_task_id_format_check
  check (task_id is null or task_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

alter table public.recordings drop constraint if exists recordings_dynamic_state_values_check;
alter table public.recordings add constraint recordings_dynamic_state_values_check
  check (
    (expected_subtask is null or length(trim(expected_subtask)) > 0)
    and (predicted_subtask is null or length(trim(predicted_subtask)) > 0)
    and (predicted_response_block is null or length(trim(predicted_response_block)) > 0)
  );

alter table public.recordings drop constraint if exists recordings_task_mapping_check;
alter table public.recordings add constraint recordings_task_mapping_check
  check (
    analysis_status <> 'completed'
    or (task_id is not null and task_config_version is not null and predicted_subtask is not null)
  );

alter table public.recordings drop constraint if exists recordings_prediction_confidence_check;
alter table public.recordings add constraint recordings_prediction_confidence_check
  check (prediction_confidence is null or prediction_confidence between 0 and 1);

alter table public.recordings drop constraint if exists recordings_inference_latency_check;
alter table public.recordings add constraint recordings_inference_latency_check
  check (inference_latency_ms is null or inference_latency_ms >= 0);

create index if not exists recordings_task_config_created_idx
  on public.recordings (task_id, task_config_version, created_at desc);