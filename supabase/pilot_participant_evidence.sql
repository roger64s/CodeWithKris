-- Apply after schema.sql, rbac_access_control.sql, action_based_evaluation.sql,
-- and gtm_pilot_workflow.sql.
-- Participant-owned attempts, human-reviewed communication evidence, and OVU provenance.

create table if not exists public.participant_scripts (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references public.gtm_projects(id) on delete set null,
  pathway text not null check (pathway in ('Lead Generation', 'Appointment Fixing', 'Follow-Up Management', 'Customer Service')),
  title text not null check (length(trim(title)) between 1 and 160),
  prompt text not null check (length(trim(prompt)) between 1 and 4000),
  expected_outcome text not null default '',
  rubric_version text not null default 'communication-v1',
  created_at timestamptz not null default now()
);

create table if not exists public.participant_attempts (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  script_id uuid not null references public.participant_scripts(id) on delete restrict,
  recording_id uuid references public.recordings(id) on delete set null,
  practice_session_id uuid references public.practice_sessions(id) on delete set null,
  response_text text not null default '',
  adaptation_context text not null default '',
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'reviewed')),
  created_at timestamptz not null default now()
);

create table if not exists public.participant_metric_reviews (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.participant_attempts(id) on delete cascade,
  reviewer_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  rubric_version text not null default 'communication-v1',
  clarity_score integer not null check (clarity_score between 1 and 5),
  adaptability_score integer not null check (adaptability_score between 1 and 5),
  engagement_score integer not null check (engagement_score between 1 and 5),
  task_outcome text not null check (task_outcome in ('incomplete', 'progressing', 'complete')),
  evidence_notes text not null check (length(trim(evidence_notes)) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique (attempt_id, reviewer_id)
);

create table if not exists public.participant_ovu_links (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.participant_attempts(id) on delete cascade,
  ovu_contribution_id uuid unique references public.ovu_contributions(id) on delete set null,
  approved_ovu numeric check (approved_ovu is null or approved_ovu >= 0),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'verified')),
  created_at timestamptz not null default now(),
  check (status <> 'verified' or (approved_ovu is not null and verified_by is not null and verified_at is not null))
);

create index if not exists participant_attempts_participant_created_idx
  on public.participant_attempts(participant_id, created_at desc);
create index if not exists participant_metric_reviews_attempt_idx
  on public.participant_metric_reviews(attempt_id, created_at desc);

alter table public.participant_scripts enable row level security;
alter table public.participant_attempts enable row level security;
alter table public.participant_metric_reviews enable row level security;
alter table public.participant_ovu_links enable row level security;

drop policy if exists "Participants manage own scripts" on public.participant_scripts;
create policy "Participants manage own scripts" on public.participant_scripts
  for all to authenticated using (participant_id = auth.uid()) with check (participant_id = auth.uid());

drop policy if exists "Participants manage own attempts" on public.participant_attempts;
create policy "Participants manage own attempts" on public.participant_attempts
  for all to authenticated using (participant_id = auth.uid()) with check (participant_id = auth.uid());

drop policy if exists "Participants read own reviews" on public.participant_metric_reviews;
create policy "Participants read own reviews" on public.participant_metric_reviews
  for select to authenticated using (
    exists (select 1 from public.participant_attempts attempt
      where attempt.id = attempt_id and attempt.participant_id = auth.uid())
    or reviewer_id = auth.uid()
  );
drop policy if exists "Authorized reviewers record metrics" on public.participant_metric_reviews;
create policy "Authorized reviewers record metrics" on public.participant_metric_reviews
  for insert to authenticated with check (public.has_financial_access() and reviewer_id = auth.uid());

drop policy if exists "Participants read own OVU links" on public.participant_ovu_links;
create policy "Participants read own OVU links" on public.participant_ovu_links
  for select to authenticated using (
    exists (select 1 from public.participant_attempts attempt
      where attempt.id = attempt_id and attempt.participant_id = auth.uid())
    or public.has_financial_access()
  );
drop policy if exists "Authorized reviewers manage OVU links" on public.participant_ovu_links;
create policy "Authorized reviewers manage OVU links" on public.participant_ovu_links
  for all to authenticated using (public.has_financial_access()) with check (public.has_financial_access());

revoke all on public.participant_scripts, public.participant_attempts,
  public.participant_metric_reviews, public.participant_ovu_links from anon, authenticated;
grant select, insert, update, delete on public.participant_scripts, public.participant_attempts to authenticated;
grant select on public.participant_metric_reviews, public.participant_ovu_links to authenticated;
grant insert on public.participant_metric_reviews, public.participant_ovu_links to authenticated;
grant update on public.participant_ovu_links to authenticated;