-- Apply after supabase/schema.sql.
-- Hierarchical requirements, collaborative editing, and traceability analysis.

create table if not exists public.requirement_workspaces (
  id uuid primary key default gen_random_uuid(),
  client_company_id uuid references public.companies(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '',
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.requirement_workspaces
  add column if not exists client_company_id uuid references public.companies(id) on delete restrict;

create table if not exists public.requirement_workspace_members (
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_role text not null default 'viewer' check (access_role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.requirement_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  parent_id uuid references public.requirement_items(id) on delete cascade,
  item_type text not null check (item_type in (
    'product_requirement', 'feature', 'user_story', 'task',
    'technical_specification', 'test_case', 'issue'
  )),
  title text not null check (length(trim(title)) between 1 and 200),
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'implemented', 'verified', 'blocked')),
  sort_order integer not null default 0,
  version integer not null default 1 check (version > 0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create index if not exists requirement_items_tree_idx
  on public.requirement_items(workspace_id, parent_id, sort_order, created_at);
create index if not exists requirement_items_type_idx
  on public.requirement_items(workspace_id, item_type, status);

create table if not exists public.requirement_trace_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  source_item_id uuid not null,
  target_item_id uuid not null,
  link_type text not null check (link_type in ('derives', 'satisfies', 'implements', 'verifies', 'blocks', 'relates')),
  rationale text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (source_item_id, workspace_id) references public.requirement_items(id, workspace_id) on delete cascade,
  foreign key (target_item_id, workspace_id) references public.requirement_items(id, workspace_id) on delete cascade,
  check (source_item_id <> target_item_id),
  unique (workspace_id, source_item_id, target_item_id, link_type)
);

create index if not exists requirement_trace_source_idx on public.requirement_trace_links(workspace_id, source_item_id);
create index if not exists requirement_trace_target_idx on public.requirement_trace_links(workspace_id, target_item_id);

create or replace function public.sync_requirement_hierarchy_trace()
returns trigger language plpgsql security definer set search_path = '' as $$
declare generated_link_type text;
begin
  delete from public.requirement_trace_links link
  where link.target_item_id = new.id and link.rationale = 'Generated from hierarchy';
  if new.parent_id is null then return new; end if;
  generated_link_type := case new.item_type
    when 'feature' then 'derives'
    when 'user_story' then 'satisfies'
    when 'task' then 'implements'
    when 'technical_specification' then 'implements'
    when 'test_case' then 'verifies'
    when 'issue' then 'blocks'
    else 'relates'
  end;
  insert into public.requirement_trace_links (
    workspace_id, source_item_id, target_item_id, link_type, rationale, created_by
  ) values (
    new.workspace_id, new.parent_id, new.id, generated_link_type, 'Generated from hierarchy', new.updated_by
  ) on conflict (workspace_id, source_item_id, target_item_id, link_type) do nothing;
  return new;
end;
$$;

drop trigger if exists sync_requirement_hierarchy_trace on public.requirement_items;
create trigger sync_requirement_hierarchy_trace
after insert or update of workspace_id, parent_id, item_type on public.requirement_items
for each row execute function public.sync_requirement_hierarchy_trace();

insert into public.requirement_trace_links (
  workspace_id, source_item_id, target_item_id, link_type, rationale, created_by
)
select item.workspace_id, item.parent_id, item.id,
  case item.item_type
    when 'feature' then 'derives'
    when 'user_story' then 'satisfies'
    when 'task' then 'implements'
    when 'technical_specification' then 'implements'
    when 'test_case' then 'verifies'
    when 'issue' then 'blocks'
    else 'relates'
  end,
  'Generated from hierarchy', item.updated_by
from public.requirement_items item
where item.parent_id is not null
on conflict (workspace_id, source_item_id, target_item_id, link_type) do nothing;

create or replace function public.has_requirement_workspace_access(workspace_id_input uuid, roles_input text[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.requirement_workspace_members member
    where member.workspace_id = workspace_id_input
      and member.user_id = auth.uid()
      and (roles_input is null or member.access_role = any(roles_input))
  );
$$;

create or replace function public.add_requirement_workspace_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.requirement_workspace_members (workspace_id, user_id, access_role)
  values (new.id, new.owner_user_id, 'owner')
  on conflict (workspace_id, user_id) do update set access_role = 'owner';
  return new;
end;
$$;

create or replace function public.validate_requirement_workspace_client()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.client_company_id is null then
    raise exception 'A Client company is required for every new project';
  end if;
  if not exists (
    select 1 from public.companies company
    where company.id = new.client_company_id
      and company.co_type = 'Client'
      and (
        company.co_owner_id = auth.uid()
        or company.secondary_owner_id = auth.uid()
        or company.team_pod_members @> array[auth.uid()::text]
      )
  ) then
    raise exception 'Select an accessible Company classified as Client';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_requirement_workspace_client on public.requirement_workspaces;
create trigger validate_requirement_workspace_client
before insert or update of client_company_id on public.requirement_workspaces
for each row execute function public.validate_requirement_workspace_client();

drop trigger if exists add_requirement_workspace_owner on public.requirement_workspaces;
create trigger add_requirement_workspace_owner after insert on public.requirement_workspaces
for each row execute function public.add_requirement_workspace_owner();

create or replace function public.validate_requirement_hierarchy()
returns trigger language plpgsql set search_path = '' as $$
declare parent_record public.requirement_items%rowtype;
begin
  if new.parent_id is null then
    if new.item_type <> 'product_requirement' then
      raise exception 'Only product requirements may be root items';
    end if;
    return new;
  end if;

  select * into parent_record from public.requirement_items where id = new.parent_id;
  if parent_record.id is null or parent_record.workspace_id <> new.workspace_id then
    raise exception 'Parent item must belong to the same workspace';
  end if;
  if new.id = new.parent_id then raise exception 'An item cannot be its own parent'; end if;
  if not (
    (new.item_type = 'feature' and parent_record.item_type = 'product_requirement')
    or (new.item_type = 'user_story' and parent_record.item_type = 'feature')
    or (new.item_type in ('task', 'technical_specification') and parent_record.item_type = 'user_story')
    or (new.item_type = 'test_case' and parent_record.item_type in ('user_story', 'task', 'technical_specification'))
    or (new.item_type = 'issue' and parent_record.item_type in ('feature', 'user_story', 'task', 'technical_specification', 'test_case'))
  ) then
    raise exception 'Invalid requirement hierarchy';
  end if;
  if exists (
    with recursive ancestors as (
      select item.parent_id from public.requirement_items item where item.id = new.parent_id
      union all
      select item.parent_id from public.requirement_items item join ancestors on item.id = ancestors.parent_id
    ) select 1 from ancestors where parent_id = new.id
  ) then
    raise exception 'Requirement hierarchy cannot contain a cycle';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_requirement_hierarchy on public.requirement_items;
create trigger validate_requirement_hierarchy before insert or update of workspace_id, parent_id, item_type
on public.requirement_items for each row execute function public.validate_requirement_hierarchy();

create or replace function public.version_requirement_item()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.content is distinct from old.content or new.title is distinct from old.title or new.status is distinct from old.status then
    new.version := old.version + 1;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists version_requirement_item on public.requirement_items;
create trigger version_requirement_item before update on public.requirement_items
for each row execute function public.version_requirement_item();

create or replace function public.requirement_impact_analysis(item_id_input uuid, direction_input text default 'both')
returns table (
  item_id uuid, title text, item_type text, status text, depth integer,
  direction text, via_link_type text, path uuid[]
) language sql stable security invoker set search_path = '' as $$
  with recursive impact(id, title, item_type, status, depth, direction, link_type, path) as (
    select item.id, item.title, item.item_type, item.status, 0, 'origin'::text, null::text, array[item.id]
    from public.requirement_items item where item.id = item_id_input
    union all
    select next_item.id, next_item.title, next_item.item_type, next_item.status, impact.depth + 1,
      edge.direction, edge.link_type, impact.path || next_item.id
    from impact
    join lateral (
      select link.target_item_id as next_id, 'forward'::text as direction, link.link_type
      from public.requirement_trace_links link
      where link.source_item_id = impact.id and direction_input in ('forward', 'both')
      union all
      select link.source_item_id, 'backward'::text, link.link_type
      from public.requirement_trace_links link
      where link.target_item_id = impact.id and direction_input in ('backward', 'both')
    ) edge on true
    join public.requirement_items next_item on next_item.id = edge.next_id
    where impact.depth < 12 and not next_item.id = any(impact.path)
  )
  select distinct on (impact.id, impact.direction) impact.id, impact.title, impact.item_type,
    impact.status, impact.depth, impact.direction, impact.link_type, impact.path
  from impact order by impact.id, impact.direction, impact.depth;
$$;

alter table public.requirement_workspaces enable row level security;
alter table public.requirement_workspace_members enable row level security;
alter table public.requirement_items enable row level security;
alter table public.requirement_trace_links enable row level security;

drop policy if exists "Members read requirement workspaces" on public.requirement_workspaces;
create policy "Members read requirement workspaces" on public.requirement_workspaces for select to authenticated
  using (public.has_requirement_workspace_access(id));
drop policy if exists "Users create requirement workspaces" on public.requirement_workspaces;
create policy "Users create requirement workspaces" on public.requirement_workspaces for insert to authenticated
  with check (owner_user_id = auth.uid());
drop policy if exists "Owners update requirement workspaces" on public.requirement_workspaces;
create policy "Owners update requirement workspaces" on public.requirement_workspaces for update to authenticated
  using (public.has_requirement_workspace_access(id, array['owner']))
  with check (public.has_requirement_workspace_access(id, array['owner']));

drop policy if exists "Members read requirement membership" on public.requirement_workspace_members;
create policy "Members read requirement membership" on public.requirement_workspace_members for select to authenticated
  using (public.has_requirement_workspace_access(workspace_id));
drop policy if exists "Owners manage requirement membership" on public.requirement_workspace_members;
create policy "Owners manage requirement membership" on public.requirement_workspace_members for all to authenticated
  using (public.has_requirement_workspace_access(workspace_id, array['owner']))
  with check (public.has_requirement_workspace_access(workspace_id, array['owner']));

drop policy if exists "Members read requirement items" on public.requirement_items;
create policy "Members read requirement items" on public.requirement_items for select to authenticated
  using (public.has_requirement_workspace_access(workspace_id));
drop policy if exists "Editors manage requirement items" on public.requirement_items;
create policy "Editors manage requirement items" on public.requirement_items for all to authenticated
  using (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']))
  with check (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));

drop policy if exists "Members read requirement traces" on public.requirement_trace_links;
create policy "Members read requirement traces" on public.requirement_trace_links for select to authenticated
  using (public.has_requirement_workspace_access(workspace_id));
drop policy if exists "Editors manage requirement traces" on public.requirement_trace_links;
create policy "Editors manage requirement traces" on public.requirement_trace_links for all to authenticated
  using (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']))
  with check (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));

revoke all on public.requirement_workspaces, public.requirement_workspace_members,
  public.requirement_items, public.requirement_trace_links from anon, authenticated;
grant select, insert, update on public.requirement_workspaces to authenticated;
grant select, insert, update, delete on public.requirement_workspace_members to authenticated;
grant select, insert, update, delete on public.requirement_items, public.requirement_trace_links to authenticated;
revoke all on function public.has_requirement_workspace_access(uuid, text[]) from public;
revoke all on function public.requirement_impact_analysis(uuid, text) from public;
revoke all on function public.validate_requirement_workspace_client() from public;
grant execute on function public.has_requirement_workspace_access(uuid, text[]) to authenticated;
grant execute on function public.requirement_impact_analysis(uuid, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.requirement_items;
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.requirement_trace_links;
exception when duplicate_object then null;
end
$$;