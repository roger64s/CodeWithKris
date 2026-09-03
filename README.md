# CodeWithKris

CodeWithKris is an accessibility-first voice practice, work-readiness, and cooperative contribution platform for people with disabilities, students, carers, mentors, and partner organizations.

## Production

- Application: https://codewithkris.vercel.app
- Hosting: Vercel production deployment
- Authentication, database, RLS, ledger, and storage: Supabase
- Status: Functional and verified on 2026-08-30

## Key capabilities

- Supabase registration and authentication with role-specific dashboards.
- Voice practice, recordings, dictionary, progress, and phased learning missions.
- Authenticated effort-hours and financial-investment registers.
- CRM Client-linked Requirements Projects and normalized effort records, with separate expense references, department allocation, and evidence tracking.
- Management-controlled stakeholder assignments for cap-table pool classification.
- OVU tier calculation with reusability, speed, and quality modifiers.
- RLS-protected private records and anonymous L2 audit-proof preparation.
- Hierarchical requirements, collaborative rich-text editing, traceability matrices, and bidirectional impact analysis.
- Public/private planning folders, release and sprint backlogs, and an allocated Kanban task board with controlled review and approval.
- Requirement-derived test cases, variant test runs, evidence-backed execution, and automatic linked defect tracking.
- Immutable release baselines, field-level lifecycle differences, and Realtime contributor activity analytics synchronized from approved lifecycle-linked Coop Equity effort.
- Client Project operations spanning AI-assisted scope and marketing, prefunded milestones, consent-based inclusive matching, department-level local-partner and foreign-client responsibilities, mentored delivery, quality and client acceptance, protected contributor distributions, impact measures, and PDCA improvement.

## Local development

Run `npm run dev` to start the React app and API together. The API runs on `http://127.0.0.1:8787`, and the Vite client proxies `/api` requests to it.

Create `.env` from `.env.example` and add the project URL and keys. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` enable browser sign-in and may contain only Supabase public client credentials. Never expose or commit service-role, database, or signing secrets.

Apply the repeatable Supabase migrations in this order: `supabase/schema.sql`, `supabase/crm_schema.sql`, `supabase/gtm_pilot_workflow.sql`, `supabase/requirements_management.sql`, `supabase/sprint_task_board.sql`, `supabase/project_operations.sql`, `supabase/hybrid_partner_workflow.sql`, `supabase/test_quality_issues.sql`, then `supabase/baselines_activity.sql`. The lifecycle migrations enable requirements traceability, controlled delivery and quality workflows, commercial and inclusive project operations, hybrid department responsibility mapping, immutable release snapshots, structured differences, and Realtime contributor analytics.
