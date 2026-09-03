-- Apply after supabase/schema.sql.
-- Durable audio provenance, transcription, and transcript-derived progress evidence.

alter table public.recordings add column if not exists source_type text not null default 'recorded';
alter table public.recordings add column if not exists original_filename text;
alter table public.recordings add column if not exists reference_phrase text not null default '';
alter table public.recordings add column if not exists transcript text not null default '';
alter table public.recordings add column if not exists transcription_status text not null default 'unavailable';
alter table public.recordings add column if not exists transcription_model_reference text;
alter table public.recordings add column if not exists transcript_match integer;

alter table public.recordings drop constraint if exists recordings_source_type_check;
alter table public.recordings add constraint recordings_source_type_check
  check (source_type in ('recorded', 'uploaded'));

alter table public.recordings drop constraint if exists recordings_transcription_status_check;
alter table public.recordings add constraint recordings_transcription_status_check
  check (transcription_status in ('completed', 'unavailable', 'failed'));

alter table public.recordings drop constraint if exists recordings_transcript_match_check;
alter table public.recordings add constraint recordings_transcript_match_check
  check (transcript_match between 0 and 100);