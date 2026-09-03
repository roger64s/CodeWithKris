# Hybrid Partner-Client Revenue and Task Workflow

## Architecture Decision

Implement the workflow as an additive orchestration layer over the existing CRM, GTM Pilot, Requirements, Sprint Task Board, Project Operations, Quality, and Coop Equity modules. Do not create a second CRM, task board, project lifecycle, or payment ledger.

The new layer will link the existing project records, declare which party owns each responsibility, and audit handoffs between the local partner and foreign client.

## Existing Module Fit

| Existing module | Retained responsibility | Hybrid extension |
| --- | --- | --- |
| CRM | Companies, contacts, ownership, team-pod access, protected contact data | Classify organizations as local partner or foreign client and link both to an engagement |
| GTM Pilot | Target research, approved messaging, outreach, conversion, milestone claims | Local-partner discovery and lead-generation work; client approval gates remain intact |
| Requirements Workspace | Canonical client project and collaboration boundary | Link the engagement to one existing client workspace |
| Sprint Task Board | Delivery tasks, assignee/reviewer separation, status transitions, audit events | Add responsibility side, workstream, service level, and handoff status to tasks |
| Project Operations | Scope, funding, milestones, quality, acceptance, billing, distribution, PDCA | Add demo, pricing, contract, support, and escalation gates to the existing lifecycle |
| Quality Workspace | Test evidence, defects, and quality outcomes | Supply evidence for technical escalation and client acceptance |
| Coop Equity / contributions | Approved effort, OVU, and distributions | Attribute approved local-partner work without creating a separate compensation ledger |

## Responsibility Model

| Workstream | Responsible party | Accountable approval | System of record |
| --- | --- | --- | --- |
| Market discovery | Local partner | Local partner lead | GTM tasks and evidence |
| Lead generation and qualification | Local partner | Foreign client commercial reviewer at qualification gate | CRM, GTM targets, and outreach events |
| Local-language outreach | Local partner | Foreign client approves message templates | GTM messages and outreach events |
| Tier-1 support | Local partner | Local partner support lead | Sprint tasks and support handoffs |
| Core demo environment | Foreign client | Foreign client technical owner | Project milestone linked to sprint tasks |
| Final pricing | Foreign client | Foreign client commercial approver | Restricted commercial terms |
| Contract execution | Foreign client | Foreign client contract signatory | Contract record and private artifact metadata |
| Technical escalation | Foreign client | Foreign client technical owner | Escalation handoff linked to quality evidence or issue |
| Delivery acceptance | Shared | Foreign client reviewer | Existing project milestone and quality gates |
| Revenue allocation | Shared visibility, controlled approval | Authorized workspace owner | Existing project distribution and contribution records |

## Additive Data Model

Create one migration, `supabase/hybrid_partner_workflow.sql`, applied after `project_operations.sql`.

### 1. Engagement Bridge

Add `partner_client_engagements` as the single bridge between current project domains:

- `id`
- `gtm_project_id` referencing `gtm_projects`
- `workspace_id` referencing `requirement_workspaces`
- `local_partner_company_id` referencing `companies`
- `foreign_client_company_id` referencing `companies`
- `status`: `draft`, `discovery`, `qualified`, `commercial_review`, `contracting`, `active`, `support`, `closed`
- `created_by`, `created_at`, `updated_at`
- Unique constraints on the GTM project and requirements workspace links

This preserves both existing project models while making their relationship explicit and queryable.

### 2. Party Membership

Add `engagement_participants`:

- `engagement_id`, `user_id`
- `party_side`: `local_partner` or `foreign_client`
- `engagement_role`: `lead`, `member`, `commercial_approver`, `contract_signatory`, `technical_owner`, `support_agent`, `viewer`
- `active_from`, `active_until`, `assigned_by`

Workspace `owner`, `editor`, and `viewer` remain authorization levels. Engagement roles describe business responsibility and must not replace registration categories or project operational roles.

### 3. Task Responsibility

Extend `sprint_tasks` with nullable fields so existing tasks remain valid:

- `engagement_id`
- `responsibility_side`: `local_partner`, `foreign_client`, or `shared`
- `workstream`: `discovery`, `lead_generation`, `tier_1_support`, `demo_environment`, `pricing`, `contract`, `technical_escalation`, or `delivery`
- `service_level_due_at`

Continue to use `assignee_user_id`, `reviewer_user_id`, `workflow_status`, and `sprint_task_events`. A validation trigger must require the assignee to be an active participant on the declared side and preserve the existing assignee/reviewer separation.

### 4. Handoffs and Escalations

Add `engagement_handoffs`:

- `engagement_id`, optional `sprint_task_id`, optional `quality_issue_id`
- `handoff_type`: `qualified_lead`, `demo_request`, `pricing_request`, `contract_request`, `support_escalation`, `client_acceptance`
- `from_side`, `to_side`
- `status`: `requested`, `acknowledged`, `in_progress`, `resolved`, `accepted`, `rejected`
- `summary`, `requested_by`, `assigned_to`, timestamps, resolution notes
- `response_due_at`, `resolved_at`

Use a controlled database function for transitions and an immutable event table for status history. Do not encode handoffs only in free-text task comments.

### 5. Commercial Terms and Contracts

Add restricted records rather than adding sensitive fields to client-visible GTM tables:

- `engagement_commercial_terms`: currency, client price, local-partner fee type and value, effective version, approval state, foreign-client approver, timestamps
- `engagement_contracts`: contract status, external reference, effective dates, signatory, private storage object path, executed timestamp

Final pricing may be drafted and approved only by the foreign-client commercial approver or an authorized administrator. The local partner sees the approved fee basis and payment status, but not foreign-client internal margin or draft pricing unless explicitly granted.

Revenue receipts and allocations must flow into `project_distributions`; verified local effort continues through `contribution_records` and OVU records. No second ledger is introduced.

## Workflow Gates

1. **Discovery:** Local partner creates research and discovery tasks and records protected contacts in CRM.
2. **Qualification:** Local partner submits a qualified-lead handoff. The foreign client accepts or rejects it with a reason.
3. **Demo readiness:** Foreign client owns the demo-environment milestone and linked technical tasks. Local partner can schedule only after readiness is approved.
4. **Commercial review:** Local partner requests pricing; foreign client versions and approves final pricing. Approved terms become read-only for the active version.
5. **Contracting:** Foreign client records contract progress and execution. The engagement cannot become `active` until an executed contract and approved terms exist.
6. **Delivery:** Work uses the existing Requirements, Sprint, Quality, and Project Operations gates.
7. **Tier-1 support:** Local partner triages and resolves support tasks within its scope.
8. **Technical escalation:** Local partner creates a linked escalation with reproduction evidence; foreign client acknowledges, resolves, and returns it for local verification.
9. **Acceptance and revenue:** Foreign client accepts milestones; existing billing, distribution, contribution, and OVU controls process the financial outcome.

## Access-Control Rules

- Derive access from authenticated user IDs, workspace membership, engagement participation, and explicit roles. Never trust a role sent only by the browser.
- Local-partner users can manage discovery, lead generation, approved outreach, and tier-1 support records for their engagements.
- Foreign-client users can manage demo readiness, final pricing, contracts, and technical escalations for their engagements.
- Shared project members can read only the records permitted by their workspace and engagement memberships.
- Contact PII remains in CRM and `gtm_target_contacts`; client-safe target views remain anonymized.
- Commercial drafts, contract artifacts, and internal margins use separate RLS policies and a private storage bucket.
- State-changing functions validate party side, engagement role, current state, and linked-record ownership in the database.

## Application Components

Keep the current directory structure and component conventions:

- `src/lib/partnerClientWorkflow.ts`: shared types, labels, and allowed state transitions.
- `src/components/PartnerClientWorkflow.tsx`: engagement summary, responsibility matrix, handoff queue, and role-aware actions.
- `src/components/CommercialHandoffPanel.tsx`: pricing and contract status for authorized users.
- `src/components/SupportEscalationPanel.tsx`: tier-1 queue and technical escalation evidence.

Render these from the existing Requirements Workspace operations view and link relevant items to the existing Sprint Task Board. Extend `GtmPilotProject` with qualification and demo-request actions; do not add a new top-level application shell or navigation framework.

## Events and Notifications

Use Supabase Realtime on engagement handoff and event tables, matching the current task-board subscription pattern. Emit notifications for:

- qualified lead awaiting foreign-client review
- demo environment ready or blocked
- pricing request awaiting approval
- contract awaiting execution
- tier-1 service-level breach risk
- technical escalation awaiting acknowledgement
- milestone accepted and eligible for billing

Persist every notification source as an auditable domain event; realtime delivery is a convenience, not the system of record.

## Delivery Sequence

### Phase 1: Foundation

- Add engagement, participant, task-responsibility, and handoff tables with constraints and RLS.
- Link one existing GTM Pilot to one existing Requirements Workspace.
- Add role-aware engagement and handoff views.
- Validate local-partner discovery through foreign-client qualification acceptance.

### Phase 2: Commercial Control

- Add restricted pricing versions and contract metadata.
- Enforce pricing and contract approval roles in database functions.
- Gate engagement activation on approved terms and executed contract.
- Connect accepted commercial outcomes to existing milestones and billing stages.

### Phase 3: Support and Escalation

- Add tier-1 support task templates and service-level deadlines.
- Link technical escalations to quality issues, evidence, and sprint tasks.
- Add acknowledgement and resolution metrics to Project Operations.

### Phase 4: Revenue and Reporting

- Connect accepted milestones to existing project distributions and contribution records.
- Report pipeline conversion, handoff time, demo readiness, contract cycle time, support resolution, escalation ageing, accepted revenue, and partner earnings.
- Add PDCA actions for missed service levels and rejected handoffs.

## Acceptance Criteria

- Existing CRM, GTM, Requirements, Sprint, Quality, and Coop Equity workflows continue to operate for records with no engagement link.
- Each hybrid task has one declared responsible side and only an eligible participant can be assigned.
- A local partner cannot approve final pricing, execute the foreign-client contract, or close a technical escalation.
- A foreign client cannot access protected contact PII solely through client-project membership.
- Every handoff and approval has an immutable actor and timestamp trail.
- Engagement activation is blocked until pricing and contract gates pass.
- Accepted revenue and partner compensation reconcile to existing distribution and contribution records without duplicate ledger entries.
- RLS tests cover both parties, shared viewers, unauthorized users, and administrators.

## Validation Strategy

- SQL tests for RLS visibility, role-specific mutations, invalid state transitions, cross-engagement links, and task assignment constraints.
- Component tests for role-aware controls and restricted commercial views.
- Integration tests for discovery-to-contract and tier-1-to-technical-escalation paths.
- Regression build and lint checks for the existing Vite application.
- Manual browser verification at desktop and mobile widths for the embedded operations panels.
