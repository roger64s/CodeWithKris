-- Apply after supabase/sprint_task_board.sql.
-- Commercial, inclusive matching, delivery, impact, and PDCA controls for Client Projects.

create table if not exists public.project_operating_plans (
  workspace_id uuid primary key references public.requirement_workspaces(id) on delete cascade,
  stage text not null default 'discovery' check (stage in (
    'discovery', 'scope_and_funding', 'assessment_and_matching', 'delivery',
    'quality_and_acceptance', 'billing_and_distribution', 'improvement', 'closed'
  )),
  scope_summary text not null default '',
  marketing_brief text not null default '',
  currency text not null default 'HKD' check (length(currency) = 3),
  budget_amount numeric not null default 0 check (budget_amount >= 0),
  prefunded_amount numeric not null default 0 check (prefunded_amount >= 0 and prefunded_amount <= budget_amount),
  contributor_reserve_percent numeric not null default 60 check (contributor_reserve_percent between 0 and 100),
  overhead_percent numeric not null default 20 check (overhead_percent between 0 and 100),
  department_percent numeric not null default 20 check (department_percent between 0 and 100),
  planned_start date,
  planned_end date,
  ai_scope_recommendation jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (contributor_reserve_percent + overhead_percent + department_percent = 100),
  check (planned_end is null or planned_start is null or planned_end >= planned_start),
  check ((approved_by is null) = (approved_at is null))
);

create table if not exists public.project_operating_milestones (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  acceptance_criteria text not null default '',
  due_date date,
  budget_amount numeric not null default 0 check (budget_amount >= 0),
  funded_amount numeric not null default 0 check (funded_amount >= 0 and funded_amount <= budget_amount),
  status text not null default 'planned' check (status in ('planned', 'funded', 'in_delivery', 'quality_review', 'client_review', 'accepted', 'invoiced', 'paid')),
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table if not exists public.project_candidate_assessments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  skills jsonb not null default '{}'::jsonb,
  work_preferences jsonb not null default '{}'::jsonb,
  accessibility_adjustments jsonb not null default '{}'::jsonb,
  consented_at timestamptz,
  ai_recommendation jsonb not null default '{}'::jsonb,
  ai_model_reference text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  decision text not null default 'pending' check (decision in ('pending', 'shortlisted', 'matched', 'not_selected', 'withdrawn')),
  decision_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, candidate_id),
  check (decision = 'pending' or decision = 'withdrawn' or (reviewed_by is not null and reviewed_at is not null)),
  check (decision <> 'matched' or consented_at is not null)
);

create table if not exists public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  assessment_id uuid not null references public.project_candidate_assessments(id) on delete restrict,
  milestone_id uuid references public.project_operating_milestones(id) on delete restrict,
  sprint_task_id uuid references public.sprint_tasks(id) on delete restrict,
  assignment_role text not null check (assignment_role in ('contributor', 'mentor', 'reviewer', 'project_manager')),
  agreed_hours numeric not null check (agreed_hours > 0),
  agreed_budget numeric not null default 0 check (agreed_budget >= 0),
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'active', 'completed', 'cancelled')),
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.project_delivery_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  milestone_id uuid references public.project_operating_milestones(id) on delete cascade,
  sprint_task_id uuid references public.sprint_tasks(id) on delete cascade,
  review_type text not null check (review_type in ('mentor', 'quality_gate', 'integration', 'client_acceptance')),
  outcome text not null check (outcome in ('pending', 'approved', 'rework_required', 'rejected')),
  quality_score numeric check (quality_score between 0 and 100),
  timeliness_score numeric check (timeliness_score between 0 and 100),
  rework_hours numeric not null default 0 check (rework_hours >= 0),
  notes text not null default '',
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  check (milestone_id is not null or sprint_task_id is not null)
);

create table if not exists public.project_distributions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  milestone_id uuid not null references public.project_operating_milestones(id) on delete restrict,
  received_amount numeric not null check (received_amount > 0),
  contributor_amount numeric not null check (contributor_amount >= 0),
  department_amount numeric not null check (department_amount >= 0),
  overhead_amount numeric not null check (overhead_amount >= 0),
  status text not null default 'draft' check (status in ('draft', 'approved', 'distributed')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (milestone_id),
  check (contributor_amount + department_amount + overhead_amount = received_amount),
  check (status = 'draft' or (approved_by is not null and approved_at is not null))
);

create table if not exists public.project_impact_measures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  measured_on date not null default current_date,
  pwd_participants integer not null default 0 check (pwd_participants >= 0),
  women_carer_participants integer not null default 0 check (women_carer_participants >= 0),
  student_participants integer not null default 0 check (student_participants >= 0),
  mentor_hours numeric not null default 0 check (mentor_hours >= 0),
  paid_contributor_hours numeric not null default 0 check (paid_contributor_hours >= 0),
  accepted_outputs integer not null default 0 check (accepted_outputs >= 0),
  notes text not null default '',
  recorded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.project_pdca_cycles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.requirement_workspaces(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  plan text not null,
  do_result text not null default '',
  check_result text not null default '',
  act_decision text not null default '',
  status text not null default 'plan' check (status in ('plan', 'do', 'check', 'act', 'closed')),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_operating_milestones_workspace_idx on public.project_operating_milestones(workspace_id, sort_order);
create index if not exists project_candidate_assessments_workspace_idx on public.project_candidate_assessments(workspace_id, decision);
create index if not exists project_assignments_workspace_idx on public.project_assignments(workspace_id, status);
create index if not exists project_delivery_reviews_workspace_idx on public.project_delivery_reviews(workspace_id, review_type);
create index if not exists project_impact_measures_workspace_idx on public.project_impact_measures(workspace_id, measured_on desc);
create index if not exists project_pdca_cycles_workspace_idx on public.project_pdca_cycles(workspace_id, status);

create or replace function public.protect_project_assessment_decision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() = old.candidate_id
    and not public.has_requirement_workspace_access(old.workspace_id, array['owner', 'editor'])
    and (
      new.workspace_id is distinct from old.workspace_id or new.candidate_id is distinct from old.candidate_id
      or new.ai_recommendation is distinct from old.ai_recommendation or new.ai_model_reference is distinct from old.ai_model_reference
      or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at
      or new.decision is distinct from old.decision or new.decision_reason is distinct from old.decision_reason
    ) then
    raise exception 'Candidates cannot alter AI recommendations or human review decisions';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_project_assessment_decision on public.project_candidate_assessments;
create trigger protect_project_assessment_decision before update on public.project_candidate_assessments
for each row execute function public.protect_project_assessment_decision();

create or replace function public.validate_project_milestone_funding()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  plan public.project_operating_plans%rowtype;
  other_budget numeric;
  other_funded numeric;
begin
  select * into plan from public.project_operating_plans where workspace_id = new.workspace_id;
  if not found then raise exception 'Create an operating plan before adding milestones'; end if;
  select coalesce(sum(milestone.budget_amount), 0), coalesce(sum(milestone.funded_amount), 0)
    into other_budget, other_funded
  from public.project_operating_milestones milestone
  where milestone.workspace_id = new.workspace_id and milestone.id <> new.id;
  if other_budget + new.budget_amount > plan.budget_amount then raise exception 'Milestone budgets exceed the project budget'; end if;
  if other_funded + new.funded_amount > plan.prefunded_amount then raise exception 'Milestone funding exceeds available prefunding'; end if;
  return new;
end;
$$;

drop trigger if exists validate_project_milestone_funding on public.project_operating_milestones;
create trigger validate_project_milestone_funding before insert or update on public.project_operating_milestones
for each row execute function public.validate_project_milestone_funding();

create or replace function public.validate_project_stage_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  stage_order text[] := array['discovery', 'scope_and_funding', 'assessment_and_matching', 'delivery', 'quality_and_acceptance', 'billing_and_distribution', 'improvement', 'closed'];
begin
  if new.stage = old.stage then return new; end if;
  if array_position(stage_order, new.stage) <> array_position(stage_order, old.stage) + 1 then
    raise exception 'Project stages must advance one gate at a time';
  end if;
  if new.stage = 'assessment_and_matching' and (new.approved_at is null or new.prefunded_amount <= 0) then
    raise exception 'Approve the scope and record prefunding before assessment and matching';
  elsif new.stage = 'delivery' and not exists (
    select 1 from public.project_candidate_assessments assessment where assessment.workspace_id = new.workspace_id and assessment.decision = 'matched'
  ) then
    raise exception 'A consented, human-approved match is required before delivery';
  elsif new.stage = 'quality_and_acceptance' and not exists (
    select 1 from public.project_assignments assignment where assignment.workspace_id = new.workspace_id and assignment.status in ('active', 'completed')
  ) then
    raise exception 'An active or completed assignment is required before quality review';
  elsif new.stage = 'billing_and_distribution' and not exists (
    select 1 from public.project_operating_milestones milestone
    where milestone.workspace_id = new.workspace_id and milestone.status in ('accepted', 'invoiced', 'paid')
  ) then
    raise exception 'Client milestone acceptance is required before billing';
  elsif new.stage = 'improvement' and not exists (
    select 1 from public.project_distributions distribution
    where distribution.workspace_id = new.workspace_id and distribution.status in ('approved', 'distributed')
  ) then
    raise exception 'Approve a protected contributor distribution before improvement review';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_project_stage_transition on public.project_operating_plans;
create trigger validate_project_stage_transition before update of stage on public.project_operating_plans
for each row execute function public.validate_project_stage_transition();

create or replace function public.validate_project_operations_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'project_assignments' then
    if not exists (select 1 from public.project_candidate_assessments assessment where assessment.id = new.assessment_id and assessment.workspace_id = new.workspace_id and assessment.decision = 'matched') then
      raise exception 'Assignments require a consented, human-approved match in the same project';
    end if;
  end if;
  if new.milestone_id is not null and not exists (select 1 from public.project_operating_milestones milestone where milestone.id = new.milestone_id and milestone.workspace_id = new.workspace_id) then
    raise exception 'Milestone must belong to the same project';
  end if;
  if new.sprint_task_id is not null and not exists (select 1 from public.sprint_tasks task where task.id = new.sprint_task_id and task.workspace_id = new.workspace_id) then
    raise exception 'Sprint task must belong to the same project';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_project_assignment_links on public.project_assignments;
create trigger validate_project_assignment_links before insert or update on public.project_assignments
for each row execute function public.validate_project_operations_links();
drop trigger if exists validate_project_delivery_review_links on public.project_delivery_reviews;
create trigger validate_project_delivery_review_links before insert or update on public.project_delivery_reviews
for each row execute function public.validate_project_operations_links();

create or replace function public.validate_project_distribution()
returns trigger language plpgsql security definer set search_path = '' as $$
declare plan public.project_operating_plans%rowtype;
begin
  select * into plan from public.project_operating_plans where workspace_id = new.workspace_id;
  if not found then raise exception 'Approve an operating plan before allocating funds'; end if;
  if new.contributor_amount < round(new.received_amount * plan.contributor_reserve_percent / 100, 2) then
    raise exception 'Contributor distribution is below the protected reserve';
  end if;
  if not exists (select 1 from public.project_operating_milestones milestone where milestone.id = new.milestone_id and milestone.workspace_id = new.workspace_id and milestone.status in ('accepted', 'invoiced', 'paid') and new.received_amount <= milestone.funded_amount) then
    raise exception 'Only accepted milestones can be distributed';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_project_distribution on public.project_distributions;
create trigger validate_project_distribution before insert or update on public.project_distributions
for each row execute function public.validate_project_distribution();

alter table public.project_operating_plans enable row level security;
alter table public.project_operating_milestones enable row level security;
alter table public.project_candidate_assessments enable row level security;
alter table public.project_assignments enable row level security;
alter table public.project_delivery_reviews enable row level security;
alter table public.project_distributions enable row level security;
alter table public.project_impact_measures enable row level security;
alter table public.project_pdca_cycles enable row level security;

drop policy if exists "Members read project operations" on public.project_operating_plans;
drop policy if exists "Editors manage project operations" on public.project_operating_plans;
drop policy if exists "Members read project milestones" on public.project_operating_milestones;
drop policy if exists "Editors manage project milestones" on public.project_operating_milestones;
drop policy if exists "Candidates and editors read assessments" on public.project_candidate_assessments;
drop policy if exists "Candidates submit assessments" on public.project_candidate_assessments;
drop policy if exists "Candidates and editors update assessments" on public.project_candidate_assessments;
drop policy if exists "Members read project assignments" on public.project_assignments;
drop policy if exists "Editors manage project assignments" on public.project_assignments;
drop policy if exists "Members read project reviews" on public.project_delivery_reviews;
drop policy if exists "Editors manage project reviews" on public.project_delivery_reviews;
drop policy if exists "Owners read project distributions" on public.project_distributions;
drop policy if exists "Owners manage project distributions" on public.project_distributions;
drop policy if exists "Members read project impact" on public.project_impact_measures;
drop policy if exists "Editors manage project impact" on public.project_impact_measures;
drop policy if exists "Members read project improvement" on public.project_pdca_cycles;
drop policy if exists "Editors manage project improvement" on public.project_pdca_cycles;

create policy "Members read project operations" on public.project_operating_plans for select to authenticated using (public.has_requirement_workspace_access(workspace_id));
create policy "Editors manage project operations" on public.project_operating_plans for all to authenticated using (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor'])) with check (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));
create policy "Members read project milestones" on public.project_operating_milestones for select to authenticated using (public.has_requirement_workspace_access(workspace_id));
create policy "Editors manage project milestones" on public.project_operating_milestones for all to authenticated using (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor'])) with check (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));
create policy "Candidates and editors read assessments" on public.project_candidate_assessments for select to authenticated using (candidate_id = auth.uid() or public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));
create policy "Candidates submit assessments" on public.project_candidate_assessments for insert to authenticated with check (
  candidate_id = auth.uid() and public.has_requirement_workspace_access(workspace_id)
  and decision = 'pending' and reviewed_by is null and reviewed_at is null
  and ai_recommendation = '{}'::jsonb and ai_model_reference is null
);
create policy "Candidates and editors update assessments" on public.project_candidate_assessments for update to authenticated using (candidate_id = auth.uid() or public.has_requirement_workspace_access(workspace_id, array['owner', 'editor'])) with check (candidate_id = auth.uid() or public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));

create policy "Members read project assignments" on public.project_assignments for select to authenticated using (public.has_requirement_workspace_access(workspace_id));
create policy "Editors manage project assignments" on public.project_assignments for all to authenticated using (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor'])) with check (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));
create policy "Members read project reviews" on public.project_delivery_reviews for select to authenticated using (public.has_requirement_workspace_access(workspace_id));
create policy "Editors manage project reviews" on public.project_delivery_reviews for all to authenticated using (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor'])) with check (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));
create policy "Owners read project distributions" on public.project_distributions for select to authenticated using (public.has_requirement_workspace_access(workspace_id, array['owner']));
create policy "Owners manage project distributions" on public.project_distributions for all to authenticated using (public.has_requirement_workspace_access(workspace_id, array['owner'])) with check (public.has_requirement_workspace_access(workspace_id, array['owner']));
create policy "Members read project impact" on public.project_impact_measures for select to authenticated using (public.has_requirement_workspace_access(workspace_id));
create policy "Editors manage project impact" on public.project_impact_measures for all to authenticated using (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor'])) with check (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));
create policy "Members read project improvement" on public.project_pdca_cycles for select to authenticated using (public.has_requirement_workspace_access(workspace_id));
create policy "Editors manage project improvement" on public.project_pdca_cycles for all to authenticated using (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor'])) with check (public.has_requirement_workspace_access(workspace_id, array['owner', 'editor']));

revoke all on public.project_operating_plans, public.project_operating_milestones,
  public.project_candidate_assessments, public.project_assignments, public.project_delivery_reviews,
  public.project_distributions, public.project_impact_measures, public.project_pdca_cycles from anon, authenticated;
grant select, insert, update, delete on public.project_operating_plans, public.project_operating_milestones,
  public.project_candidate_assessments, public.project_assignments, public.project_delivery_reviews,
  public.project_distributions, public.project_impact_measures, public.project_pdca_cycles to authenticated;