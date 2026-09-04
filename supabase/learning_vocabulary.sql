-- Dynamic programming vocabulary extension for the isolated learning module.

create table if not exists public.learning_vocabulary_terms (
  id uuid primary key default gen_random_uuid(),
  language_key text not null check (language_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  term_key text not null check (term_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  term text not null check (length(trim(term)) between 1 and 100),
  definition text not null check (length(trim(definition)) > 0),
  code_snippet text not null default '',
  translations jsonb not null default '{}'::jsonb check (jsonb_typeof(translations) = 'object'),
  difficulty integer not null default 1 check (difficulty between 1 and 5),
  xp_reward integer not null default 5 check (xp_reward between 1 and 50),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (language_key, term_key)
);

create table if not exists public.learning_vocabulary_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  term_id uuid not null references public.learning_vocabulary_terms(id) on delete cascade,
  selected_term_id uuid not null references public.learning_vocabulary_terms(id) on delete cascade,
  attempt_key text not null check (length(attempt_key) between 1 and 150),
  correct boolean not null,
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, attempt_key)
);

create table if not exists public.user_vocabulary_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  term_id uuid not null references public.learning_vocabulary_terms(id) on delete cascade,
  practice_count integer not null default 0 check (practice_count >= 0),
  correct_count integer not null default 0 check (correct_count >= 0 and correct_count <= practice_count),
  mastered boolean not null default false,
  last_practiced_at timestamptz,
  primary key (user_id, term_id)
);

create index if not exists learning_vocabulary_language_idx on public.learning_vocabulary_terms(language_key, active, difficulty);
create index if not exists learning_vocabulary_attempts_user_idx on public.learning_vocabulary_attempts(user_id, created_at desc);

insert into public.learning_vocabulary_terms
  (language_key, term_key, term, definition, code_snippet, translations, difficulty, xp_reward)
values
  ('python', 'function', 'Function', 'A reusable block of code that performs a specific task.', 'def greet(name):\n    return f"Hello {name}"', '{"es":"función","fr":"fonction"}', 1, 5),
  ('python', 'list', 'List', 'An ordered, changeable collection of values.', 'skills = ["Python", "SQL"]', '{"es":"lista","fr":"liste"}', 1, 5),
  ('python', 'dictionary', 'Dictionary', 'A collection that stores values under unique keys.', 'profile = {"name": "Kris", "xp": 120}', '{"es":"diccionario","fr":"dictionnaire"}', 2, 7),
  ('python', 'loop', 'Loop', 'A control structure that repeats an operation.', 'for skill in skills:\n    print(skill)', '{"es":"bucle","fr":"boucle"}', 1, 5),
  ('python', 'exception', 'Exception', 'An object representing an error detected while code runs.', 'try:\n    load_data()\nexcept ValueError:\n    recover()', '{"es":"excepción","fr":"exception"}', 3, 9),
  ('javascript', 'function', 'Function', 'A reusable callable block that can receive arguments and return a value.', 'const greet = (name) => `Hello ${name}`;', '{"es":"función","fr":"fonction"}', 1, 5),
  ('javascript', 'array', 'Array', 'An ordered collection whose items are accessed by index.', 'const skills = ["JavaScript", "React"];', '{"es":"arreglo","fr":"tableau"}', 1, 5),
  ('javascript', 'object', 'Object', 'A collection of properties represented by key-value pairs.', 'const profile = { name: "Kris", xp: 120 };', '{"es":"objeto","fr":"objet"}', 2, 7),
  ('javascript', 'promise', 'Promise', 'A value representing the eventual result of an asynchronous operation.', 'const result = await fetchData();', '{"es":"promesa","fr":"promesse"}', 3, 9),
  ('javascript', 'event', 'Event', 'A signal that an interaction or browser action has occurred.', 'button.addEventListener("click", handleClick);', '{"es":"evento","fr":"événement"}', 2, 7),
  ('sql', 'select', 'SELECT', 'A statement that reads chosen columns and rows from a table.', 'select title, status from support_tickets;', '{"es":"seleccionar","fr":"sélectionner"}', 1, 5),
  ('sql', 'where', 'WHERE', 'A clause that filters rows using a condition.', 'select * from learning_nodes where active = true;', '{"es":"donde","fr":"où"}', 1, 5),
  ('sql', 'join', 'JOIN', 'A clause that combines related rows from two data sources.', 'select * from tickets join messages on messages.ticket_id = tickets.id;', '{"es":"unión","fr":"jointure"}', 2, 7),
  ('sql', 'transaction', 'Transaction', 'A group of database operations that succeed or fail as one unit.', 'begin;\nupdate accounts set active = true;\ncommit;', '{"es":"transacción","fr":"transaction"}', 3, 9),
  ('sql', 'index', 'Index', 'A database structure that speeds up selected lookups.', 'create index tickets_status_idx on support_tickets(status);', '{"es":"índice","fr":"index"}', 3, 9)
on conflict (language_key, term_key) do update set
  term = excluded.term, definition = excluded.definition, code_snippet = excluded.code_snippet,
  translations = excluded.translations, difficulty = excluded.difficulty,
  xp_reward = excluded.xp_reward, active = true, updated_at = now();

alter table public.learning_xp_events drop constraint if exists learning_xp_events_source_type_check;
alter table public.learning_xp_events add constraint learning_xp_events_source_type_check check (
  source_type in ('practice_session', 'mini_challenge', 'code_lesson', 'vocabulary_practice')
);

insert into public.learning_nodes (key, title, description, track, position, xp_reward, active)
values ('vocabulary-practice', 'Programming vocabulary', 'Practice language-specific terms and syntax.', 'universal_foundation', 100, 5, false)
on conflict (key) do update set active = false;

create or replace function public.record_vocabulary_attempt(
  language_key_input text,
  term_id_input uuid,
  selected_term_id_input uuid,
  attempt_key_input text
)
returns table (correct boolean, xp_awarded integer, total_xp integer, current_streak integer, longest_streak integer, mastered boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target public.learning_vocabulary_terms%rowtype;
  is_correct boolean;
  inserted_attempt uuid;
  activity_date date := (now() at time zone 'utc')::date;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.has_rbac_access('learning') then raise exception 'Learning access required'; end if;

  select * into target from public.learning_vocabulary_terms term
  where term.id = term_id_input and term.language_key = language_key_input and term.active;
  if target.id is null then raise exception 'Vocabulary term not found'; end if;
  if not exists (
    select 1 from public.learning_vocabulary_terms selected
    where selected.id = selected_term_id_input and selected.language_key = language_key_input and selected.active
  ) then raise exception 'Selected term is invalid'; end if;
  is_correct := term_id_input = selected_term_id_input;

  insert into public.learning_vocabulary_attempts
    (user_id, term_id, selected_term_id, attempt_key, correct, xp_awarded)
  values (actor_id, term_id_input, selected_term_id_input, attempt_key_input, is_correct, case when is_correct then target.xp_reward else 0 end)
  on conflict (user_id, attempt_key) do nothing
  returning id into inserted_attempt;

  if inserted_attempt is null then
    return query select attempt.correct, 0, coalesce(profile.total_xp, 0),
      coalesce(profile.current_streak, 0), coalesce(profile.longest_streak, 0),
      coalesce(progress.mastered, false)
    from public.learning_vocabulary_attempts attempt
    left join public.gamification_profiles profile on profile.user_id = actor_id
    left join public.user_vocabulary_progress progress on progress.user_id = actor_id and progress.term_id = attempt.term_id
    where attempt.user_id = actor_id and attempt.attempt_key = attempt_key_input;
    return;
  end if;

  insert into public.user_vocabulary_progress
    (user_id, term_id, practice_count, correct_count, mastered, last_practiced_at)
  values (actor_id, term_id_input, 1, case when is_correct then 1 else 0 end, false, now())
  on conflict (user_id, term_id) do update set
    practice_count = public.user_vocabulary_progress.practice_count + 1,
    correct_count = public.user_vocabulary_progress.correct_count + case when is_correct then 1 else 0 end,
    mastered = public.user_vocabulary_progress.correct_count + case when is_correct then 1 else 0 end >= 3,
    last_practiced_at = now();

  if is_correct then
    insert into public.learning_xp_events (user_id, node_key, event_key, source_type, xp_awarded)
    values (actor_id, 'vocabulary-practice', 'vocabulary:' || attempt_key_input, 'vocabulary_practice', target.xp_reward);

    insert into public.gamification_profiles (user_id, total_xp, current_streak, longest_streak, last_activity_date)
    values (actor_id, target.xp_reward, 1, 1, activity_date)
    on conflict (user_id) do update set
      total_xp = public.gamification_profiles.total_xp + target.xp_reward,
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

  return query select is_correct, case when is_correct then target.xp_reward else 0 end,
    coalesce(profile.total_xp, 0), coalesce(profile.current_streak, 0), coalesce(profile.longest_streak, 0),
    progress.mastered
  from public.user_vocabulary_progress progress
  left join public.gamification_profiles profile on profile.user_id = actor_id
  where progress.user_id = actor_id and progress.term_id = term_id_input;
end;
$$;

revoke all on function public.record_vocabulary_attempt(text, uuid, uuid, text) from public;
grant execute on function public.record_vocabulary_attempt(text, uuid, uuid, text) to authenticated;

alter table public.learning_vocabulary_terms enable row level security;
alter table public.learning_vocabulary_attempts enable row level security;
alter table public.user_vocabulary_progress enable row level security;

drop policy if exists "Learning users read vocabulary" on public.learning_vocabulary_terms;
create policy "Learning users read vocabulary" on public.learning_vocabulary_terms for select to authenticated
  using (active and public.has_rbac_access('learning'));
drop policy if exists "Users read own vocabulary attempts" on public.learning_vocabulary_attempts;
create policy "Users read own vocabulary attempts" on public.learning_vocabulary_attempts for select to authenticated
  using (user_id = auth.uid() and public.has_rbac_access('learning'));
drop policy if exists "Users read own vocabulary progress" on public.user_vocabulary_progress;
create policy "Users read own vocabulary progress" on public.user_vocabulary_progress for select to authenticated
  using (user_id = auth.uid() and public.has_rbac_access('learning'));

revoke all on public.learning_vocabulary_terms, public.learning_vocabulary_attempts, public.user_vocabulary_progress from anon, authenticated;
grant select on public.learning_vocabulary_terms, public.learning_vocabulary_attempts, public.user_vocabulary_progress to authenticated;