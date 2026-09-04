-- Isolated streak, XP, and skill-tree module. Core user and learning tables are unchanged.

create table if not exists public.learning_nodes (
  key text primary key check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  description text not null,
  track text not null check (track in ('universal_foundation', 'commercial_task_tracks', 'applied_ai_workflow')),
  position integer not null check (position > 0),
  xp_reward integer not null check (xp_reward between 1 and 500),
  prerequisite_keys text[] not null default '{}',
  active boolean not null default true,
  unique (track, position)
);

alter table public.learning_nodes drop constraint if exists learning_nodes_track_check;
alter table public.learning_nodes add constraint learning_nodes_track_check check (
  track in (
    'universal_foundation', 'commercial_task_tracks', 'applied_ai_workflow',
    'foundation', 'practice', 'application'
  )
);

create table if not exists public.gamification_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_xp integer not null default 0 check (total_xp >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_activity_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  node_key text not null references public.learning_nodes(key) on delete restrict,
  event_key text not null check (length(event_key) between 1 and 200),
  source_type text not null check (source_type in ('practice_session', 'mini_challenge', 'code_lesson')),
  xp_awarded integer not null check (xp_awarded > 0),
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

create table if not exists public.user_learning_nodes (
  user_id uuid not null references auth.users(id) on delete cascade,
  node_key text not null references public.learning_nodes(key) on delete cascade,
  completion_count integer not null default 1 check (completion_count > 0),
  first_completed_at timestamptz not null default now(),
  last_completed_at timestamptz not null default now(),
  primary key (user_id, node_key)
);

create index if not exists learning_xp_events_user_created_idx on public.learning_xp_events(user_id, created_at desc);
create index if not exists user_learning_nodes_user_idx on public.user_learning_nodes(user_id, last_completed_at desc);

update public.learning_nodes set active = false;

insert into public.learning_nodes (key, title, description, track, position, xp_reward, prerequisite_keys) values
  ('active-listening-deescalation', 'Active listening & de-escalation', 'Practice listening, calm responses, and constructive next steps.', 'universal_foundation', 1, 20, '{}'),
  ('professional-text-email', 'Professional text & email', 'Practice clear, respectful, and purposeful written communication.', 'universal_foundation', 2, 20, '{}'),
  ('voice-clarity', 'Voice clarity', 'Build confidence and clarity through guided voice practice.', 'universal_foundation', 3, 25, '{}'),
  ('lead-generation', 'Lead Generation', 'Practice researching and opening a relevant client conversation.', 'commercial_task_tracks', 1, 30, '{}'),
  ('appointment-fixing', 'Appointment Fixing', 'Practice greeting, availability, scheduling, and confirmation.', 'commercial_task_tracks', 2, 35, '{}'),
  ('follow-up-management', 'Follow-Up Management', 'Practice timely follow-up and agreed next actions.', 'commercial_task_tracks', 3, 30, '{}'),
  ('customer-service', 'Customer Service', 'Practice understanding a concern and guiding resolution.', 'commercial_task_tracks', 4, 35, '{}'),
  ('ai-response-drafting', 'AI-assisted response drafting', 'Draft, review, and improve a responsible AI-assisted response.', 'applied_ai_workflow', 1, 40, '{}'),
  ('text-task-automation', 'Text task automation', 'Practice automating a text workflow with human review.', 'applied_ai_workflow', 2, 45, '{}'),
  ('crm-entry-organization', 'CRM entry organization', 'Organize contacts, context, ownership, and next actions.', 'applied_ai_workflow', 3, 40, '{}'),
  ('technical-operational-execution', 'Technical & operational execution', 'Complete, verify, and document an operational step.', 'applied_ai_workflow', 4, 50, '{}')
on conflict (key) do update set title = excluded.title, description = excluded.description,
  track = excluded.track, position = excluded.position, xp_reward = excluded.xp_reward,
  prerequisite_keys = excluded.prerequisite_keys, active = true;

-- Import prior pathway completions into the isolated ledger without changing practice_sessions.
insert into public.learning_xp_events (user_id, node_key, event_key, source_type, xp_awarded, created_at)
select session.user_id, node.key, 'practice:' || session.id::text, 'practice_session', node.xp_reward, session.created_at
from public.practice_sessions session
join public.learning_nodes node on node.title = session.template and node.active
where session.user_id is not null
on conflict (user_id, event_key) do nothing;

insert into public.user_learning_nodes (user_id, node_key, completion_count, first_completed_at, last_completed_at)
select event.user_id, event.node_key, count(*)::integer, min(event.created_at), max(event.created_at)
from public.learning_xp_events event
join public.learning_nodes node on node.key = event.node_key and node.active
group by event.user_id, event.node_key
on conflict (user_id, node_key) do update set
  completion_count = excluded.completion_count,
  first_completed_at = excluded.first_completed_at,
  last_completed_at = excluded.last_completed_at;

with activity_days as (
  select distinct event.user_id, (event.created_at at time zone 'utc')::date as activity_date
  from public.learning_xp_events event
), numbered_days as (
  select user_id, activity_date,
    activity_date - (row_number() over (partition by user_id order by activity_date))::integer as streak_group
  from activity_days
), streaks as (
  select user_id, streak_group, count(*)::integer as streak_length, max(activity_date) as end_date
  from numbered_days
  group by user_id, streak_group
), streak_summary as (
  select user_id, max(streak_length) as longest_streak,
    (array_agg(streak_length order by end_date desc))[1] as latest_streak,
    max(end_date) as last_activity_date
  from streaks
  group by user_id
), xp_summary as (
  select user_id, sum(xp_awarded)::integer as total_xp
  from public.learning_xp_events
  group by user_id
)
insert into public.gamification_profiles (user_id, total_xp, current_streak, longest_streak, last_activity_date)
select xp.user_id, xp.total_xp,
  case when streak.last_activity_date >= (now() at time zone 'utc')::date - 1 then streak.latest_streak else 0 end,
  streak.longest_streak, streak.last_activity_date
from xp_summary xp
join streak_summary streak on streak.user_id = xp.user_id
on conflict (user_id) do update set
  total_xp = excluded.total_xp,
  current_streak = excluded.current_streak,
  longest_streak = greatest(public.gamification_profiles.longest_streak, excluded.longest_streak),
  last_activity_date = excluded.last_activity_date,
  updated_at = now();

create or replace function public.record_learning_completion(
  node_key_input text,
  event_key_input text,
  source_type_input text
)
returns table (xp_awarded integer, total_xp integer, current_streak integer, longest_streak integer, node_completed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  reward integer;
  prerequisites text[];
  activity_date date := (now() at time zone 'utc')::date;
  inserted_event uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.has_rbac_access('learning') then raise exception 'Learning access required'; end if;
  if source_type_input not in ('practice_session', 'mini_challenge', 'code_lesson') then raise exception 'Invalid completion source'; end if;
  select node.xp_reward, node.prerequisite_keys into reward, prerequisites
  from public.learning_nodes node where node.key = node_key_input and node.active;
  if reward is null then raise exception 'Learning node not found'; end if;
  if cardinality(prerequisites) > 0 and not exists (
      select 1 from public.user_learning_nodes completion
      where completion.user_id = actor_id and completion.node_key = node_key_input
    ) and exists (
      select 1 from unnest(prerequisites) prerequisite
      where not exists (
        select 1 from public.user_learning_nodes completion
        where completion.user_id = actor_id and completion.node_key = prerequisite
      )
    ) then raise exception 'Complete prerequisite milestones first'; end if;

  insert into public.learning_xp_events (user_id, node_key, event_key, source_type, xp_awarded)
  values (actor_id, node_key_input, event_key_input, source_type_input, reward)
  on conflict (user_id, event_key) do nothing
  returning id into inserted_event;

  if inserted_event is null then
    return query select 0, profile.total_xp, profile.current_streak, profile.longest_streak,
      exists (select 1 from public.user_learning_nodes completion where completion.user_id = actor_id and completion.node_key = node_key_input)
    from public.gamification_profiles profile where profile.user_id = actor_id;
    return;
  end if;

  insert into public.gamification_profiles (user_id, total_xp, current_streak, longest_streak, last_activity_date)
  values (actor_id, reward, 1, 1, activity_date)
  on conflict (user_id) do update set
    total_xp = public.gamification_profiles.total_xp + reward,
    current_streak = case
      when public.gamification_profiles.last_activity_date = activity_date then public.gamification_profiles.current_streak
      when public.gamification_profiles.last_activity_date = activity_date - 1 then public.gamification_profiles.current_streak + 1
      else 1
    end,
    longest_streak = greatest(public.gamification_profiles.longest_streak, case
      when public.gamification_profiles.last_activity_date = activity_date then public.gamification_profiles.current_streak
      when public.gamification_profiles.last_activity_date = activity_date - 1 then public.gamification_profiles.current_streak + 1
      else 1
    end),
    last_activity_date = activity_date,
    updated_at = now();

  insert into public.user_learning_nodes (user_id, node_key)
  values (actor_id, node_key_input)
  on conflict (user_id, node_key) do update set
    completion_count = public.user_learning_nodes.completion_count + 1,
    last_completed_at = now();

  return query select reward, profile.total_xp, profile.current_streak, profile.longest_streak, true
    from public.gamification_profiles profile where profile.user_id = actor_id;
end;
$$;

revoke all on function public.record_learning_completion(text, text, text) from public;
grant execute on function public.record_learning_completion(text, text, text) to authenticated;

alter table public.learning_nodes enable row level security;
alter table public.gamification_profiles enable row level security;
alter table public.learning_xp_events enable row level security;
alter table public.user_learning_nodes enable row level security;

drop policy if exists "Authenticated users read active learning nodes" on public.learning_nodes;
create policy "Authenticated users read active learning nodes" on public.learning_nodes for select to authenticated using (active);
drop policy if exists "Users read own gamification profile" on public.gamification_profiles;
create policy "Users read own gamification profile" on public.gamification_profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users read own XP events" on public.learning_xp_events;
create policy "Users read own XP events" on public.learning_xp_events for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users read own node progress" on public.user_learning_nodes;
create policy "Users read own node progress" on public.user_learning_nodes for select to authenticated using (user_id = auth.uid());

drop policy if exists "Learning module RBAC" on public.learning_nodes;
create policy "Learning module RBAC" on public.learning_nodes as restrictive for select to authenticated using (public.has_rbac_access('learning'));
drop policy if exists "Learning module RBAC" on public.gamification_profiles;
create policy "Learning module RBAC" on public.gamification_profiles as restrictive for select to authenticated using (public.has_rbac_access('learning'));
drop policy if exists "Learning module RBAC" on public.learning_xp_events;
create policy "Learning module RBAC" on public.learning_xp_events as restrictive for select to authenticated using (public.has_rbac_access('learning'));
drop policy if exists "Learning module RBAC" on public.user_learning_nodes;
create policy "Learning module RBAC" on public.user_learning_nodes as restrictive for select to authenticated using (public.has_rbac_access('learning'));

revoke all on public.learning_nodes, public.gamification_profiles, public.learning_xp_events, public.user_learning_nodes from anon, authenticated;
grant select on public.learning_nodes, public.gamification_profiles, public.learning_xp_events, public.user_learning_nodes to authenticated;