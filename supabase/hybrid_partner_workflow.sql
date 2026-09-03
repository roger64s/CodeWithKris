-- Apply after supabase/project_operations.sql.
-- Maps the existing cost-control departments to local-partner and foreign-client work.

create table if not exists public.project_department_responsibilities (
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  department_category text not null check (department_category in (
    'Management', 'Delivery', 'Finance & Admin', 'Sales & Marketing', 'Customer Service', 'Profit'
  )),
  allocation_percent numeric not null check (allocation_percent between 0 and 100),
  responsibility_side text not null check (responsibility_side in ('local_partner', 'foreign_client', 'shared')),
  local_partner_tasks text[] not null default '{}',
  foreign_client_tasks text[] not null default '{}',
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, department_category)
);

create or replace function public.create_project_department_map(
  workspace_id_input uuid,
  owner_user_id_input uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_department_responsibilities (
    workspace_id, department_category, allocation_percent, responsibility_side,
    local_partner_tasks, foreign_client_tasks, updated_by
  ) values
    (workspace_id_input, 'Management', 10, 'foreign_client',
      array['Coordinate local stakeholders'], array['Contract execution', 'Commercial governance'], owner_user_id_input),
    (workspace_id_input, 'Delivery', 30, 'foreign_client',
      array['Coordinate local delivery'], array['Core demo environment', 'Technical escalation'], owner_user_id_input),
    (workspace_id_input, 'Finance & Admin', 20, 'foreign_client',
      array['Submit local expense evidence'], array['Final pricing', 'Invoicing and contract administration'], owner_user_id_input),
    (workspace_id_input, 'Sales & Marketing', 20, 'local_partner',
      array['Discovery', 'Lead generation', 'Local-language outreach'], array['Approve positioning', 'Review qualified opportunities'], owner_user_id_input),
    (workspace_id_input, 'Customer Service', 10, 'local_partner',
      array['Tier-1 support', 'Issue triage'], array['Product resolution', 'Technical escalation support'], owner_user_id_input),
    (workspace_id_input, 'Profit', 10, 'shared',
      array['Partner revenue reconciliation'], array['Client acceptance', 'Revenue authorization'], owner_user_id_input)
  on conflict (workspace_id, department_category) do nothing;
end;
$$;

create or replace function public.create_project_department_map_for_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.create_project_department_map(new.id, new.owner_user_id);
  return new;
end;
$$;

drop trigger if exists create_project_department_map on public.requirement_workspaces;
create trigger create_project_department_map after insert on public.requirement_workspaces
for each row execute function public.create_project_department_map_for_workspace();

do $$
declare workspace_record record;
begin
  for workspace_record in select id, owner_user_id from public.requirement_workspaces loop
    perform public.create_project_department_map(workspace_record.id, workspace_record.owner_user_id);
  end loop;
end
$$;

create or replace function public.save_project_department_map(
  workspace_id_input uuid,
  mappings_input jsonb
) returns setof public.project_department_responsibilities
language plpgsql security definer set search_path = '' as $$
declare mapping_count integer;
declare allocation_total numeric;
declare updated_count integer;
begin
  if not public.has_requirement_workspace_access(workspace_id_input, array['owner', 'editor']) then
    raise exception 'Workspace editor access required';
  end if;

  select count(*), sum((mapping->>'allocationPercent')::numeric)
    into mapping_count, allocation_total
  from jsonb_array_elements(mappings_input) mapping
  where mapping->>'departmentCategory' in (
    'Management', 'Delivery', 'Finance & Admin', 'Sales & Marketing', 'Customer Service', 'Profit'
  ) and mapping->>'responsibilitySide' in ('local_partner', 'foreign_client', 'shared')
    and (mapping->>'allocationPercent')::numeric = case mapping->>'departmentCategory'
      when 'Management' then 10
      when 'Delivery' then 30
      when 'Finance & Admin' then 20
      when 'Sales & Marketing' then 20
      when 'Customer Service' then 10
      when 'Profit' then 10
    end;

  if mapping_count <> 6 or allocation_total <> 100 then
    raise exception 'The six department mappings must total 100 percent';
  end if;

  if exists (
    select 1 from jsonb_array_elements(mappings_input) mapping
    group by mapping->>'departmentCategory' having count(*) > 1
  ) then raise exception 'Each department may appear only once'; end if;

  update public.project_department_responsibilities responsibility
  set responsibility_side = mapping.value->>'responsibilitySide',
      updated_by = auth.uid(), updated_at = now()
  from jsonb_array_elements(mappings_input) mapping(value)
  where responsibility.workspace_id = workspace_id_input
    and responsibility.department_category = mapping.value->>'departmentCategory'
    and responsibility.allocation_percent = (mapping.value->>'allocationPercent')::numeric;

  select count(*) into updated_count
  from public.project_department_responsibilities responsibility
  join jsonb_array_elements(mappings_input) mapping(value)
    on responsibility.department_category = mapping.value->>'departmentCategory'
    and responsibility.responsibility_side = mapping.value->>'responsibilitySide'
  where responsibility.workspace_id = workspace_id_input;
  if updated_count <> 6 then
    raise exception 'Department map did not update all six departments';
  end if;

  update public.sprint_tasks task
  set responsibility_side = responsibility.responsibility_side,
      updated_by = auth.uid(), updated_at = now()
  from public.project_department_responsibilities responsibility
  where task.workspace_id = workspace_id_input
    and responsibility.workspace_id = task.workspace_id
    and responsibility.department_category = task.department_category
    and task.responsibility_side is distinct from responsibility.responsibility_side;

  return query select * from public.project_department_responsibilities
    where workspace_id = workspace_id_input order by allocation_percent desc, department_category;
end;
$$;

alter table public.sprint_tasks
  add column if not exists department_category text check (department_category in (
    'Management', 'Delivery', 'Finance & Admin', 'Sales & Marketing', 'Customer Service', 'Profit'
  )),
  add column if not exists responsibility_side text check (responsibility_side in ('local_partner', 'foreign_client', 'shared'));

create or replace function public.map_sprint_task_department_responsibility()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.department_category is null then
    new.responsibility_side := null;
    return new;
  end if;
  select mapping.responsibility_side into new.responsibility_side
  from public.project_department_responsibilities mapping
  where mapping.workspace_id = new.workspace_id
    and mapping.department_category = new.department_category;
  if new.responsibility_side is null then raise exception 'Configure the project department map first'; end if;
  return new;
end;
$$;

drop trigger if exists map_sprint_task_department_responsibility on public.sprint_tasks;
create trigger map_sprint_task_department_responsibility
before insert or update of workspace_id, department_category, responsibility_side on public.sprint_tasks
for each row execute function public.map_sprint_task_department_responsibility();

alter table public.project_department_responsibilities enable row level security;
drop policy if exists "Members read project department map" on public.project_department_responsibilities;
create policy "Members read project department map" on public.project_department_responsibilities
for select to authenticated using (public.has_requirement_workspace_access(workspace_id));

revoke all on public.project_department_responsibilities from anon, authenticated;
grant select on public.project_department_responsibilities to authenticated;
revoke all on function public.create_project_department_map(uuid, uuid) from public;
revoke all on function public.create_project_department_map_for_workspace() from public;
revoke all on function public.save_project_department_map(uuid, jsonb) from public;
grant execute on function public.save_project_department_map(uuid, jsonb) to authenticated;
