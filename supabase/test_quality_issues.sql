-- Apply after supabase/sprint_task_board.sql.
-- Test case management, variant execution, evidence, and linked issue generation.

create unique index if not exists sprint_tasks_id_workspace_uidx
  on public.sprint_tasks(id, workspace_id);

create table if not exists public.quality_test_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  source_requirement_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 200),
  preconditions text not null default '',
  status text not null default 'draft' check (status in ('draft', 'ready', 'retired')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (source_requirement_id, workspace_id) references public.requirement_items(id, workspace_id) on delete restrict,
  unique (id, workspace_id)
);

create table if not exists public.quality_test_steps (
  id uuid primary key default gen_random_uuid(),
  test_case_id uuid not null references public.quality_test_cases(id) on delete cascade,
  step_number integer not null check (step_number > 0),
  action text not null check (length(trim(action)) > 0),
  expected_result text not null check (length(trim(expected_result)) > 0),
  notes text not null default '',
  unique (test_case_id, step_number),
  unique (id, test_case_id)
);

create table if not exists public.quality_test_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  test_case_id uuid not null,
  sprint_id uuid,
  task_id uuid,
  name text not null check (length(trim(name)) between 1 and 200),
  variants jsonb not null default '{}'::jsonb check (jsonb_typeof(variants) = 'object'),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'passed', 'failed', 'blocked')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (test_case_id, workspace_id) references public.quality_test_cases(id, workspace_id) on delete restrict,
  foreign key (sprint_id, workspace_id) references public.planning_sprints(id, workspace_id) on delete restrict,
  foreign key (task_id, workspace_id) references public.sprint_tasks(id, workspace_id) on delete restrict,
  unique (id, workspace_id)
);

create table if not exists public.quality_test_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.quality_test_runs(id) on delete cascade,
  source_step_id uuid not null references public.quality_test_steps(id) on delete restrict,
  step_number integer not null check (step_number > 0),
  action text not null,
  expected_result text not null,
  notes text not null default '',
  outcome text not null default 'not_run' check (outcome in ('not_run', 'passed', 'failed', 'blocked')),
  actual_result text not null default '',
  problem_statement text not null default '',
  attachment_paths text[] not null default '{}',
  executed_by uuid references auth.users(id) on delete set null,
  executed_at timestamptz,
  unique (run_id, step_number),
  unique (id, run_id),
  check (outcome <> 'failed' or (length(trim(problem_statement)) > 0 and cardinality(attachment_paths) > 0))
);

create table if not exists public.quality_issues (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  requirement_issue_id uuid not null,
  run_id uuid not null,
  run_step_id uuid not null unique,
  sprint_task_id uuid,
  severity text not null default 'high' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'triaged', 'in_progress', 'resolved', 'closed')),
  problem_statement text not null check (length(trim(problem_statement)) > 0),
  attachment_paths text[] not null check (cardinality(attachment_paths) > 0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (requirement_issue_id, workspace_id) references public.requirement_items(id, workspace_id) on delete restrict,
  foreign key (run_id, workspace_id) references public.quality_test_runs(id, workspace_id) on delete restrict,
  foreign key (run_step_id, run_id) references public.quality_test_run_steps(id, run_id) on delete restrict,
  foreign key (sprint_task_id, workspace_id) references public.sprint_tasks(id, workspace_id) on delete restrict
);

create index if not exists quality_test_cases_source_idx on public.quality_test_cases(workspace_id, source_requirement_id, status);
create index if not exists quality_test_runs_status_idx on public.quality_test_runs(workspace_id, status, created_at desc);
create index if not exists quality_issues_status_idx on public.quality_issues(workspace_id, status, severity, created_at desc);

create or replace function public.generate_quality_test_case(
  workspace_id_input uuid, source_requirement_id_input uuid, title_input text,
  preconditions_input text default '', steps_input jsonb default '[]'::jsonb
) returns public.quality_test_cases language plpgsql security definer set search_path = '' as $$
declare source_record public.requirement_items%rowtype;
declare case_record public.quality_test_cases%rowtype;
declare step_record jsonb;
declare step_index integer := 0;
begin
  if not public.has_requirement_workspace_access(workspace_id_input, array['owner', 'editor']) then raise exception 'Workspace editor access required'; end if;
  select * into source_record from public.requirement_items where id = source_requirement_id_input and workspace_id = workspace_id_input;
  if source_record.id is null or source_record.item_type not in ('feature', 'user_story') then raise exception 'Test cases can only be generated from a feature or user story'; end if;
  if length(trim(title_input)) = 0 or jsonb_typeof(steps_input) <> 'array' or jsonb_array_length(steps_input) = 0 then raise exception 'A title and at least one test step are required'; end if;
  insert into public.quality_test_cases (workspace_id, source_requirement_id, title, preconditions)
  values (workspace_id_input, source_requirement_id_input, trim(title_input), coalesce(preconditions_input, '')) returning * into case_record;
  for step_record in select value from jsonb_array_elements(steps_input) loop
    step_index := step_index + 1;
    if length(trim(coalesce(step_record->>'action', ''))) = 0 or length(trim(coalesce(step_record->>'expected_result', ''))) = 0 then raise exception 'Every step requires an action and expected result'; end if;
    insert into public.quality_test_steps (test_case_id, step_number, action, expected_result, notes)
    values (case_record.id, step_index, step_record->>'action', step_record->>'expected_result', coalesce(step_record->>'notes', ''));
  end loop;
  return case_record;
end;
$$;

create or replace function public.generate_quality_test_run(
  test_case_id_input uuid, name_input text, variants_input jsonb default '{}'::jsonb,
  sprint_id_input uuid default null, task_id_input uuid default null, assigned_to_input uuid default null
) returns public.quality_test_runs language plpgsql security definer set search_path = '' as $$
declare case_record public.quality_test_cases%rowtype;
declare run_record public.quality_test_runs%rowtype;
begin
  select * into case_record from public.quality_test_cases where id = test_case_id_input;
  if case_record.id is null or not public.has_requirement_workspace_access(case_record.workspace_id, array['owner', 'editor']) then raise exception 'Test case not found or editor access required'; end if;
  if jsonb_typeof(variants_input) <> 'object' then raise exception 'Run variants must be a JSON object'; end if;
  if assigned_to_input is not null and not exists (select 1 from public.requirement_workspace_members where workspace_id = case_record.workspace_id and user_id = assigned_to_input) then raise exception 'Assignee must be a registered workspace member'; end if;
  insert into public.quality_test_runs (workspace_id, test_case_id, sprint_id, task_id, name, variants, assigned_to)
  values (case_record.workspace_id, case_record.id, sprint_id_input, task_id_input, trim(name_input), variants_input, assigned_to_input) returning * into run_record;
  insert into public.quality_test_run_steps (run_id, source_step_id, step_number, action, expected_result, notes)
  select run_record.id, step.id, step.step_number, step.action, step.expected_result, step.notes
  from public.quality_test_steps step where step.test_case_id = case_record.id order by step.step_number;
  return run_record;
end;
$$;

create or replace function public.execute_quality_test_step(
  run_step_id_input uuid, outcome_input text, actual_result_input text default '',
  problem_statement_input text default '', attachment_paths_input text[] default '{}'
) returns public.quality_test_run_steps language plpgsql security definer set search_path = '' as $$
declare step_record public.quality_test_run_steps%rowtype;
declare run_record public.quality_test_runs%rowtype;
declare case_record public.quality_test_cases%rowtype;
declare issue_requirement_id uuid;
declare aggregate_status text;
begin
  select * into step_record from public.quality_test_run_steps where id = run_step_id_input for update;
  select * into run_record from public.quality_test_runs where id = step_record.run_id for update;
  if step_record.id is null or not public.has_requirement_workspace_access(run_record.workspace_id) then raise exception 'Run step not found'; end if;
  if run_record.assigned_to is not null and auth.uid() <> run_record.assigned_to and not public.has_requirement_workspace_access(run_record.workspace_id, array['owner', 'editor']) then raise exception 'Only the assigned tester or a workspace editor may execute this run'; end if;
  if outcome_input not in ('passed', 'failed', 'blocked') then raise exception 'Outcome must be passed, failed, or blocked'; end if;
  if outcome_input = 'failed' and (length(trim(coalesce(problem_statement_input, ''))) = 0 or cardinality(coalesce(attachment_paths_input, '{}')) = 0) then raise exception 'Failed steps require a problem statement and at least one attachment'; end if;
  if outcome_input = 'failed' and exists (
    select 1 from unnest(attachment_paths_input) as evidence(path)
    where length(trim(evidence.path)) = 0
      or evidence.path not like run_record.workspace_id::text || '/' || run_record.id::text || '/' || step_record.id::text || '/%'
      or not exists (
        select 1 from storage.objects object
        where object.bucket_id = 'quality-evidence' and object.name = evidence.path
          and object.owner_id = auth.uid()::text
      )
  ) then raise exception 'Every failure attachment must be uploaded to this workspace evidence bucket'; end if;
  update public.quality_test_run_steps set outcome = outcome_input, actual_result = coalesce(actual_result_input, ''),
    problem_statement = case when outcome_input = 'failed' then trim(problem_statement_input) else '' end,
    attachment_paths = case when outcome_input = 'failed' then attachment_paths_input else '{}' end,
    executed_by = auth.uid(), executed_at = now()
  where id = step_record.id returning * into step_record;
  if outcome_input = 'failed' and not exists (select 1 from public.quality_issues where run_step_id = step_record.id) then
    select * into case_record from public.quality_test_cases where id = run_record.test_case_id;
    insert into public.requirement_items (workspace_id, parent_id, item_type, title, content, status)
    values (run_record.workspace_id, case_record.source_requirement_id, 'issue', 'Defect: ' || left(step_record.action, 180),
      jsonb_build_object('type', 'doc', 'content', jsonb_build_array(jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', trim(problem_statement_input)))))), 'blocked')
    returning id into issue_requirement_id;
    insert into public.requirement_trace_links (workspace_id, source_item_id, target_item_id, link_type, rationale)
    values (run_record.workspace_id, case_record.source_requirement_id, issue_requirement_id, 'blocks', 'Auto-generated from failed test run') on conflict do nothing;
    insert into public.quality_issues (workspace_id, requirement_issue_id, run_id, run_step_id, problem_statement, attachment_paths)
    values (run_record.workspace_id, issue_requirement_id, run_record.id, step_record.id, trim(problem_statement_input), attachment_paths_input);
  end if;
  select case when bool_or(outcome = 'failed') then 'failed' when bool_or(outcome = 'blocked') then 'blocked'
    when bool_and(outcome = 'passed') then 'passed' else 'in_progress' end into aggregate_status
  from public.quality_test_run_steps where run_id = run_record.id;
  update public.quality_test_runs set status = aggregate_status,
    started_at = coalesce(started_at, now()),
    completed_at = case when not exists (select 1 from public.quality_test_run_steps pending where pending.run_id = run_record.id and pending.outcome = 'not_run') then now() else null end,
    updated_at = now() where id = run_record.id;
  return step_record;
end;
$$;

alter table public.quality_test_cases enable row level security;
alter table public.quality_test_steps enable row level security;
alter table public.quality_test_runs enable row level security;
alter table public.quality_test_run_steps enable row level security;
alter table public.quality_issues enable row level security;

drop policy if exists "Members read quality test cases" on public.quality_test_cases;
create policy "Members read quality test cases" on public.quality_test_cases for select to authenticated using (public.has_requirement_workspace_access(workspace_id));
drop policy if exists "Editors manage quality test cases" on public.quality_test_cases;
create policy "Editors manage quality test cases" on public.quality_test_cases for all to authenticated using (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor'])) with check (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));
drop policy if exists "Members read quality test steps" on public.quality_test_steps;
create policy "Members read quality test steps" on public.quality_test_steps for select to authenticated using (exists (select 1 from public.quality_test_cases test_case where test_case.id = test_case_id and public.has_requirement_workspace_access(test_case.workspace_id)));
drop policy if exists "Editors manage quality test steps" on public.quality_test_steps;
create policy "Editors manage quality test steps" on public.quality_test_steps for all to authenticated using (exists (select 1 from public.quality_test_cases test_case where test_case.id = test_case_id and public.has_requirement_workspace_access(test_case.workspace_id, array['owner', 'editor']))) with check (exists (select 1 from public.quality_test_cases test_case where test_case.id = test_case_id and public.has_requirement_workspace_access(test_case.workspace_id, array['owner', 'editor'])));
drop policy if exists "Members read quality test runs" on public.quality_test_runs;
create policy "Members read quality test runs" on public.quality_test_runs for select to authenticated using (public.has_requirement_workspace_access(workspace_id));
drop policy if exists "Members read quality run steps" on public.quality_test_run_steps;
create policy "Members read quality run steps" on public.quality_test_run_steps for select to authenticated using (exists (select 1 from public.quality_test_runs run where run.id = run_id and public.has_requirement_workspace_access(run.workspace_id)));
drop policy if exists "Members read quality issues" on public.quality_issues;
create policy "Members read quality issues" on public.quality_issues for select to authenticated using (public.has_requirement_workspace_access(workspace_id));
drop policy if exists "Editors update quality issues" on public.quality_issues;
create policy "Editors update quality issues" on public.quality_issues for update to authenticated using (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor'])) with check (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));

insert into storage.buckets (id, name, public) values ('quality-evidence', 'quality-evidence', false) on conflict (id) do update set public = false;
drop policy if exists "Workspace members read quality evidence" on storage.objects;
create policy "Workspace members read quality evidence" on storage.objects for select to authenticated using (bucket_id = 'quality-evidence' and exists (select 1 from public.requirement_workspace_members member where member.workspace_id::text = split_part(name, '/', 1) and member.user_id = auth.uid()));
drop policy if exists "Workspace members upload quality evidence" on storage.objects;
create policy "Workspace members upload quality evidence" on storage.objects for insert to authenticated with check (bucket_id = 'quality-evidence' and exists (select 1 from public.requirement_workspace_members member where member.workspace_id::text = split_part(name, '/', 1) and member.user_id = auth.uid()));

revoke all on public.quality_test_cases, public.quality_test_steps, public.quality_test_runs, public.quality_test_run_steps, public.quality_issues from anon, authenticated;
grant select on public.quality_test_cases, public.quality_test_steps, public.quality_test_runs, public.quality_test_run_steps, public.quality_issues to authenticated;
grant update (status, severity, sprint_task_id, updated_at) on public.quality_issues to authenticated;
revoke all on function public.generate_quality_test_case(uuid, uuid, text, text, jsonb) from public;
revoke all on function public.generate_quality_test_run(uuid, text, jsonb, uuid, uuid, uuid) from public;
revoke all on function public.execute_quality_test_step(uuid, text, text, text, text[]) from public;
grant execute on function public.generate_quality_test_case(uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.generate_quality_test_run(uuid, text, jsonb, uuid, uuid, uuid) to authenticated;
grant execute on function public.execute_quality_test_step(uuid, text, text, text, text[]) to authenticated;

do $$ begin alter publication supabase_realtime add table public.quality_test_runs; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.quality_test_run_steps; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.quality_issues; exception when duplicate_object then null; end $$;
