-- Role-based visibility and access control for authenticated application resources.

create table if not exists public.rbac_roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text not null check (length(trim(display_name)) > 0),
  description text not null default '',
  built_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rbac_permissions (
  role_id uuid not null references public.rbac_roles(id) on delete cascade,
  resource_key text not null check (resource_key in (
    'templates', 'record', 'practice', 'progress', 'dictionary', 'action-trial',
    'peer-review', 'gtm-pilot', 'requirements', 'sprints', 'quality', 'baselines',
    'financials', 'admin', 'profile'
  )),
  can_view boolean not null default false,
  can_access boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role_id, resource_key),
  check (not can_access or can_view)
);

create table if not exists public.user_rbac_assignments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_id uuid not null references public.rbac_roles(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now()
);

create or replace function public.is_rbac_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'roger.s@gradagig.com'
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'CodeWithKris Administrator'
    or exists (
      select 1
      from public.user_rbac_assignments assignment
      join public.rbac_roles role on role.id = assignment.role_id
      where assignment.user_id = auth.uid()
        and role.slug in ('administrator', 'security-admin')
    );
$$;

revoke all on function public.is_rbac_admin() from public;
grant execute on function public.is_rbac_admin() to authenticated;

alter table public.rbac_roles enable row level security;
alter table public.rbac_permissions enable row level security;
alter table public.user_rbac_assignments enable row level security;

drop policy if exists "Authenticated users read RBAC roles" on public.rbac_roles;
create policy "Authenticated users read RBAC roles" on public.rbac_roles
  for select to authenticated using (true);
drop policy if exists "RBAC administrators manage roles" on public.rbac_roles;
create policy "RBAC administrators manage roles" on public.rbac_roles
  for all to authenticated using (public.is_rbac_admin()) with check (public.is_rbac_admin());

drop policy if exists "Authenticated users read RBAC permissions" on public.rbac_permissions;
create policy "Authenticated users read RBAC permissions" on public.rbac_permissions
  for select to authenticated using (true);
drop policy if exists "RBAC administrators manage permissions" on public.rbac_permissions;
create policy "RBAC administrators manage permissions" on public.rbac_permissions
  for all to authenticated using (public.is_rbac_admin()) with check (public.is_rbac_admin());

drop policy if exists "Users read own RBAC assignment" on public.user_rbac_assignments;
create policy "Users read own RBAC assignment" on public.user_rbac_assignments
  for select to authenticated using (user_id = auth.uid() or public.is_rbac_admin());
drop policy if exists "RBAC administrators manage assignments" on public.user_rbac_assignments;
create policy "RBAC administrators manage assignments" on public.user_rbac_assignments
  for all to authenticated using (public.is_rbac_admin()) with check (public.is_rbac_admin());

revoke all on public.rbac_roles, public.rbac_permissions, public.user_rbac_assignments from anon, authenticated;
grant select, insert, update on public.rbac_roles to authenticated;
grant select, insert, update, delete on public.rbac_permissions to authenticated;
grant select, insert, update on public.user_rbac_assignments to authenticated;

insert into public.rbac_roles (slug, display_name, description, built_in) values
  ('student', 'Student', 'Learning, practice, and personal progress', true),
  ('instructor', 'Instructor', 'Learning support and delivery oversight', true),
  ('security-admin', 'Security Admin', 'Role, permission, and security administration', true),
  ('administrator', 'Administrator', 'Full platform administration', true)
on conflict (slug) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  built_in = true;

create or replace function public.protect_builtin_rbac_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.built_in and tg_op = 'DELETE' then
    raise exception 'Built-in RBAC roles cannot be deleted';
  end if;
  if old.built_in and (new.slug <> old.slug or new.display_name <> old.display_name or not new.built_in) then
    raise exception 'Built-in RBAC role identity cannot be changed';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_builtin_rbac_role_before_change on public.rbac_roles;
create trigger protect_builtin_rbac_role_before_change
  before update or delete on public.rbac_roles
  for each row execute function public.protect_builtin_rbac_role();

with resources(resource_key) as (
  values ('templates'), ('record'), ('practice'), ('progress'), ('dictionary'),
    ('action-trial'), ('peer-review'), ('gtm-pilot'), ('requirements'), ('sprints'),
    ('quality'), ('baselines'), ('financials'), ('admin'), ('profile')
)
insert into public.rbac_permissions (role_id, resource_key, can_view, can_access)
select role.id, resources.resource_key,
  case
    when role.slug in ('administrator', 'security-admin') then true
    when role.slug = 'instructor' and resources.resource_key in (
      'templates', 'record', 'practice', 'progress', 'dictionary', 'action-trial',
      'peer-review', 'gtm-pilot', 'requirements', 'sprints', 'quality', 'baselines', 'profile'
    ) then true
    when role.slug = 'student' and resources.resource_key in (
      'templates', 'record', 'practice', 'progress', 'dictionary', 'action-trial', 'peer-review', 'profile'
    ) then true
    else false
  end,
  case
    when role.slug in ('administrator', 'security-admin') then true
    when role.slug = 'instructor' and resources.resource_key in (
      'templates', 'record', 'practice', 'progress', 'dictionary', 'action-trial',
      'peer-review', 'gtm-pilot', 'requirements', 'sprints', 'quality', 'baselines', 'profile'
    ) then true
    when role.slug = 'student' and resources.resource_key in (
      'templates', 'record', 'practice', 'progress', 'dictionary', 'action-trial', 'peer-review', 'profile'
    ) then true
    else false
  end
from public.rbac_roles role cross join resources
where role.slug in ('student', 'instructor', 'security-admin', 'administrator')
on conflict (role_id, resource_key) do nothing;

create or replace function public.assign_initial_rbac_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare initial_role_id uuid;
begin
  select id into initial_role_id from public.rbac_roles where slug = case
    when new.platform_category = 'CodeWithKris Administrator' then 'administrator'
    else 'student'
  end;
  insert into public.user_rbac_assignments (user_id, role_id)
  values (new.user_id, initial_role_id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists assign_initial_rbac_role_after_account on public.user_accounts;
create trigger assign_initial_rbac_role_after_account
  after insert on public.user_accounts
  for each row execute function public.assign_initial_rbac_role();

insert into public.user_rbac_assignments (user_id, role_id)
select account.user_id, role.id
from public.user_accounts account
join public.rbac_roles role on role.slug = case
  when account.platform_category = 'CodeWithKris Administrator' then 'administrator'
  else 'student'
end
on conflict (user_id) do nothing;

create or replace function public.has_rbac_access(resource_key_input text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select permission.can_access
    from public.user_rbac_assignments assignment
    join public.rbac_permissions permission on permission.role_id = assignment.role_id
    where assignment.user_id = auth.uid()
      and permission.resource_key = resource_key_input
  ), false);
$$;

revoke all on function public.has_rbac_access(text) from public;
grant execute on function public.has_rbac_access(text) to authenticated;

create or replace function public.has_any_rbac_access(resource_keys_input text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_rbac_assignments assignment
    join public.rbac_permissions permission on permission.role_id = assignment.role_id
    where assignment.user_id = auth.uid()
      and permission.resource_key = any(resource_keys_input)
      and permission.can_access
  );
$$;

revoke all on function public.has_any_rbac_access(text[]) from public;
grant execute on function public.has_any_rbac_access(text[]) to authenticated;

-- Existing ownership and workspace policies remain in force. These restrictive policies
-- add RBAC as a mandatory condition for every direct table operation used by a module.
do $$
declare mapping record;
begin
  for mapping in
    select * from (values
      ('dictionary_words', array['dictionary']),
      ('user_profiles', array['profile']),
      ('recordings', array['record', 'progress']),
      ('practice_sessions', array['practice', 'progress']),
      ('learner_action_trials', array['action-trial']),
      ('learning_pod_progress_events', array['templates', 'progress']),
      ('peer_review_submissions', array['peer-review']),
      ('peer_review_feedback', array['peer-review']),
      ('gtm_projects', array['gtm-pilot']),
      ('gtm_project_members', array['gtm-pilot']),
      ('gtm_tasks', array['gtm-pilot']),
      ('gtm_quality_metrics', array['gtm-pilot']),
      ('gtm_targets', array['gtm-pilot']),
      ('gtm_target_contacts', array['gtm-pilot']),
      ('gtm_messages', array['gtm-pilot']),
      ('gtm_outreach_events', array['gtm-pilot']),
      ('gtm_compensation_terms', array['gtm-pilot']),
      ('gtm_milestones', array['gtm-pilot']),
      ('gtm_compensation_splits', array['gtm-pilot']),
      ('gtm_milestone_claims', array['gtm-pilot']),
      ('companies', array['gtm-pilot', 'requirements', 'financials']),
      ('contacts', array['gtm-pilot']),
      ('contact_owner_history', array['gtm-pilot']),
      ('requirement_workspaces', array['requirements', 'sprints', 'quality', 'baselines', 'financials']),
      ('requirement_workspace_members', array['requirements', 'sprints', 'quality', 'baselines']),
      ('requirement_items', array['requirements', 'sprints', 'quality', 'baselines']),
      ('requirement_trace_links', array['requirements']),
      ('planning_folders', array['sprints', 'baselines']),
      ('planning_releases', array['sprints', 'baselines']),
      ('planning_sprints', array['sprints', 'baselines']),
      ('sprint_tasks', array['sprints', 'baselines', 'financials']),
      ('sprint_task_events', array['sprints', 'baselines']),
      ('quality_test_cases', array['quality', 'baselines']),
      ('quality_test_steps', array['quality', 'baselines']),
      ('quality_test_runs', array['quality', 'baselines']),
      ('quality_test_run_steps', array['quality', 'baselines']),
      ('quality_issues', array['quality', 'baselines']),
      ('release_baselines', array['baselines']),
      ('workspace_activity_events', array['baselines']),
      ('project_operating_plans', array['requirements']),
      ('project_operating_milestones', array['requirements']),
      ('project_candidate_assessments', array['requirements']),
      ('project_assignments', array['requirements']),
      ('project_delivery_reviews', array['requirements']),
      ('project_distributions', array['requirements', 'financials']),
      ('project_impact_measures', array['requirements', 'templates']),
      ('project_pdca_cycles', array['requirements']),
      ('project_department_responsibilities', array['requirements']),
      ('contribution_records', array['financials', 'requirements']),
      ('financial_investments', array['financials']),
      ('financial_metrics', array['financials']),
      ('cooperative_impact_snapshots', array['templates', 'financials']),
      ('ovu_contributions', array['financials']),
      ('user_stakeholder_assignments', array['financials'])
    ) as resource_map(table_name, resource_keys)
  loop
    if to_regclass(format('public.%I', mapping.table_name)) is not null then
      execute format('drop policy if exists "RBAC resource access" on public.%I', mapping.table_name);
      execute format(
        'create policy "RBAC resource access" on public.%I as restrictive for all to authenticated using (public.has_any_rbac_access(%L::text[])) with check (public.has_any_rbac_access(%L::text[]))',
        mapping.table_name, mapping.resource_keys::text, mapping.resource_keys::text
      );
    end if;
  end loop;
end $$;

create or replace function public.list_rbac_users()
returns table (user_id uuid, email text, display_name text, role_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_rbac_admin() then raise exception 'Administrator access required'; end if;
  return query
    select user_record.id, user_record.email::text,
      coalesce(user_record.raw_user_meta_data ->> 'full_name', ''), assignment.role_id
    from auth.users user_record
    left join public.user_rbac_assignments assignment on assignment.user_id = user_record.id
    order by user_record.email;
end;
$$;

create or replace function public.assign_rbac_role(target_user_id uuid, target_role_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_rbac_admin() then raise exception 'Administrator access required'; end if;
  if not exists (select 1 from public.rbac_roles where id = target_role_id) then raise exception 'Role not found'; end if;
  insert into public.user_rbac_assignments (user_id, role_id, assigned_by, assigned_at)
  values (target_user_id, target_role_id, auth.uid(), now())
  on conflict (user_id) do update set
    role_id = excluded.role_id,
    assigned_by = auth.uid(),
    assigned_at = now();
end;
$$;

revoke all on function public.list_rbac_users() from public;
revoke all on function public.assign_rbac_role(uuid, uuid) from public;
grant execute on function public.list_rbac_users() to authenticated;
grant execute on function public.assign_rbac_role(uuid, uuid) to authenticated;

alter table public.user_rbac_assignments replica identity full;
alter table public.rbac_permissions replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.user_rbac_assignments;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.rbac_permissions;
exception when duplicate_object then null;
end $$;

drop policy if exists "RBAC storage access" on storage.objects;
create policy "RBAC storage access" on storage.objects
  as restrictive for all to authenticated
  using (
    (bucket_id <> 'quality-evidence' or public.has_rbac_access('quality'))
    and (bucket_id <> 'voice-recordings' or public.has_any_rbac_access(array['record', 'progress']))
  )
  with check (
    (bucket_id <> 'quality-evidence' or public.has_rbac_access('quality'))
    and (bucket_id <> 'voice-recordings' or public.has_any_rbac_access(array['record', 'progress']))
  );