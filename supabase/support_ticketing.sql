-- Isolated issue tracking and support ticketing module.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  requester_email text not null default '',
  requester_display_name text not null default '',
  request_type text not null check (request_type in ('bug', 'feature', 'training', 'network', 'other')),
  title text not null check (length(trim(title)) between 3 and 160),
  description jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  assigned_agent_id uuid references auth.users(id) on delete set null,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('user', 'support_agent')),
  body jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  message_id uuid references public.support_ticket_messages(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_requester_created_idx on public.support_tickets(requester_id, created_at desc);
create index if not exists support_tickets_queue_idx on public.support_tickets(status, request_type, created_at desc);
create index if not exists support_ticket_messages_ticket_created_idx on public.support_ticket_messages(ticket_id, created_at);
create index if not exists support_ticket_attachments_ticket_idx on public.support_ticket_attachments(ticket_id);

create or replace function public.is_support_agent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_rbac_admin() or exists (
    select 1
    from public.user_rbac_assignments assignment
    join public.rbac_roles role on role.id = assignment.role_id
    where assignment.user_id = auth.uid() and role.slug = 'support-agent'
  );
$$;

revoke all on function public.is_support_agent() from public;
grant execute on function public.is_support_agent() to authenticated;

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_attachments enable row level security;

drop policy if exists "Users read own tickets and agents read queue" on public.support_tickets;
create policy "Users read own tickets and agents read queue" on public.support_tickets
  for select to authenticated using (requester_id = auth.uid() or public.is_support_agent());
drop policy if exists "Users submit own tickets" on public.support_tickets;
create policy "Users submit own tickets" on public.support_tickets
  for insert to authenticated with check (requester_id = auth.uid());
drop policy if exists "Support agents update tickets" on public.support_tickets;
create policy "Support agents update tickets" on public.support_tickets
  for update to authenticated using (public.is_support_agent()) with check (public.is_support_agent());

drop policy if exists "Support module RBAC" on public.support_tickets;
create policy "Support module RBAC" on public.support_tickets
  as restrictive for all to authenticated
  using (public.has_rbac_access('support')) with check (public.has_rbac_access('support'));

drop policy if exists "Participants read ticket messages" on public.support_ticket_messages;
create policy "Participants read ticket messages" on public.support_ticket_messages
  for select to authenticated using (exists (
    select 1 from public.support_tickets ticket
    where ticket.id = ticket_id and (ticket.requester_id = auth.uid() or public.is_support_agent())
  ));
drop policy if exists "Participants add ticket messages" on public.support_ticket_messages;
create policy "Participants add ticket messages" on public.support_ticket_messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and ((sender_role = 'support_agent' and public.is_support_agent()) or (sender_role = 'user' and exists (
      select 1 from public.support_tickets ticket where ticket.id = ticket_id and ticket.requester_id = auth.uid()
    )))
  );

drop policy if exists "Support module RBAC" on public.support_ticket_messages;
create policy "Support module RBAC" on public.support_ticket_messages
  as restrictive for all to authenticated
  using (public.has_rbac_access('support')) with check (public.has_rbac_access('support'));

drop policy if exists "Participants read ticket attachments" on public.support_ticket_attachments;
create policy "Participants read ticket attachments" on public.support_ticket_attachments
  for select to authenticated using (exists (
    select 1 from public.support_tickets ticket
    where ticket.id = ticket_id and (ticket.requester_id = auth.uid() or public.is_support_agent())
  ));
drop policy if exists "Participants add ticket attachments" on public.support_ticket_attachments;
create policy "Participants add ticket attachments" on public.support_ticket_attachments
  for insert to authenticated with check (
    uploader_id = auth.uid() and exists (
      select 1 from public.support_tickets ticket
      where ticket.id = ticket_id and (ticket.requester_id = auth.uid() or public.is_support_agent())
    )
  );

drop policy if exists "Support module RBAC" on public.support_ticket_attachments;
create policy "Support module RBAC" on public.support_ticket_attachments
  as restrictive for all to authenticated
  using (public.has_rbac_access('support')) with check (public.has_rbac_access('support'));

revoke all on public.support_tickets, public.support_ticket_messages, public.support_ticket_attachments from anon, authenticated;
grant select, insert, update on public.support_tickets to authenticated;
grant select, insert on public.support_ticket_messages, public.support_ticket_attachments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-attachments', 'support-attachments', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Support attachment participants read" on storage.objects;
create policy "Support attachment participants read" on storage.objects
  for select to authenticated using (
    bucket_id = 'support-attachments'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_support_agent()
      or exists (
        select 1
        from public.support_ticket_attachments attachment
        join public.support_tickets ticket on ticket.id = attachment.ticket_id
        where attachment.storage_path = name and ticket.requester_id = auth.uid()
      )
    )
  );
drop policy if exists "Support attachment participants upload" on storage.objects;
create policy "Support attachment participants upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'support-attachments'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_support_agent())
  );

alter table public.support_tickets replica identity full;
alter table public.support_ticket_messages replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.support_tickets;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.support_ticket_messages;
exception when duplicate_object then null; end $$;