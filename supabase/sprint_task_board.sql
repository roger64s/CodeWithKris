-- Apply after supabase/requirements_management.sql.
-- Product planning folders, releases, sprints, task allocation, and workflow governance.

create table if not exists public.planning_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  parent_id uuid references public.planning_folders(id) on delete cascade,
  folder_type text not null check (folder_type in ('product', 'backlog', 'test_library', 'releases', 'release', 'sprints', 'sprint')),
  name text not null check (length(trim(name)) between 1 and 120),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, parent_id, name)
);

create index if not exists planning_folders_tree_idx
  on public.planning_folders(workspace_id, parent_id, sort_order, created_at);

create table if not exists public.planning_releases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  folder_id uuid not null,
  release_number integer not null check (release_number between 1 and 4),
  name text not null,
  status text not null default 'planned' check (status in ('planned', 'active', 'released')),
  starts_on date,
  releases_on date,
  created_at timestamptz not null default now(),
  foreign key (folder_id, workspace_id) references public.planning_folders(id, workspace_id) on delete cascade,
  unique (workspace_id, release_number),
  unique (id, workspace_id)
);

create table if not exists public.planning_sprints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  folder_id uuid not null,
  release_id uuid,
  sprint_number integer not null check (sprint_number between 1 and 3),
  name text not null,
  goal text not null default '',
  status text not null default 'planned' check (status in ('planned', 'active', 'completed')),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  foreign key (folder_id, workspace_id) references public.planning_folders(id, workspace_id) on delete cascade,
  foreign key (release_id, workspace_id) references public.planning_releases(id, workspace_id) on delete restrict,
  unique (workspace_id, sprint_number),
  unique (id, workspace_id)
);

create table if not exists public.sprint_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  folder_id uuid not null,
  sprint_id uuid,
  release_id uuid,
  requirement_item_id uuid,
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '',
  workflow_status text not null default 'not_started' check (workflow_status in ('not_started', 'in_progress', 'ready_for_review', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  assignee_user_id uuid references auth.users(id) on delete set null,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  approved_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (folder_id, workspace_id) references public.planning_folders(id, workspace_id) on delete restrict,
  foreign key (requirement_item_id, workspace_id) references public.requirement_items(id, workspace_id) on delete restrict,
  foreign key (sprint_id, workspace_id) references public.planning_sprints(id, workspace_id) on delete restrict,
  foreign key (release_id, workspace_id) references public.planning_releases(id, workspace_id) on delete restrict
);

create index if not exists sprint_tasks_board_idx
  on public.sprint_tasks(workspace_id, sprint_id, workflow_status, sort_order, created_at);
create index if not exists sprint_tasks_assignee_idx
  on public.sprint_tasks(assignee_user_id, workflow_status);

create table if not exists public.sprint_task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.sprint_tasks(id) on delete cascade,
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('created', 'assigned', 'started', 'submitted', 'reviewed', 'approved', 'reopened', 'moved')),
  from_status text,
  to_status text,
  notes text not null default '',
  occurred_at timestamptz not null default now()
);

create index if not exists sprint_task_events_task_idx on public.sprint_task_events(task_id, occurred_at desc);

create or replace function public.validate_planning_folder()
returns trigger language plpgsql set search_path = '' as $$
declare parent_record public.planning_folders%rowtype;
begin
  if new.parent_id is null then
    if new.folder_type not in ('product', 'backlog', 'test_library', 'releases', 'sprints') then
      raise exception 'Only standard planning folders may be at the root';
    end if;
    return new;
  end if;
  select * into parent_record from public.planning_folders where id = new.parent_id;
  if parent_record.id is null or parent_record.workspace_id <> new.workspace_id then
    raise exception 'Parent folder must belong to the same workspace';
  end if;
  if not (
    (new.folder_type = 'release' and parent_record.folder_type = 'releases')
    or (new.folder_type = 'sprint' and parent_record.folder_type = 'sprints')
  ) then raise exception 'Invalid planning folder hierarchy'; end if;
  return new;
end;
$$;

drop trigger if exists validate_planning_folder on public.planning_folders;
create trigger validate_planning_folder before insert or update of workspace_id, parent_id, folder_type
on public.planning_folders for each row execute function public.validate_planning_folder();

create or replace function public.create_planning_folder_structure_for_workspace(workspace_id_input uuid, owner_user_id_input uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare releases_folder_id uuid;
declare sprints_folder_id uuid;
declare child_id uuid;
declare number_value integer;
begin
  insert into public.planning_folders (workspace_id, folder_type, name, visibility, sort_order, created_by)
  values
    (workspace_id_input, 'product', 'Product', 'public', 10, owner_user_id_input),
    (workspace_id_input, 'backlog', 'Backlog', 'private', 20, owner_user_id_input),
    (workspace_id_input, 'test_library', 'Test Library', 'private', 30, owner_user_id_input),
    (workspace_id_input, 'releases', 'Releases', 'public', 40, owner_user_id_input),
    (workspace_id_input, 'sprints', 'Sprints', 'private', 50, owner_user_id_input)
  on conflict (workspace_id, parent_id, name) do nothing;

  select id into releases_folder_id from public.planning_folders where workspace_id = workspace_id_input and folder_type = 'releases';
  select id into sprints_folder_id from public.planning_folders where workspace_id = workspace_id_input and folder_type = 'sprints';
  for number_value in 1..4 loop
    select id into child_id from public.planning_folders where workspace_id = workspace_id_input and parent_id = releases_folder_id and name = 'Release ' || number_value;
    if child_id is null then
      insert into public.planning_folders (workspace_id, parent_id, folder_type, name, visibility, sort_order, created_by)
      values (workspace_id_input, releases_folder_id, 'release', 'Release ' || number_value, 'public', number_value * 10, owner_user_id_input)
      returning id into child_id;
    end if;
    insert into public.planning_releases (workspace_id, folder_id, release_number, name)
    values (workspace_id_input, child_id, number_value, 'Release ' || number_value)
    on conflict (workspace_id, release_number) do nothing;
  end loop;
  for number_value in 1..3 loop
    child_id := null;
    select id into child_id from public.planning_folders where workspace_id = workspace_id_input and parent_id = sprints_folder_id and name = 'Sprint ' || number_value;
    if child_id is null then
      insert into public.planning_folders (workspace_id, parent_id, folder_type, name, visibility, sort_order, created_by)
      values (workspace_id_input, sprints_folder_id, 'sprint', 'Sprint ' || number_value, 'private', number_value * 10, owner_user_id_input)
      returning id into child_id;
    end if;
    insert into public.planning_sprints (workspace_id, folder_id, sprint_number, name)
    values (workspace_id_input, child_id, number_value, 'Sprint ' || number_value)
    on conflict (workspace_id, sprint_number) do nothing;
  end loop;
end;
$$;

create or replace function public.create_planning_folder_structure()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.create_planning_folder_structure_for_workspace(new.id, new.owner_user_id);
  return new;
end;
$$;

drop trigger if exists create_planning_folder_structure on public.requirement_workspaces;
create trigger create_planning_folder_structure after insert on public.requirement_workspaces
for each row execute function public.create_planning_folder_structure();

-- Backfill the standard structure for workspaces created before Phase 3.
do $$
declare workspace_record record;
begin
  for workspace_record in select * from public.requirement_workspaces loop
    if not exists (select 1 from public.planning_folders where workspace_id = workspace_record.id) then
      perform public.create_planning_folder_structure_for_workspace(workspace_record.id, workspace_record.owner_user_id);
    end if;
  end loop;
end
$$;

create or replace function public.requirement_workspace_user_directory(workspace_id_input uuid)
returns table (user_id uuid, display_name text, platform_category text, access_role text)
language sql stable security definer set search_path = '' as $$
  select member.user_id,
    coalesce(nullif(auth_user.raw_user_meta_data->>'full_name', ''), split_part(auth_user.email, '@', 1)),
    account.platform_category,
    member.access_role
  from public.requirement_workspace_members member
  join auth.users auth_user on auth_user.id = member.user_id
  left join public.user_accounts account on account.user_id = member.user_id
  where member.workspace_id = workspace_id_input
    and public.has_requirement_workspace_access(workspace_id_input);
$$;

create or replace function public.add_requirement_workspace_member_by_email(
  workspace_id_input uuid, email_input text, access_role_input text default 'viewer'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare matched_user_id uuid;
begin
  if not public.has_requirement_workspace_access(workspace_id_input, array['owner']) then raise exception 'Workspace owner access required'; end if;
  if access_role_input not in ('editor', 'viewer') then raise exception 'Member role must be editor or viewer'; end if;
  select id into matched_user_id from auth.users where lower(email) = lower(trim(email_input));
  if matched_user_id is null then raise exception 'No registered CodeWithKris user matches that email'; end if;
  insert into public.requirement_workspace_members (workspace_id, user_id, access_role)
  values (workspace_id_input, matched_user_id, access_role_input)
  on conflict (workspace_id, user_id) do update set access_role = excluded.access_role;
  return matched_user_id;
end;
$$;

create or replace function public.validate_sprint_task_allocation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_user_id is not null and not exists (
    select 1 from public.requirement_workspace_members member
    where member.workspace_id = new.workspace_id and member.user_id = new.assignee_user_id
  ) then raise exception 'Assignee must be a registered workspace member'; end if;
  if new.reviewer_user_id is not null and not exists (
    select 1 from public.requirement_workspace_members member
    where member.workspace_id = new.workspace_id and member.user_id = new.reviewer_user_id
      and member.access_role in ('owner', 'editor')
  ) then raise exception 'Reviewer must be a workspace owner or editor'; end if;
  if new.assignee_user_id is not null and new.assignee_user_id = new.reviewer_user_id then
    raise exception 'Assignee and reviewer must be different users';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_sprint_task_allocation on public.sprint_tasks;
create trigger validate_sprint_task_allocation before insert or update of workspace_id, assignee_user_id, reviewer_user_id
on public.sprint_tasks for each row execute function public.validate_sprint_task_allocation();

create or replace function public.audit_sprint_task_allocation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.sprint_task_events (task_id, workspace_id, actor_user_id, event_type, to_status, notes)
    values (new.id, new.workspace_id, auth.uid(), 'created', new.workflow_status, 'Task created');
  elsif new.assignee_user_id is distinct from old.assignee_user_id
    or new.reviewer_user_id is distinct from old.reviewer_user_id then
    insert into public.sprint_task_events (task_id, workspace_id, actor_user_id, event_type, from_status, to_status, notes)
    values (new.id, new.workspace_id, auth.uid(), 'assigned', old.workflow_status, new.workflow_status, 'Task allocation updated');
  end if;
  return new;
end;
$$;

drop trigger if exists audit_sprint_task_allocation on public.sprint_tasks;
create trigger audit_sprint_task_allocation after insert or update of assignee_user_id, reviewer_user_id
on public.sprint_tasks for each row execute function public.audit_sprint_task_allocation();

create or replace function public.protect_sprint_task_workflow()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.workflow_status <> 'not_started' or new.reviewed_at is not null
      or new.approved_at is not null or new.approved_by_user_id is not null then
      raise exception 'New tasks must begin in Not Started without review or approval';
    end if;
  elsif (
    new.workflow_status is distinct from old.workflow_status
    or new.reviewed_at is distinct from old.reviewed_at
    or new.approved_at is distinct from old.approved_at
    or new.approved_by_user_id is distinct from old.approved_by_user_id
  ) and coalesce(current_setting('app.sprint_transition_task', true), '') <> old.id::text then
    raise exception 'The controlled task transition function is required';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_sprint_task_workflow on public.sprint_tasks;
create trigger protect_sprint_task_workflow before insert or update on public.sprint_tasks
for each row execute function public.protect_sprint_task_workflow();

create or replace function public.transition_sprint_task(task_id_input uuid, status_input text, notes_input text default '')
returns public.sprint_tasks language plpgsql security definer set search_path = '' as $$
declare task_record public.sprint_tasks%rowtype;
declare event_name text;
declare previous_status text;
begin
  select * into task_record from public.sprint_tasks where id = task_id_input for update;
  if task_record.id is null or not public.has_requirement_workspace_access(task_record.workspace_id) then raise exception 'Task not found'; end if;
  if status_input not in ('not_started', 'in_progress', 'ready_for_review', 'done') then raise exception 'Invalid workflow status'; end if;
  if status_input = task_record.workflow_status then return task_record; end if;
  previous_status := task_record.workflow_status;

  if not (
    (previous_status = 'not_started' and status_input = 'in_progress')
    or (previous_status = 'in_progress' and status_input in ('not_started', 'ready_for_review'))
    or (previous_status = 'ready_for_review' and status_input in ('in_progress', 'done'))
    or (previous_status = 'done' and status_input = 'not_started'
      and public.has_requirement_workspace_access(task_record.workspace_id, array['owner', 'editor']))
  ) then raise exception 'Invalid workflow transition sequence'; end if;

  if status_input in ('in_progress', 'ready_for_review')
    and auth.uid() <> task_record.assignee_user_id
    and not public.has_requirement_workspace_access(task_record.workspace_id, array['owner', 'editor'])
  then raise exception 'Only the assignee or a workspace editor may change this task status'; end if;
  if previous_status = 'in_progress' and status_input = 'not_started'
    and auth.uid() <> task_record.assignee_user_id
    and not public.has_requirement_workspace_access(task_record.workspace_id, array['owner', 'editor'])
  then raise exception 'Only the assignee or a workspace editor may reopen this task'; end if;
  if status_input = 'ready_for_review' and task_record.assignee_user_id is null then raise exception 'Assign the task before review'; end if;
  if status_input = 'done'
    and auth.uid() <> task_record.reviewer_user_id
    and not public.has_requirement_workspace_access(task_record.workspace_id, array['owner'])
  then raise exception 'Only the assigned reviewer or workspace owner may approve this task'; end if;
  if status_input = 'done' and task_record.reviewer_user_id is null then raise exception 'Assign a reviewer before approval'; end if;

  event_name := case status_input when 'in_progress' then 'started' when 'ready_for_review' then 'submitted' when 'done' then 'approved' else 'reopened' end;
  perform set_config('app.sprint_transition_task', task_record.id::text, true);
  update public.sprint_tasks set
    workflow_status = status_input,
    reviewed_at = case when status_input = 'ready_for_review' then now() when status_input in ('not_started', 'in_progress') then null else reviewed_at end,
    approved_by_user_id = case when status_input = 'done' then auth.uid() else null end,
    approved_at = case when status_input = 'done' then now() else null end,
    updated_by = auth.uid(), updated_at = now()
  where id = task_record.id returning * into task_record;
  insert into public.sprint_task_events (task_id, workspace_id, actor_user_id, event_type, from_status, to_status, notes)
  values (task_record.id, task_record.workspace_id, auth.uid(), event_name, previous_status, status_input, coalesce(notes_input, ''));
  return task_record;
end;
$$;

alter table public.planning_folders enable row level security;
alter table public.planning_releases enable row level security;
alter table public.planning_sprints enable row level security;
alter table public.sprint_tasks enable row level security;
alter table public.sprint_task_events enable row level security;

drop policy if exists "Public or member folder reads" on public.planning_folders;
drop policy if exists "Public planning folder reads" on public.planning_folders;
create policy "Public planning folder reads" on public.planning_folders for select to anon, authenticated
  using (visibility = 'public');
drop policy if exists "Members read planning folders" on public.planning_folders;
create policy "Members read planning folders" on public.planning_folders for select to authenticated
  using (public.has_requirement_workspace_access(workspace_id));
drop policy if exists "Editors manage planning folders" on public.planning_folders;
create policy "Editors manage planning folders" on public.planning_folders for all to authenticated
  using (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']))
  with check (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));
drop policy if exists "Members read planning releases" on public.planning_releases;
create policy "Members read planning releases" on public.planning_releases for select to authenticated using (public.has_requirement_workspace_access(workspace_id));
drop policy if exists "Editors manage planning releases" on public.planning_releases;
create policy "Editors manage planning releases" on public.planning_releases for all to authenticated using (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor'])) with check (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));
drop policy if exists "Members read planning sprints" on public.planning_sprints;
create policy "Members read planning sprints" on public.planning_sprints for select to authenticated using (public.has_requirement_workspace_access(workspace_id));
drop policy if exists "Editors manage planning sprints" on public.planning_sprints;
create policy "Editors manage planning sprints" on public.planning_sprints for all to authenticated using (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor'])) with check (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));
drop policy if exists "Members read sprint tasks" on public.sprint_tasks;
create policy "Members read sprint tasks" on public.sprint_tasks for select to authenticated using (public.has_requirement_workspace_access(workspace_id));
drop policy if exists "Editors manage sprint tasks" on public.sprint_tasks;
create policy "Editors manage sprint tasks" on public.sprint_tasks for all to authenticated using (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor'])) with check (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));
drop policy if exists "Assignees update sprint tasks" on public.sprint_tasks;
drop policy if exists "Members read task events" on public.sprint_task_events;
create policy "Members read task events" on public.sprint_task_events for select to authenticated using (public.has_requirement_workspace_access(workspace_id));

revoke all on public.planning_folders, public.planning_releases, public.planning_sprints, public.sprint_tasks, public.sprint_task_events from anon, authenticated;
grant select on public.planning_folders to anon;
grant select, insert, update, delete on public.planning_folders, public.planning_releases, public.planning_sprints to authenticated;
grant select, insert, delete on public.sprint_tasks to authenticated;
grant update (
  folder_id, sprint_id, release_id, requirement_item_id, title, description,
  priority, assignee_user_id, reviewer_user_id, sort_order, updated_by, updated_at
) on public.sprint_tasks to authenticated;
grant select on public.sprint_task_events to authenticated;
revoke all on function public.requirement_workspace_user_directory(uuid) from public;
revoke all on function public.add_requirement_workspace_member_by_email(uuid, text, text) from public;
revoke all on function public.transition_sprint_task(uuid, text, text) from public;
revoke all on function public.create_planning_folder_structure_for_workspace(uuid, uuid) from public;
revoke all on function public.create_planning_folder_structure() from public;
revoke all on function public.validate_sprint_task_allocation() from public;
revoke all on function public.audit_sprint_task_allocation() from public;
revoke all on function public.protect_sprint_task_workflow() from public;
grant execute on function public.requirement_workspace_user_directory(uuid) to authenticated;
grant execute on function public.add_requirement_workspace_member_by_email(uuid, text, text) to authenticated;
grant execute on function public.transition_sprint_task(uuid, text, text) to authenticated;

do $$ begin alter publication supabase_realtime add table public.sprint_tasks; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.sprint_task_events; exception when duplicate_object then null; end $$;