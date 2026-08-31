-- Apply after Supabase Auth is available.
-- CRM records are private to their owners, secondary owners, and team pod members.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (
    select 1 from pg_type type
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public' and type.typname = 'co_type_enum'
  ) then
    create type public.co_type_enum as enum ('InternalProspect', 'Client', 'ClientLead');
  end if;

  if not exists (
    select 1 from pg_type type
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public' and type.typname = 'co_lead_status_enum'
  ) then
    create type public.co_lead_status_enum as enum ('active client', 'target prospect', 'partner');
  end if;

  if not exists (
    select 1 from pg_type type
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public' and type.typname = 'contact_stage_enum'
  ) then
    create type public.contact_stage_enum as enum (
      'Subscriber', 'Lead', 'MQL', 'SQL', 'Opportunity', 'Customer', 'Evangelist', 'Other'
    );
  end if;

  if not exists (
    select 1 from pg_type type
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public' and type.typname = 'contact_lead_status_enum'
  ) then
    create type public.contact_lead_status_enum as enum ('New', 'Open', 'In Progress', 'Open Deal', 'Unqualified');
  end if;

  if not exists (
    select 1 from pg_type type
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public' and type.typname = 'original_source_enum'
  ) then
    create type public.original_source_enum as enum ('Organic Search', 'Paid Social', 'Offline Imports');
  end if;
end
$$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  co_name text not null,
  co_url text,
  co_type public.co_type_enum,
  co_linkedin text,
  co_owner_id uuid references auth.users(id) on delete set null,
  co_lead_status public.co_lead_status_enum,
  co_industry text,
  co_description text,
  co_no_of_employees integer check (co_no_of_employees is null or co_no_of_employees >= 0),
  address_country text,
  address_postal_code text,
  address_state text,
  address_city text,
  address_street text,
  address_building_unit text,
  secondary_owner_id uuid references auth.users(id) on delete set null,
  outbound_rep_id uuid references auth.users(id) on delete set null,
  account_manager_id uuid references auth.users(id) on delete set null,
  team_pod_members text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  type text,
  email text unique,
  company_id uuid references public.companies(id) on delete set null,
  contact_owner_id uuid references auth.users(id) on delete set null,
  phone text,
  mobile text,
  job_title text,
  stage public.contact_stage_enum,
  lead_status public.contact_lead_status_enum,
  original_source public.original_source_enum,
  last_activity_date timestamptz,
  sales_activities_count integer not null default 0 check (sales_activities_count >= 0),
  marketing_delivered integer not null default 0 check (marketing_delivered >= 0),
  marketing_clicked integer not null default 0 check (marketing_clicked >= 0),
  marketing_opened integer not null default 0 check (marketing_opened >= 0),
  secondary_owner_id uuid references auth.users(id) on delete set null,
  outbound_rep_id uuid references auth.users(id) on delete set null,
  account_manager_id uuid references auth.users(id) on delete set null,
  team_pod_members text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_owner_history (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete restrict,
  previous_owner_id uuid,
  new_owner_id uuid,
  changed_at timestamptz not null default now()
);

create index if not exists companies_co_owner_id_idx on public.companies(co_owner_id);
create index if not exists companies_secondary_owner_id_idx on public.companies(secondary_owner_id);
create index if not exists companies_team_pod_members_idx on public.companies using gin(team_pod_members);
create index if not exists contacts_company_id_idx on public.contacts(company_id);
create index if not exists contacts_contact_owner_id_idx on public.contacts(contact_owner_id);
create index if not exists contacts_secondary_owner_id_idx on public.contacts(secondary_owner_id);
create index if not exists contacts_team_pod_members_idx on public.contacts using gin(team_pod_members);
create index if not exists contact_owner_history_contact_id_changed_at_idx
  on public.contact_owner_history(contact_id, changed_at desc);

create or replace function public.crm_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.crm_log_contact_owner_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.contact_owner_id is distinct from new.contact_owner_id then
    insert into public.contact_owner_history (contact_id, previous_owner_id, new_owner_id)
    values (new.id, old.contact_owner_id, new.contact_owner_id);
  end if;
  return new;
end;
$$;

create or replace function public.crm_is_team_pod_member(team_pod_members_input text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    auth.uid() is not null
    and team_pod_members_input @> array[auth.uid()::text];
$$;

create or replace function public.crm_protect_company_access_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.co_owner_id is distinct from old.co_owner_id
    or new.secondary_owner_id is distinct from old.secondary_owner_id
    or new.team_pod_members is distinct from old.team_pod_members
  ) and old.co_owner_id is distinct from auth.uid() then
    raise exception 'Only the company owner can change company access assignments.';
  end if;
  return new;
end;
$$;

create or replace function public.crm_protect_contact_access_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.contact_owner_id is distinct from old.contact_owner_id
    or new.secondary_owner_id is distinct from old.secondary_owner_id
    or new.team_pod_members is distinct from old.team_pod_members
  ) and old.contact_owner_id is distinct from auth.uid() then
    raise exception 'Only the contact owner can change contact access assignments.';
  end if;
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.crm_set_updated_at();

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.crm_set_updated_at();

drop trigger if exists companies_protect_access_fields on public.companies;
create trigger companies_protect_access_fields
before update on public.companies
for each row execute function public.crm_protect_company_access_fields();

drop trigger if exists contacts_protect_access_fields on public.contacts;
create trigger contacts_protect_access_fields
before update on public.contacts
for each row execute function public.crm_protect_contact_access_fields();

drop trigger if exists contacts_log_owner_change on public.contacts;
create trigger contacts_log_owner_change
after update of contact_owner_id on public.contacts
for each row execute function public.crm_log_contact_owner_change();

alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_owner_history enable row level security;

drop policy if exists "CRM users read accessible companies" on public.companies;
create policy "CRM users read accessible companies"
on public.companies for select to authenticated
using (
  co_owner_id = auth.uid()
  or secondary_owner_id = auth.uid()
  or public.crm_is_team_pod_member(team_pod_members)
);

drop policy if exists "CRM users create accessible companies" on public.companies;
create policy "CRM users create accessible companies"
on public.companies for insert to authenticated
with check (co_owner_id = auth.uid());

drop policy if exists "CRM users update accessible companies" on public.companies;
create policy "CRM users update accessible companies"
on public.companies for update to authenticated
using (
  co_owner_id = auth.uid()
  or secondary_owner_id = auth.uid()
  or public.crm_is_team_pod_member(team_pod_members)
)
with check (
  co_owner_id = auth.uid()
  or secondary_owner_id = auth.uid()
  or public.crm_is_team_pod_member(team_pod_members)
);

drop policy if exists "CRM company owners transfer ownership" on public.companies;
create policy "CRM company owners transfer ownership"
on public.companies for update to authenticated
using (co_owner_id = auth.uid())
with check (true);

drop policy if exists "CRM users delete accessible companies" on public.companies;
create policy "CRM users delete accessible companies"
on public.companies for delete to authenticated
using (co_owner_id = auth.uid());

drop policy if exists "CRM users read accessible contacts" on public.contacts;
create policy "CRM users read accessible contacts"
on public.contacts for select to authenticated
using (
  contact_owner_id = auth.uid()
  or secondary_owner_id = auth.uid()
  or public.crm_is_team_pod_member(team_pod_members)
);

drop policy if exists "CRM users create accessible contacts" on public.contacts;
create policy "CRM users create accessible contacts"
on public.contacts for insert to authenticated
with check (contact_owner_id = auth.uid());

drop policy if exists "CRM users update accessible contacts" on public.contacts;
create policy "CRM users update accessible contacts"
on public.contacts for update to authenticated
using (
  contact_owner_id = auth.uid()
  or secondary_owner_id = auth.uid()
  or public.crm_is_team_pod_member(team_pod_members)
)
with check (
  contact_owner_id = auth.uid()
  or secondary_owner_id = auth.uid()
  or public.crm_is_team_pod_member(team_pod_members)
);

drop policy if exists "CRM contact owners transfer ownership" on public.contacts;
create policy "CRM contact owners transfer ownership"
on public.contacts for update to authenticated
using (contact_owner_id = auth.uid())
with check (true);

drop policy if exists "CRM users delete accessible contacts" on public.contacts;
create policy "CRM users delete accessible contacts"
on public.contacts for delete to authenticated
using (
  contact_owner_id = auth.uid()
  and not exists (
    select 1
    from public.contact_owner_history history
    where history.contact_id = contacts.id
  )
);

drop policy if exists "CRM users read accessible owner history" on public.contact_owner_history;
create policy "CRM users read accessible owner history"
on public.contact_owner_history for select to authenticated
using (
  exists (
    select 1
    from public.contacts contact
    where contact.id = contact_owner_history.contact_id
      and (
        contact.contact_owner_id = auth.uid()
        or contact.secondary_owner_id = auth.uid()
        or public.crm_is_team_pod_member(contact.team_pod_members)
      )
  )
);

revoke all on public.companies, public.contacts, public.contact_owner_history from anon;
revoke all on public.companies, public.contacts, public.contact_owner_history from authenticated;
grant select, insert, update, delete on public.companies, public.contacts to authenticated;
grant select on public.contact_owner_history to authenticated;

revoke all on function public.crm_log_contact_owner_change() from public;
revoke all on function public.crm_set_updated_at() from public;
revoke all on function public.crm_protect_company_access_fields() from public;
revoke all on function public.crm_protect_contact_access_fields() from public;
revoke all on function public.crm_is_team_pod_member(text[]) from public;
grant execute on function public.crm_is_team_pod_member(text[]) to authenticated;
