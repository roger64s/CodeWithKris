-- Isolated concept-reframing and syntax-cueing extension for the learning module.

create table if not exists public.learning_reframing_cues (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('universal_foundation', 'commercial_task_tracks', 'applied_ai_workflow')),
  language_key text not null check (language_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  cue_key text not null check (cue_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  anti_pattern text not null,
  reframe text not null,
  new_syntax text not null,
  visual_cue text not null,
  translation_patterns jsonb not null default '{}'::jsonb check (jsonb_typeof(translation_patterns) = 'object'),
  xp_reward integer not null default 10 check (xp_reward between 1 and 50),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (language_key, cue_key)
);

create table if not exists public.learning_reframing_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cue_id uuid not null references public.learning_reframing_cues(id) on delete cascade,
  attempt_key text not null check (length(attempt_key) between 1 and 150),
  selected_new_syntax boolean not null,
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, attempt_key)
);

create table if not exists public.user_reframing_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  cue_id uuid not null references public.learning_reframing_cues(id) on delete cascade,
  practice_count integer not null default 0 check (practice_count >= 0),
  success_count integer not null default 0 check (success_count >= 0 and success_count <= practice_count),
  mastered boolean not null default false,
  last_practiced_at timestamptz,
  primary key (user_id, cue_id)
);

create index if not exists learning_reframing_track_idx on public.learning_reframing_cues(track, language_key, active);
create index if not exists learning_reframing_attempts_user_idx on public.learning_reframing_attempts(user_id, created_at desc);

insert into public.learning_reframing_cues
  (track, language_key, cue_key, anti_pattern, reframe, new_syntax, visual_cue, translation_patterns, xp_reward)
values
  ('universal_foundation', 'python', 'nested-conditional', 'If every decision is nested, the path becomes hard to follow.', 'Give each decision a clear doorway and return early when the answer is known.', 'if not user:\n    return\nif not user.is_active:\n    return\nwelcome(user)', 'One doorway at a time', '{"plain":"Guard clauses","es":"Cláusulas de guarda"}', 10),
  ('universal_foundation', 'javascript', 'unclear-names', 'A vague variable name makes the idea harder to hold in mind.', 'Name the role or outcome so the code says what it means.', 'const nextAppointmentDate = requestedDate;', 'Label the box before filling it', '{"plain":"Meaningful names","es":"Nombres descriptivos"}', 10),
  ('commercial_task_tracks', 'python', 'string-concatenation', 'Long string assembly can hide the message structure.', 'Use a readable template so the communication pattern stays visible.', 'message = f"Hello {customer_name}, your call is {appointment_time}."', 'Put the words on a clear card', '{"plain":"Formatted string","es":"Cadena formateada"}', 12),
  ('commercial_task_tracks', 'javascript', 'callback-pyramid', 'Deeply nested callbacks make the next action difficult to see.', 'Let each async step have a named, readable handoff.', 'const response = await fetchContact();\nconst appointment = await bookCall(response);', 'A straight path instead of a maze', '{"plain":"Async/await","es":"Async/await"}', 12),
  ('applied_ai_workflow', 'sql', 'unfiltered-update', 'Changing rows without a filter can affect more data than intended.', 'Make the boundary explicit before changing shared data.', 'update tickets\nset status = ''resolved''\nwhere id = :ticket_id;', 'Draw the boundary first', '{"plain":"Scoped update","es":"Actualización acotada"}', 15),
  ('applied_ai_workflow', 'javascript', 'implicit-automation', 'An automation without a review point can hide an unsafe action.', 'Make the proposed result visible before the human approves it.', 'const draft = await buildReply(input);\nreturn reviewBeforeSend(draft);', 'Pause at the review gate', '{"plain":"Human-in-the-loop","es":"Humano en el circuito"}', 15)
on conflict (language_key, cue_key) do update set
  track = excluded.track, anti_pattern = excluded.anti_pattern, reframe = excluded.reframe,
  new_syntax = excluded.new_syntax, visual_cue = excluded.visual_cue,
  translation_patterns = excluded.translation_patterns, xp_reward = excluded.xp_reward,
  active = true, updated_at = now();

alter table public.learning_xp_events drop constraint if exists learning_xp_events_source_type_check;
alter table public.learning_xp_events add constraint learning_xp_events_source_type_check check (
  source_type in ('practice_session', 'mini_challenge', 'code_lesson', 'vocabulary_practice', 'reframing_mastery')
);

insert into public.learning_nodes (key, title, description, track, position, xp_reward, active)
values ('reframing-mastery', 'New syntax patterns', 'Master alternative coding patterns through concept cues.', 'universal_foundation', 101, 10, false)
on conflict (key) do update set active = false;

create or replace function public.record_reframing_attempt(
  language_key_input text,
  cue_id_input uuid,
  selected_new_syntax_input boolean,
  attempt_key_input text
)
returns table (successful boolean, xp_awarded integer, total_xp integer, current_streak integer, longest_streak integer, mastered boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  cue public.learning_reframing_cues%rowtype;
  inserted_attempt uuid;
  activity_date date := (now() at time zone 'utc')::date;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.has_rbac_access('learning') then raise exception 'Learning access required'; end if;
  select * into cue from public.learning_reframing_cues item
  where item.id = cue_id_input and item.language_key = language_key_input and item.active;
  if cue.id is null then raise exception 'Reframing cue not found'; end if;

  insert into public.learning_reframing_attempts
    (user_id, cue_id, attempt_key, selected_new_syntax, xp_awarded)
  values (actor_id, cue_id_input, attempt_key_input, selected_new_syntax_input,
    case when selected_new_syntax_input then cue.xp_reward else 0 end)
  on conflict (user_id, attempt_key) do nothing
  returning id into inserted_attempt;

  if inserted_attempt is null then
    return query select attempt.selected_new_syntax, 0, coalesce(profile.total_xp, 0),
      coalesce(profile.current_streak, 0), coalesce(profile.longest_streak, 0), coalesce(progress.mastered, false)
    from public.learning_reframing_attempts attempt
    left join public.gamification_profiles profile on profile.user_id = actor_id
    left join public.user_reframing_progress progress on progress.user_id = actor_id and progress.cue_id = attempt.cue_id
    where attempt.user_id = actor_id and attempt.attempt_key = attempt_key_input;
    return;
  end if;

  insert into public.user_reframing_progress
    (user_id, cue_id, practice_count, success_count, mastered, last_practiced_at)
  values (actor_id, cue_id_input, 1, case when selected_new_syntax_input then 1 else 0 end, false, now())
  on conflict (user_id, cue_id) do update set
    practice_count = public.user_reframing_progress.practice_count + 1,
    success_count = public.user_reframing_progress.success_count + case when selected_new_syntax_input then 1 else 0 end,
    mastered = public.user_reframing_progress.success_count + case when selected_new_syntax_input then 1 else 0 end >= 2,
    last_practiced_at = now();

  if selected_new_syntax_input then
    insert into public.learning_xp_events (user_id, node_key, event_key, source_type, xp_awarded)
    values (actor_id, 'reframing-mastery', 'reframing:' || attempt_key_input, 'reframing_mastery', cue.xp_reward);
    insert into public.gamification_profiles (user_id, total_xp, current_streak, longest_streak, last_activity_date)
    values (actor_id, cue.xp_reward, 1, 1, activity_date)
    on conflict (user_id) do update set
      total_xp = public.gamification_profiles.total_xp + cue.xp_reward,
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
  end if;

  return query select selected_new_syntax_input, case when selected_new_syntax_input then cue.xp_reward else 0 end,
    coalesce(profile.total_xp, 0), coalesce(profile.current_streak, 0), coalesce(profile.longest_streak, 0), progress.mastered
  from public.user_reframing_progress progress
  left join public.gamification_profiles profile on profile.user_id = actor_id
  where progress.user_id = actor_id and progress.cue_id = cue_id_input;
end;
$$;

revoke all on function public.record_reframing_attempt(text, uuid, boolean, text) from public;
grant execute on function public.record_reframing_attempt(text, uuid, boolean, text) to authenticated;

alter table public.learning_reframing_cues enable row level security;
alter table public.learning_reframing_attempts enable row level security;
alter table public.user_reframing_progress enable row level security;

drop policy if exists "Learning users read reframing cues" on public.learning_reframing_cues;
create policy "Learning users read reframing cues" on public.learning_reframing_cues for select to authenticated
  using (active and public.has_rbac_access('learning'));
drop policy if exists "Users read own reframing attempts" on public.learning_reframing_attempts;
create policy "Users read own reframing attempts" on public.learning_reframing_attempts for select to authenticated
  using (user_id = auth.uid() and public.has_rbac_access('learning'));
drop policy if exists "Users read own reframing progress" on public.user_reframing_progress;
create policy "Users read own reframing progress" on public.user_reframing_progress for select to authenticated
  using (user_id = auth.uid() and public.has_rbac_access('learning'));

revoke all on public.learning_reframing_cues, public.learning_reframing_attempts, public.user_reframing_progress from anon, authenticated;
grant select on public.learning_reframing_cues, public.learning_reframing_attempts, public.user_reframing_progress to authenticated;