-- Apply after supabase/schema.sql and supabase/crm_schema.sql.
-- GTM workflow, contact PII, and compensation use separate security domains.

create table if not exists public.gtm_projects (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  client_name text not null,
  name text not null,
  objective text not null,
  target_market text not null,
  languages text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gtm_project_members (
  project_id uuid not null references public.gtm_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'participant' check (member_role in ('participant', 'ambassador', 'outreach', 'reviewer')),
  participant_group text not null default 'Open community' check (participant_group in ('PwD', 'Student', 'Woman', 'Caregiver', 'Mentor', 'Open community')),
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.gtm_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gtm_projects(id) on delete cascade,
  task_type text not null,
  title text not null,
  description text not null default '',
  participant_group text not null default 'Open community' check (participant_group in ('PwD', 'Student', 'Woman', 'Caregiver', 'Mentor', 'Open community')),
  assignee_user_id uuid references auth.users(id) on delete set null,
  assignee_name text,
  status text not null default 'backlog' check (status in ('backlog', 'assigned', 'in_progress', 'awaiting_review', 'verified')),
  task_data jsonb not null default '{}'::jsonb,
  ovu_status text not null default 'not_started' check (ovu_status in ('not_started', 'pending_verification', 'recorded')),
  ovu_value numeric check (ovu_value is null or ovu_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Client-safe target context contains no personal contact details.
create table if not exists public.gtm_targets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gtm_projects(id) on delete cascade,
  target_code text not null,
  company_name text not null,
  contact_title text not null,
  segment text not null,
  market text not null,
  status text not null default 'research' check (status in ('research', 'client_review', 'prioritized', 'outreach', 'converted')),
  priority integer check (priority is null or priority > 0),
  created_at timestamptz not null default now(),
  unique (id, project_id),
  unique (project_id, target_code)
);

alter table public.companies
  add column if not exists gtm_target_id uuid references public.gtm_targets(id) on delete set null;
alter table public.contacts
  add column if not exists gtm_target_id uuid references public.gtm_targets(id) on delete set null;

create index if not exists companies_gtm_target_id_idx on public.companies(gtm_target_id);
create index if not exists contacts_gtm_target_id_idx on public.contacts(gtm_target_id);

create or replace function public.crm_validate_contact_target_link()
returns trigger
language plpgsql
set search_path = ''
as $$
declare company_target_id uuid;
begin
  if new.company_id is not null then
    select company.gtm_target_id into company_target_id
    from public.companies company
    where company.id = new.company_id;

    if company_target_id is distinct from new.gtm_target_id then
      raise exception 'Contact and company must link to the same GTM target.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_validate_gtm_target_link on public.contacts;
create trigger contacts_validate_gtm_target_link
before insert or update of company_id, gtm_target_id on public.contacts
for each row execute function public.crm_validate_contact_target_link();

-- Personal contact details never enter the client-safe target table or view.
create table if not exists public.gtm_target_contacts (
  target_id uuid primary key references public.gtm_targets(id) on delete cascade,
  project_id uuid not null references public.gtm_projects(id) on delete cascade,
  contact_name text,
  email text,
  phone text,
  profile_url text,
  source_notes text not null default '',
  created_at timestamptz not null default now(),
  foreign key (target_id, project_id) references public.gtm_targets(id, project_id) on delete cascade
);

create table if not exists public.gtm_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gtm_projects(id) on delete cascade,
  name text not null,
  locale text not null,
  channel text not null check (channel in ('local_language', 'email', 'call', 'video_call')),
  content text not null,
  status text not null default 'draft' check (status in ('draft', 'client_review', 'approved', 'retired')),
  revision integer not null default 1,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.gtm_outreach_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gtm_projects(id) on delete cascade,
  target_code text not null,
  message_id uuid not null references public.gtm_messages(id) on delete restrict,
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  locale text not null,
  channel text not null check (channel in ('local_language', 'email', 'call', 'video_call')),
  outcome text not null,
  occurred_at timestamptz not null default now(),
  appointment_at timestamptz,
  foreign key (project_id, target_code) references public.gtm_targets(project_id, target_code) on delete restrict
);

create table if not exists public.gtm_compensation_terms (
  project_id uuid primary key references public.gtm_projects(id) on delete cascade,
  currency text not null default 'HKD',
  success_fee_percent numeric not null check (success_fee_percent between 8 and 10),
  configured_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table if not exists public.gtm_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gtm_projects(id) on delete cascade,
  milestone_key text not null,
  label text not null,
  minimum_hkd numeric not null check (minimum_hkd >= 0),
  maximum_hkd numeric not null check (maximum_hkd >= minimum_hkd),
  unique (project_id, milestone_key)
);

create table if not exists public.gtm_compensation_splits (
  project_id uuid not null references public.gtm_projects(id) on delete cascade,
  department text not null,
  percentage numeric not null check (percentage between 0 and 100),
  primary key (project_id, department)
);

create table if not exists public.gtm_milestone_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gtm_projects(id) on delete cascade,
  task_id uuid not null references public.gtm_tasks(id) on delete restrict,
  milestone_id uuid not null references public.gtm_milestones(id) on delete restrict,
  contributor_id uuid not null references auth.users(id) on delete restrict,
  approved_amount_hkd numeric check (approved_amount_hkd is null or approved_amount_hkd >= 0),
  status text not null default 'pending' check (status in ('pending', 'verified', 'approved', 'paid')),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  unique (task_id, milestone_id)
);

alter table public.contribution_records
  add column if not exists gtm_task_id uuid references public.gtm_tasks(id) on delete set null;
alter table public.ovu_contributions
  add column if not exists gtm_task_id uuid references public.gtm_tasks(id) on delete set null;

create or replace view public.gtm_anonymized_targets with (security_invoker = true) as
select id, project_id, target_code, company_name, contact_title, segment, market, status, priority, created_at
from public.gtm_targets;

alter table public.gtm_projects enable row level security;
alter table public.gtm_project_members enable row level security;
alter table public.gtm_tasks enable row level security;
alter table public.gtm_targets enable row level security;
alter table public.gtm_target_contacts enable row level security;
alter table public.gtm_messages enable row level security;
alter table public.gtm_outreach_events enable row level security;
alter table public.gtm_compensation_terms enable row level security;
alter table public.gtm_milestones enable row level security;
alter table public.gtm_compensation_splits enable row level security;
alter table public.gtm_milestone_claims enable row level security;

create or replace function public.is_gtm_project_client(project_id_input uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.gtm_projects where id = project_id_input and client_user_id = auth.uid());
$$;

create or replace function public.is_gtm_project_member(project_id_input uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.gtm_project_members where project_id = project_id_input and user_id = auth.uid());
$$;

create or replace function public.can_manage_gtm_project(project_id_input uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_financial_access() or public.is_gtm_project_client(project_id_input);
$$;

revoke all on function public.is_gtm_project_client(uuid) from public;
revoke all on function public.is_gtm_project_member(uuid) from public;
revoke all on function public.can_manage_gtm_project(uuid) from public;
grant execute on function public.is_gtm_project_client(uuid) to authenticated;
grant execute on function public.is_gtm_project_member(uuid) to authenticated;
grant execute on function public.can_manage_gtm_project(uuid) to authenticated;

do $$
declare policy_record record;
begin
  for policy_record in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'gtm_projects', 'gtm_project_members', 'gtm_tasks', 'gtm_targets',
        'gtm_target_contacts', 'gtm_messages', 'gtm_outreach_events',
        'gtm_compensation_terms', 'gtm_milestones', 'gtm_compensation_splits',
        'gtm_milestone_claims'
      ])
  loop
    execute format('drop policy if exists %I on public.%I', policy_record.policyname, policy_record.tablename);
  end loop;
end
$$;

create policy "Allow clients create own GTM pilots" on public.gtm_projects for insert to authenticated
  with check (client_user_id = auth.uid());
create policy "Allow project participants read GTM pilots" on public.gtm_projects for select to authenticated
  using (public.can_manage_gtm_project(id) or public.is_gtm_project_member(id));
create policy "Allow clients and admins update GTM pilots" on public.gtm_projects for update to authenticated
  using (public.can_manage_gtm_project(id)) with check (public.can_manage_gtm_project(id));

create policy "Allow project participants read memberships" on public.gtm_project_members for select to authenticated
  using (public.can_manage_gtm_project(project_id) or public.is_gtm_project_member(project_id));
create policy "Allow clients and admins manage memberships" on public.gtm_project_members for all to authenticated
  using (public.can_manage_gtm_project(project_id)) with check (public.can_manage_gtm_project(project_id));

create policy "Allow project participants read GTM tasks" on public.gtm_tasks for select to authenticated
  using (public.can_manage_gtm_project(project_id) or public.is_gtm_project_member(project_id));
create policy "Allow managers create GTM tasks" on public.gtm_tasks for insert to authenticated
  with check (public.can_manage_gtm_project(project_id) or public.is_producer_owner());
create policy "Allow assignees and managers update GTM tasks" on public.gtm_tasks for update to authenticated
  using (assignee_user_id = auth.uid() or public.can_manage_gtm_project(project_id) or public.is_producer_owner())
  with check (assignee_user_id = auth.uid() or public.can_manage_gtm_project(project_id) or public.is_producer_owner());

create or replace function public.validate_new_gtm_task()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status not in ('backlog', 'assigned') or new.ovu_status <> 'not_started' or new.ovu_value is not null then
    raise exception 'New tasks must begin without verified OVU state.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_new_gtm_task on public.gtm_tasks;
create trigger validate_new_gtm_task before insert on public.gtm_tasks
for each row execute function public.validate_new_gtm_task();

create or replace function public.protect_gtm_task_verification()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.can_manage_gtm_project(old.project_id) and not public.is_producer_owner() and (
    new.project_id is distinct from old.project_id
    or new.task_type is distinct from old.task_type
    or new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.participant_group is distinct from old.participant_group
    or new.assignee_user_id is distinct from old.assignee_user_id
    or new.assignee_name is distinct from old.assignee_name
    or new.task_data is distinct from old.task_data
  ) then
    raise exception 'Assignees may update workflow state only.';
  end if;
  if (
    new.status = 'verified'
    or new.ovu_status = 'recorded'
    or new.ovu_value is distinct from old.ovu_value
  ) and coalesce(current_setting('app.gtm_verification_task', true), '') <> new.id::text then
    raise exception 'The task verification RPC is required to record OVU.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_gtm_task_verification on public.gtm_tasks;
create trigger protect_gtm_task_verification before update on public.gtm_tasks
for each row execute function public.protect_gtm_task_verification();

create policy "Allow project participants read anonymized targets" on public.gtm_targets for select to authenticated
  using (public.can_manage_gtm_project(project_id) or public.is_gtm_project_member(project_id));
create policy "Allow project participants submit anonymized targets" on public.gtm_targets for insert to authenticated
  with check (
    (public.can_manage_gtm_project(project_id) or public.is_gtm_project_member(project_id))
    and status in ('research', 'client_review')
    and priority is null
  );
create policy "Allow clients and admins prioritize targets" on public.gtm_targets for update to authenticated
  using (public.can_manage_gtm_project(project_id)) with check (public.can_manage_gtm_project(project_id));

create policy "Restrict target contact details" on public.gtm_target_contacts for select to authenticated using (
  public.has_financial_access()
  or (
    exists (select 1 from public.gtm_targets target where target.id = target_id and target.project_id = project_id and target.status in ('prioritized', 'outreach', 'converted'))
    and exists (select 1 from public.gtm_project_members member where member.project_id = project_id and member.user_id = auth.uid() and member.member_role = 'outreach')
  )
);
create policy "Allow admins manage target contact details" on public.gtm_target_contacts for all to authenticated
  using (public.has_financial_access()) with check (public.has_financial_access());

create policy "Allow project participants read messages" on public.gtm_messages for select to authenticated
  using (public.can_manage_gtm_project(project_id) or public.is_gtm_project_member(project_id));
create policy "Allow project participants submit message drafts" on public.gtm_messages for insert to authenticated
  with check (
    (public.can_manage_gtm_project(project_id) or public.is_gtm_project_member(project_id))
    and status in ('draft', 'client_review')
    and approved_by is null
    and approved_at is null
  );
create policy "Allow clients and admins approve messages" on public.gtm_messages for update to authenticated
  using (public.can_manage_gtm_project(project_id)) with check (public.can_manage_gtm_project(project_id));

create or replace function public.protect_approved_gtm_message()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'approved' then
    raise exception 'Approved messages are immutable; create a new revision instead.';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists protect_approved_gtm_message on public.gtm_messages;
create trigger protect_approved_gtm_message before update on public.gtm_messages
for each row execute function public.protect_approved_gtm_message();

create policy "Allow project participants read outreach events" on public.gtm_outreach_events for select to authenticated
  using (public.can_manage_gtm_project(project_id) or public.is_gtm_project_member(project_id));
create policy "Allow approved multilingual outreach logs" on public.gtm_outreach_events for insert to authenticated with check (
  actor_user_id = auth.uid()
  and (public.can_manage_gtm_project(project_id) or public.is_gtm_project_member(project_id))
  and exists (
    select 1 from public.gtm_messages message
    where message.id = message_id
      and message.project_id = project_id
      and message.status = 'approved'
      and message.locale = locale
      and message.channel = channel
  )
  and exists (select 1 from public.gtm_targets target where target.project_id = project_id and target.target_code = target_code)
);

create policy "Restrict compensation terms to client and admin" on public.gtm_compensation_terms for select to authenticated
  using (public.can_manage_gtm_project(project_id));
create policy "Restrict milestones to client and admin" on public.gtm_milestones for select to authenticated
  using (public.can_manage_gtm_project(project_id));
create policy "Restrict compensation splits to client and admin" on public.gtm_compensation_splits for select to authenticated
  using (public.can_manage_gtm_project(project_id));
create policy "Restrict milestone claims to client and admin" on public.gtm_milestone_claims for select to authenticated
  using (public.can_manage_gtm_project(project_id));

create or replace function public.configure_gtm_compensation(
  project_id_input uuid,
  success_fee_percent_input numeric,
  milestones_input jsonb,
  splits_input jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare split_total numeric;
begin
  if not public.can_manage_gtm_project(project_id_input) then raise exception 'Not authorized'; end if;
  if success_fee_percent_input < 8 or success_fee_percent_input > 10 then raise exception 'Success fee must be between 8 and 10 percent'; end if;
  select coalesce(sum((item->>'percentage')::numeric), 0) into split_total from jsonb_array_elements(splits_input) item;
  if split_total <> 100 then raise exception 'Department splits must total 100 percent'; end if;
  if exists (select 1 from jsonb_array_elements(milestones_input) item where (item->>'maximumHkd')::numeric < (item->>'minimumHkd')::numeric) then
    raise exception 'Milestone maximum cannot be below minimum';
  end if;

  insert into public.gtm_compensation_terms (project_id, success_fee_percent, configured_by, updated_at)
  values (project_id_input, success_fee_percent_input, auth.uid(), now())
  on conflict (project_id) do update set
    success_fee_percent = excluded.success_fee_percent,
    configured_by = auth.uid(),
    updated_at = now();
  insert into public.gtm_milestones (project_id, milestone_key, label, minimum_hkd, maximum_hkd)
  select project_id_input, item->>'key', item->>'label', (item->>'minimumHkd')::numeric, (item->>'maximumHkd')::numeric
  from jsonb_array_elements(milestones_input) item
  on conflict (project_id, milestone_key) do update set
    label = excluded.label,
    minimum_hkd = excluded.minimum_hkd,
    maximum_hkd = excluded.maximum_hkd;
  delete from public.gtm_milestones milestone
  where milestone.project_id = project_id_input
    and not exists (select 1 from jsonb_array_elements(milestones_input) item where item->>'key' = milestone.milestone_key)
    and not exists (select 1 from public.gtm_milestone_claims claim where claim.milestone_id = milestone.id);
  delete from public.gtm_compensation_splits where project_id = project_id_input;
  insert into public.gtm_compensation_splits (project_id, department, percentage)
  select project_id_input, item->>'department', (item->>'percentage')::numeric
  from jsonb_array_elements(splits_input) item;
end;
$$;

revoke all on function public.configure_gtm_compensation(uuid, numeric, jsonb, jsonb) from public;
grant execute on function public.configure_gtm_compensation(uuid, numeric, jsonb, jsonb) to authenticated;

create or replace function public.verify_gtm_task_contribution(
  task_id_input uuid,
  approved_hours_input numeric,
  approved_ovu_input numeric,
  contributor_address_input text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare task_record public.gtm_tasks%rowtype;
declare project_record public.gtm_projects%rowtype;
declare contributor_email text;
declare contributor_name text;
declare contributor_role text;
declare stakeholder text;
declare ovu_id uuid;
declare tier_name text;
begin
  if not public.has_financial_access() then raise exception 'Administrator verification required'; end if;
  if approved_hours_input < 0 or approved_ovu_input < 0 then raise exception 'Approved values cannot be negative'; end if;
  select * into task_record from public.gtm_tasks where id = task_id_input for update;
  if task_record.id is null or task_record.assignee_user_id is null or task_record.status <> 'awaiting_review' then
    raise exception 'Task is not ready for verification';
  end if;
  select * into project_record from public.gtm_projects where id = task_record.project_id;
  select email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)), coalesce(raw_user_meta_data->>'role', 'Individual')
    into contributor_email, contributor_name, contributor_role
    from auth.users where id = task_record.assignee_user_id;
  select stakeholder_category into stakeholder
    from public.user_stakeholder_assignments where user_id = task_record.assignee_user_id;
  if stakeholder is null then raise exception 'Contributor stakeholder assignment is required'; end if;
  tier_name := case
    when approved_ovu_input <= 3 then 'Tier 1'
    when approved_ovu_input <= 8 then 'Tier 2'
    when approved_ovu_input <= 15 then 'Tier 3'
    when approved_ovu_input <= 25 then 'Tier 4'
    else 'Tier 5'
  end;

  insert into public.contribution_records (
    contribution_key, contributor_id, contributor_name, contributor_email, role,
    client_code, project_code, department_category, effort_category,
    contribution_type, description, logged_hours, weighted_units, status, gtm_task_id
  ) values (
    'gtm-task-' || task_record.id::text, task_record.assignee_user_id, contributor_name, contributor_email, contributor_role,
    project_record.client_name, project_record.name, 'Delivery', 'Marketing', task_record.title, task_record.description,
    approved_hours_input, approved_ovu_input, 'verified', task_record.id
  ) on conflict (contribution_key) do update set
    contributor_id = excluded.contributor_id,
    contributor_name = excluded.contributor_name,
    contributor_email = excluded.contributor_email,
    role = excluded.role,
    client_code = excluded.client_code,
    project_code = excluded.project_code,
    department_category = excluded.department_category,
    effort_category = excluded.effort_category,
    contribution_type = excluded.contribution_type,
    description = excluded.description,
    logged_hours = excluded.logged_hours,
    weighted_units = excluded.weighted_units,
    status = 'verified',
    gtm_task_id = excluded.gtm_task_id;

  insert into public.ovu_contributions (
    contributor_address, contributor_id, task_id, tier, base_ovu, final_ovu,
    final_ovu_wei, period_id, stakeholder_category, gtm_task_id
  ) values (
    contributor_address_input, task_record.assignee_user_id, task_record.id::text, tier_name,
    approved_ovu_input, approved_ovu_input,
    trunc(approved_ovu_input * 1000000000000000000)::numeric::text,
    extract(year from now())::integer * 100 + extract(month from now())::integer,
    stakeholder, task_record.id
  ) returning id into ovu_id;

  perform set_config('app.gtm_verification_task', task_record.id::text, true);
  update public.gtm_tasks set
    status = 'verified',
    ovu_status = 'recorded',
    ovu_value = approved_ovu_input,
    updated_at = now()
  where id = task_record.id;
  return ovu_id;
end;
$$;

revoke all on function public.verify_gtm_task_contribution(uuid, numeric, numeric, text) from public;
grant execute on function public.verify_gtm_task_contribution(uuid, numeric, numeric, text) to authenticated;

grant select on public.gtm_anonymized_targets to authenticated;