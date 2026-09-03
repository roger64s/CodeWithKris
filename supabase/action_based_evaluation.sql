-- Apply after supabase/project_operations.sql.
-- Inclusion-first action trials, learner intent, and formative pod evidence.

create table if not exists public.learner_action_trials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pathway text not null check (pathway in ('Lead Generation', 'Appointment Fixing', 'Follow-Up Management', 'Customer Service')),
  goal text not null,
  availability text not null,
  passion_areas text[] not null default '{}',
  scenario_key text not null,
  first_approach text not null,
  assistant_question text not null,
  assistant_response text not null default '',
  assistant_model_reference text,
  iteration_reflection text not null,
  support_preference text not null default '',
  status text not null default 'completed' check (status in ('in_progress', 'completed')),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (status <> 'completed' or completed_at is not null)
);

alter table public.learner_action_trials add column if not exists assistant_response text not null default '';
alter table public.learner_action_trials add column if not exists assistant_model_reference text;
alter table public.learner_action_trials drop constraint if exists learner_action_trials_pathway_check;
alter table public.learner_action_trials add constraint learner_action_trials_pathway_check
  check (pathway in (
    'Lead Generation', 'Appointment Fixing', 'Follow-Up Management', 'Customer Service',
    'Frontend', 'Backend', 'DevOps'
  ));

alter table public.peer_review_submissions drop constraint if exists peer_review_submissions_track_check;
alter table public.peer_review_submissions add constraint peer_review_submissions_track_check
  check (track in (
    'Lead Generation', 'Appointment Fixing', 'Follow-Up Management', 'Customer Service',
    'Frontend', 'Backend', 'DevOps'
  ));

create table if not exists public.learning_pod_progress_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  learner_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'mentorship_engagement', 'tool_utilization', 'collaboration', 'iteration', 'reflection'
  )),
  evidence_summary text not null check (length(trim(evidence_summary)) between 1 and 1000),
  sprint_task_id uuid references public.sprint_tasks(id) on delete set null,
  source_type text,
  source_id text,
  recorded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default now()
);

create unique index if not exists learning_pod_progress_source_idx
  on public.learning_pod_progress_events(workspace_id, learner_user_id, source_type, source_id, event_type)
  nulls not distinct;

create index if not exists learning_pod_progress_learner_idx
  on public.learning_pod_progress_events(workspace_id, learner_user_id, occurred_at desc);

create or replace function public.record_learning_pod_progress(
  workspace_id_input uuid,
  learner_user_id_input uuid,
  event_type_input text,
  evidence_summary_input text,
  sprint_task_id_input uuid default null
) returns public.learning_pod_progress_events
language plpgsql security definer set search_path = '' as $$
declare created_event public.learning_pod_progress_events%rowtype;
begin
  if not public.has_requirement_workspace_access(workspace_id_input) then
    raise exception 'Workspace membership required';
  end if;
  if learner_user_id_input <> auth.uid()
    and not public.has_requirement_workspace_access(workspace_id_input, array['owner', 'editor']) then
    raise exception 'Only the learner or a workspace editor may record progress evidence';
  end if;
  if event_type_input not in ('mentorship_engagement', 'tool_utilization', 'collaboration', 'iteration', 'reflection') then
    raise exception 'Unsupported progress event type';
  end if;
  if sprint_task_id_input is not null and not exists (
    select 1 from public.sprint_tasks task
    where task.id = sprint_task_id_input and task.workspace_id = workspace_id_input
  ) then raise exception 'Sprint task must belong to the same workspace'; end if;

  insert into public.learning_pod_progress_events (
    workspace_id, learner_user_id, event_type, evidence_summary, sprint_task_id
  ) values (
    workspace_id_input, learner_user_id_input, event_type_input,
    trim(evidence_summary_input), sprint_task_id_input
  ) returning * into created_event;
  return created_event;
end;
$$;

create or replace function public.capture_sprint_formative_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare learner_id uuid;
declare formative_type text;
begin
  if new.event_type not in ('started', 'submitted', 'approved', 'reopened') then return new; end if;
  select task.assignee_user_id into learner_id from public.sprint_tasks task where task.id = new.task_id;
  if learner_id is null then return new; end if;
  formative_type := case
    when new.event_type = 'started' then 'tool_utilization'
    when new.event_type = 'reopened' then 'iteration'
    else 'collaboration'
  end;
  insert into public.learning_pod_progress_events (
    workspace_id, learner_user_id, event_type, evidence_summary, sprint_task_id,
    source_type, source_id, recorded_by, occurred_at
  ) values (
    new.workspace_id, learner_id, formative_type,
    'Sprint task ' || replace(new.event_type, '_', ' ') || ': ' || coalesce(nullif(new.notes, ''), new.task_id::text),
    new.task_id, 'sprint_task_event', new.id::text, new.actor_user_id, new.occurred_at
  ) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists capture_sprint_formative_progress on public.sprint_task_events;
create trigger capture_sprint_formative_progress after insert on public.sprint_task_events
for each row execute function public.capture_sprint_formative_progress();

create or replace function public.capture_mentor_formative_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare learner_id uuid;
begin
  if new.review_type <> 'mentor' or new.sprint_task_id is null then return new; end if;
  select task.assignee_user_id into learner_id from public.sprint_tasks task where task.id = new.sprint_task_id;
  if learner_id is null then return new; end if;
  insert into public.learning_pod_progress_events (
    workspace_id, learner_user_id, event_type, evidence_summary, sprint_task_id,
    source_type, source_id, recorded_by, occurred_at
  ) values (
    new.workspace_id, learner_id, 'mentorship_engagement',
    'Mentor review ' || replace(new.outcome, '_', ' ') || ': ' || coalesce(nullif(new.notes, ''), new.id::text),
    new.sprint_task_id, 'project_delivery_review', new.id::text, new.reviewed_by, new.reviewed_at
  ) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists capture_mentor_formative_progress on public.project_delivery_reviews;
create trigger capture_mentor_formative_progress after insert on public.project_delivery_reviews
for each row execute function public.capture_mentor_formative_progress();

create or replace function public.require_action_evidence_for_match()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.decision = 'matched' and (tg_op = 'INSERT' or old.decision is distinct from new.decision) then
    if not exists (
      select 1 from public.learner_action_trials trial
      where trial.user_id = new.candidate_id and trial.status = 'completed'
    ) then raise exception 'A completed practical action trial is required before matching'; end if;
    if new.reviewed_by is null or new.reviewed_at is null then
      raise exception 'A person must review practical evidence before matching';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists require_action_evidence_for_match on public.project_candidate_assessments;
create trigger require_action_evidence_for_match
before insert or update of decision on public.project_candidate_assessments
for each row execute function public.require_action_evidence_for_match();

alter table public.learner_action_trials enable row level security;
alter table public.learning_pod_progress_events enable row level security;

drop policy if exists "Learners manage own action trial" on public.learner_action_trials;
create policy "Learners manage own action trial" on public.learner_action_trials
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Pod members read progress evidence" on public.learning_pod_progress_events;
create policy "Pod members read progress evidence" on public.learning_pod_progress_events
for select to authenticated using (public.has_requirement_workspace_access(workspace_id));

revoke all on public.learner_action_trials, public.learning_pod_progress_events from anon, authenticated;
grant select, insert, update on public.learner_action_trials to authenticated;
grant select on public.learning_pod_progress_events to authenticated;
revoke all on function public.record_learning_pod_progress(uuid, uuid, text, text, uuid) from public;
grant execute on function public.record_learning_pod_progress(uuid, uuid, text, text, uuid) to authenticated;
revoke all on function public.capture_sprint_formative_progress() from public;
revoke all on function public.capture_mentor_formative_progress() from public;
revoke all on function public.require_action_evidence_for_match() from public;
