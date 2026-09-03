-- Apply after supabase/test_quality_issues.sql.
-- Immutable release baselines, structured differences, and workspace contribution activity.

create table if not exists public.release_baselines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  release_id uuid not null,
  version integer not null check (version > 0),
  name text not null check (length(trim(name)) between 1 and 200),
  milestone_label text not null default '',
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  entity_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(entity_counts) = 'object'),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (release_id, workspace_id) references public.planning_releases(id, workspace_id) on delete restrict,
  unique (workspace_id, release_id, version),
  unique (id, workspace_id)
);

create index if not exists release_baselines_release_idx
  on public.release_baselines(workspace_id, release_id, version desc);

create table if not exists public.workspace_activity_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.requirement_workspaces(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'created', 'updated', 'status_changed', 'reviewed', 'approved', 'reopened',
    'test_executed', 'issue_created', 'contribution_recorded', 'baseline_created'
  )),
  entity_type text not null,
  entity_id text not null,
  title text not null,
  effort_hours numeric not null default 0 check (effort_hours >= 0),
  loc_added integer not null default 0 check (loc_added >= 0),
  loc_removed integer not null default 0 check (loc_removed >= 0),
  rework_count integer not null default 0 check (rework_count >= 0),
  quality_score numeric check (quality_score is null or quality_score between 0 and 100),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create index if not exists workspace_activity_feed_idx
  on public.workspace_activity_events(workspace_id, occurred_at desc);
create index if not exists workspace_activity_actor_idx
  on public.workspace_activity_events(workspace_id, actor_user_id, occurred_at desc);
create unique index if not exists workspace_activity_contribution_source_uidx
  on public.workspace_activity_events(entity_type, entity_id)
  where entity_type = 'contribution';

alter table public.contribution_records
  add column if not exists client_company_id uuid references public.companies(id) on delete restrict,
  add column if not exists workspace_id uuid references public.requirement_workspaces(id) on delete set null,
  add column if not exists lifecycle_task_id uuid,
  add column if not exists loc_added integer not null default 0 check (loc_added >= 0),
  add column if not exists loc_removed integer not null default 0 check (loc_removed >= 0),
  add column if not exists rework_count integer not null default 0 check (rework_count >= 0),
  add column if not exists quality_score numeric check (quality_score is null or quality_score between 0 and 100);

do $$ begin
  alter table public.contribution_records
    add constraint contribution_records_lifecycle_task_workspace_fk
    foreign key (lifecycle_task_id, workspace_id) references public.sprint_tasks(id, workspace_id) on delete restrict;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.sprint_task_events
    add constraint sprint_task_events_task_workspace_fk
    foreign key (task_id, workspace_id) references public.sprint_tasks(id, workspace_id) on delete cascade;
exception when duplicate_object then null;
end $$;

create or replace function public.build_release_baseline_snapshot(workspace_id_input uuid, release_id_input uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'workspace', (select to_jsonb(workspace) - 'owner_user_id' from public.requirement_workspaces workspace where workspace.id = workspace_id_input),
    'release', (select to_jsonb(release) from public.planning_releases release where release.id = release_id_input and release.workspace_id = workspace_id_input),
    'folders', coalesce((select jsonb_object_agg(folder.id::text, to_jsonb(folder)) from public.planning_folders folder where folder.workspace_id = workspace_id_input), '{}'::jsonb),
    'requirements', coalesce((select jsonb_object_agg(item.id::text, to_jsonb(item)) from public.requirement_items item where item.workspace_id = workspace_id_input), '{}'::jsonb),
    'trace_links', coalesce((select jsonb_object_agg(link.id::text, to_jsonb(link)) from public.requirement_trace_links link where link.workspace_id = workspace_id_input), '{}'::jsonb),
    'sprints', coalesce((select jsonb_object_agg(sprint.id::text, to_jsonb(sprint)) from public.planning_sprints sprint where sprint.workspace_id = workspace_id_input), '{}'::jsonb),
    'tasks', coalesce((select jsonb_object_agg(task.id::text, to_jsonb(task)) from public.sprint_tasks task where task.workspace_id = workspace_id_input), '{}'::jsonb),
    'test_cases', coalesce((select jsonb_object_agg(test_case.id::text, to_jsonb(test_case)) from public.quality_test_cases test_case where test_case.workspace_id = workspace_id_input), '{}'::jsonb),
    'test_steps', coalesce((select jsonb_object_agg(step.id::text, to_jsonb(step)) from public.quality_test_steps step join public.quality_test_cases test_case on test_case.id = step.test_case_id where test_case.workspace_id = workspace_id_input), '{}'::jsonb),
    'test_runs', coalesce((select jsonb_object_agg(run.id::text, to_jsonb(run)) from public.quality_test_runs run where run.workspace_id = workspace_id_input), '{}'::jsonb),
    'run_steps', coalesce((select jsonb_object_agg(step.id::text, to_jsonb(step)) from public.quality_test_run_steps step join public.quality_test_runs run on run.id = step.run_id where run.workspace_id = workspace_id_input), '{}'::jsonb),
    'issues', coalesce((select jsonb_object_agg(issue.id::text, to_jsonb(issue)) from public.quality_issues issue where issue.workspace_id = workspace_id_input), '{}'::jsonb)
  );
$$;

create or replace function public.create_release_baseline(
  workspace_id_input uuid, release_id_input uuid, name_input text, milestone_label_input text default ''
) returns public.release_baselines language plpgsql security definer set search_path = '' as $$
declare release_record public.planning_releases%rowtype;
declare baseline_record public.release_baselines%rowtype;
declare snapshot_value jsonb;
declare next_version integer;
begin
  if not public.has_requirement_workspace_access(workspace_id_input, array['owner', 'editor']) then raise exception 'Workspace editor access required'; end if;
  select * into release_record from public.planning_releases where id = release_id_input and workspace_id = workspace_id_input for share;
  if release_record.id is null then raise exception 'Release not found'; end if;
  if length(trim(coalesce(name_input, ''))) = 0 then raise exception 'Baseline name is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(workspace_id_input::text || ':' || release_id_input::text, 0));
  select coalesce(max(version), 0) + 1 into next_version from public.release_baselines where workspace_id = workspace_id_input and release_id = release_id_input;
  snapshot_value := public.build_release_baseline_snapshot(workspace_id_input, release_id_input);
  insert into public.release_baselines (workspace_id, release_id, version, name, milestone_label, snapshot, entity_counts)
  values (workspace_id_input, release_id_input, next_version, trim(name_input), coalesce(milestone_label_input, ''), snapshot_value,
    jsonb_build_object(
      'folders', (select count(*) from jsonb_object_keys(snapshot_value->'folders')),
      'requirements', (select count(*) from jsonb_object_keys(snapshot_value->'requirements')),
      'tasks', (select count(*) from jsonb_object_keys(snapshot_value->'tasks')),
      'test_cases', (select count(*) from jsonb_object_keys(snapshot_value->'test_cases')),
      'test_steps', (select count(*) from jsonb_object_keys(snapshot_value->'test_steps')),
      'issues', (select count(*) from jsonb_object_keys(snapshot_value->'issues'))
    )) returning * into baseline_record;
  insert into public.workspace_activity_events (workspace_id, actor_user_id, event_type, entity_type, entity_id, title, metadata)
  values (workspace_id_input, auth.uid(), 'baseline_created', 'release_baseline', baseline_record.id::text, baseline_record.name,
    jsonb_build_object('version', baseline_record.version, 'release_id', release_id_input, 'counts', baseline_record.entity_counts));
  return baseline_record;
end;
$$;

create or replace function public.compare_release_baselines(left_baseline_id_input uuid, right_baseline_id_input uuid)
returns table (
  category text, item_key text, change_type text, item_title text,
  field_changes jsonb, before_value jsonb, after_value jsonb
) language plpgsql stable security definer set search_path = '' as $$
declare left_record public.release_baselines%rowtype;
declare right_record public.release_baselines%rowtype;
begin
  select * into left_record from public.release_baselines where id = left_baseline_id_input;
  select * into right_record from public.release_baselines where id = right_baseline_id_input;
  if left_record.id is null or right_record.id is null or left_record.workspace_id <> right_record.workspace_id
    or not public.has_requirement_workspace_access(left_record.workspace_id) then raise exception 'Comparable baselines not found'; end if;
  return query
  with categories as (
    select unnest(array['folders','requirements','trace_links','sprints','tasks','test_cases','test_steps','test_runs','run_steps','issues']) as category
  ), pairs as (
    select categories.category, keys.item_key,
      left_record.snapshot->categories.category->keys.item_key as before_value,
      right_record.snapshot->categories.category->keys.item_key as after_value
    from categories
    cross join lateral (
      select key as item_key from jsonb_object_keys(coalesce(left_record.snapshot->categories.category, '{}'::jsonb)) key
      union
      select key as item_key from jsonb_object_keys(coalesce(right_record.snapshot->categories.category, '{}'::jsonb)) key
    ) keys
  )
  select pairs.category, pairs.item_key,
    case when pairs.before_value is null then 'added' when pairs.after_value is null then 'removed' else 'changed' end,
    coalesce(pairs.after_value->>'title', pairs.after_value->>'name', pairs.after_value->>'action', pairs.before_value->>'title', pairs.before_value->>'name', pairs.before_value->>'action', pairs.item_key),
    coalesce((select jsonb_object_agg(fields.field_name, jsonb_build_object('before', pairs.before_value->fields.field_name, 'after', pairs.after_value->fields.field_name))
      from (select key as field_name from jsonb_object_keys(coalesce(pairs.before_value, '{}'::jsonb)) key union select key from jsonb_object_keys(coalesce(pairs.after_value, '{}'::jsonb)) key) fields
      where pairs.before_value->fields.field_name is distinct from pairs.after_value->fields.field_name), '{}'::jsonb),
    pairs.before_value, pairs.after_value
  from pairs where pairs.before_value is distinct from pairs.after_value
  order by pairs.category, change_type, item_title;
end;
$$;

create or replace function public.record_workspace_contribution(
  workspace_id_input uuid, title_input text, effort_hours_input numeric default 0,
  loc_added_input integer default 0, loc_removed_input integer default 0,
  rework_count_input integer default 0, quality_score_input numeric default null
) returns public.workspace_activity_events language plpgsql security definer set search_path = '' as $$
declare event_record public.workspace_activity_events%rowtype;
begin
  if not public.has_requirement_workspace_access(workspace_id_input) then raise exception 'Workspace access required'; end if;
  if length(trim(coalesce(title_input, ''))) = 0 then raise exception 'Contribution title is required'; end if;
  if effort_hours_input < 0 or loc_added_input < 0 or loc_removed_input < 0 or rework_count_input < 0
    or (quality_score_input is not null and (quality_score_input < 0 or quality_score_input > 100)) then raise exception 'Contribution metrics are outside the permitted range'; end if;
  insert into public.workspace_activity_events (
    workspace_id, actor_user_id, event_type, entity_type, entity_id, title,
    effort_hours, loc_added, loc_removed, rework_count, quality_score
  ) values (
    workspace_id_input, auth.uid(), 'contribution_recorded', 'contribution', gen_random_uuid()::text, trim(title_input),
    effort_hours_input, loc_added_input, loc_removed_input, rework_count_input, quality_score_input
  ) returning * into event_record;
  return event_record;
end;
$$;

create or replace function public.sync_approved_contribution_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.workspace_id is null or new.logged_hours is null
    or new.status not in ('valued', 'verified') then
    return new;
  end if;
  insert into public.workspace_activity_events (
    workspace_id, actor_user_id, event_type, entity_type, entity_id, title,
    effort_hours, loc_added, loc_removed, rework_count, quality_score, metadata, occurred_at
  ) values (
    new.workspace_id, new.contributor_id, 'contribution_recorded', 'contribution', new.id::text,
    new.contribution_type, new.logged_hours, new.loc_added, new.loc_removed, new.rework_count,
    new.quality_score, jsonb_build_object(
      'source', 'coop_equity', 'client_company_id', new.client_company_id,
      'lifecycle_task_id', new.lifecycle_task_id,
      'contribution_status', new.status, 'operational_role', to_jsonb(new)->>'operational_role'
    ), new.contributed_at
  ) on conflict (entity_type, entity_id) where entity_type = 'contribution' do nothing;
  return new;
end;
$$;

create or replace function public.validate_lifecycle_contribution_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.client_company_id is null and new.workspace_id is null and new.lifecycle_task_id is null then return new; end if;
  if new.client_company_id is null or new.workspace_id is null or new.contributor_id is null then
    raise exception 'Lifecycle contributions require a Client, Project, and contributor';
  end if;
  if not exists (
    select 1 from public.requirement_workspaces workspace
    where workspace.id = new.workspace_id and workspace.client_company_id = new.client_company_id
  ) then
    raise exception 'The selected Project does not belong to the selected Client';
  end if;
  if not exists (
    select 1 from public.requirement_workspaces workspace
    where workspace.id = new.workspace_id and workspace.owner_user_id = new.contributor_id
  ) and not exists (
    select 1 from public.requirement_workspace_members member
    where member.workspace_id = new.workspace_id and member.user_id = new.contributor_id
  ) then
    raise exception 'Contributor must belong to the linked lifecycle workspace';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_lifecycle_contribution_link on public.contribution_records;
create trigger validate_lifecycle_contribution_link
before insert or update of client_company_id, workspace_id, lifecycle_task_id, contributor_id on public.contribution_records
for each row execute function public.validate_lifecycle_contribution_link();

drop trigger if exists sync_approved_contribution_activity on public.contribution_records;
create trigger sync_approved_contribution_activity
after insert or update of workspace_id, lifecycle_task_id, logged_hours, status on public.contribution_records
for each row execute function public.sync_approved_contribution_activity();

drop function if exists public.workspace_activity_summary(uuid);
create function public.workspace_activity_summary(workspace_id_input uuid)
returns table (
  actor_user_id uuid, event_count bigint, effort_hours numeric, loc_added bigint,
  loc_removed bigint, rework_count bigint, quality_event_count bigint, average_quality numeric
) language sql stable security definer set search_path = '' as $$
  select event.actor_user_id, count(*), sum(event.effort_hours), sum(event.loc_added),
    sum(event.loc_removed), sum(event.rework_count), count(event.quality_score), avg(event.quality_score)
  from public.workspace_activity_events event
  where event.workspace_id = workspace_id_input
    and public.has_requirement_workspace_access(workspace_id_input)
  group by event.actor_user_id;
$$;

create or replace function public.enforce_requirement_actor()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_by := auth.uid();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists enforce_requirement_actor on public.requirement_items;
create trigger enforce_requirement_actor before insert on public.requirement_items
for each row execute function public.enforce_requirement_actor();

create or replace function public.log_requirement_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.workspace_activity_events (workspace_id, actor_user_id, event_type, entity_type, entity_id, title, metadata)
    values (new.workspace_id, auth.uid(), 'created', 'requirement', new.id::text, new.title, jsonb_build_object('item_type', new.item_type));
  elsif new.title is distinct from old.title or new.content is distinct from old.content or new.status is distinct from old.status then
    insert into public.workspace_activity_events (workspace_id, actor_user_id, event_type, entity_type, entity_id, title, rework_count, metadata)
    values (new.workspace_id, new.updated_by, case when new.status is distinct from old.status then 'status_changed' else 'updated' end,
      'requirement', new.id::text, new.title, case when new.status = 'draft' and old.status <> 'draft' then 1 else 0 end,
      jsonb_build_object('item_type', new.item_type, 'from_status', old.status, 'to_status', new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists log_requirement_activity on public.requirement_items;
create trigger log_requirement_activity after insert or update on public.requirement_items
for each row execute function public.log_requirement_activity();

create or replace function public.log_sprint_task_event_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare task_title text;
begin
  select title into task_title from public.sprint_tasks where id = new.task_id and workspace_id = new.workspace_id;
  insert into public.workspace_activity_events (workspace_id, actor_user_id, event_type, entity_type, entity_id, title, rework_count, metadata, occurred_at)
  values (new.workspace_id, new.actor_user_id,
    case new.event_type when 'approved' then 'approved' when 'reviewed' then 'reviewed' when 'reopened' then 'reopened' else 'status_changed' end,
    'sprint_task', new.task_id::text, coalesce(task_title, 'Sprint task'), case when new.event_type = 'reopened' then 1 else 0 end,
    jsonb_build_object('from_status', new.from_status, 'to_status', new.to_status, 'event', new.event_type), new.occurred_at);
  return new;
end;
$$;

drop trigger if exists log_sprint_task_event_activity on public.sprint_task_events;
create trigger log_sprint_task_event_activity after insert on public.sprint_task_events
for each row execute function public.log_sprint_task_event_activity();

create or replace function public.log_quality_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare workspace_value uuid;
begin
  select run.workspace_id into workspace_value from public.quality_test_runs run where run.id = new.run_id;
  insert into public.workspace_activity_events (workspace_id, actor_user_id, event_type, entity_type, entity_id, title, quality_score, metadata)
  values (workspace_value, new.executed_by, 'test_executed', 'test_run_step', new.id::text, new.action,
    case new.outcome when 'passed' then 100 when 'failed' then 0 else null end,
    jsonb_build_object('outcome', new.outcome, 'step_number', new.step_number));
  return new;
end;
$$;

drop trigger if exists log_quality_activity on public.quality_test_run_steps;
create trigger log_quality_activity after update of outcome on public.quality_test_run_steps
for each row when (old.outcome is distinct from new.outcome) execute function public.log_quality_activity();

create or replace function public.log_issue_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workspace_activity_events (workspace_id, actor_user_id, event_type, entity_type, entity_id, title, rework_count, metadata)
  values (new.workspace_id, new.created_by, 'issue_created', 'quality_issue', new.id::text, new.problem_statement, 1,
    jsonb_build_object('severity', new.severity, 'run_id', new.run_id));
  return new;
end;
$$;

drop trigger if exists log_issue_activity on public.quality_issues;
create trigger log_issue_activity after insert on public.quality_issues
for each row execute function public.log_issue_activity();

create or replace function public.prevent_workspace_activity_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Workspace activity history is append-only';
end;
$$;

drop trigger if exists prevent_workspace_activity_mutation on public.workspace_activity_events;
create trigger prevent_workspace_activity_mutation before update or delete on public.workspace_activity_events
for each row execute function public.prevent_workspace_activity_mutation();

create or replace function public.prevent_release_baseline_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Release baselines are immutable';
end;
$$;

drop trigger if exists prevent_release_baseline_mutation on public.release_baselines;
create trigger prevent_release_baseline_mutation before update or delete on public.release_baselines
for each row execute function public.prevent_release_baseline_mutation();

alter table public.release_baselines enable row level security;
alter table public.workspace_activity_events enable row level security;

drop policy if exists "Members read release baselines" on public.release_baselines;
create policy "Members read release baselines" on public.release_baselines for select to authenticated
  using (public.has_requirement_workspace_access(workspace_id));
drop policy if exists "Members read workspace activity" on public.workspace_activity_events;
create policy "Members read workspace activity" on public.workspace_activity_events for select to authenticated
  using (public.has_requirement_workspace_access(workspace_id));

revoke all on public.release_baselines, public.workspace_activity_events from anon, authenticated;
grant select on public.release_baselines, public.workspace_activity_events to authenticated;
revoke all on function public.build_release_baseline_snapshot(uuid, uuid) from public;
revoke all on function public.create_release_baseline(uuid, uuid, text, text) from public;
revoke all on function public.compare_release_baselines(uuid, uuid) from public;
revoke all on function public.record_workspace_contribution(uuid, text, numeric, integer, integer, integer, numeric) from public;
revoke all on function public.validate_lifecycle_contribution_link() from public;
revoke all on function public.sync_approved_contribution_activity() from public;
revoke all on function public.workspace_activity_summary(uuid) from public;
revoke all on function public.enforce_requirement_actor() from public;
revoke all on function public.log_requirement_activity() from public;
revoke all on function public.log_sprint_task_event_activity() from public;
revoke all on function public.log_quality_activity() from public;
revoke all on function public.log_issue_activity() from public;
revoke all on function public.prevent_workspace_activity_mutation() from public;
revoke all on function public.prevent_release_baseline_mutation() from public;
grant execute on function public.create_release_baseline(uuid, uuid, text, text) to authenticated;
grant execute on function public.compare_release_baselines(uuid, uuid) to authenticated;
grant execute on function public.record_workspace_contribution(uuid, text, numeric, integer, integer, integer, numeric) to authenticated;
grant execute on function public.workspace_activity_summary(uuid) to authenticated;

do $$ begin alter publication supabase_realtime add table public.workspace_activity_events; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.release_baselines; exception when duplicate_object then null; end $$;
