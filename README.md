# CodeWithKris

CodeWithKris is an accessibility-first voice practice, work-readiness, and cooperative contribution platform for people with disabilities, students, carers, mentors, and partner organizations.

## Production

- Application: https://codewithkris.vercel.app
- Hosting: Vercel production deployment
- Authentication, database, RLS, ledger, and storage: Supabase
- Status: Functional and verified on 2026-08-30

## Key capabilities

- Supabase registration and authentication with role-specific dashboards.
- Universal Foundation missions for active listening, de-escalation, professional messages, digital etiquette, and voice clarity.
- Flexible Lead Generation, Appointment Fixing, Follow-Up Management, and Customer Service tracks with real-world commercial task trials.
- Appointment Fixing audio practice is divided into Greeting, Ask Availability, Check Schedule, and Confirm Appointment, with private per-step recordings and optional model-improvement consent.
- A configuration-driven MFCC/delta feature pipeline and two-hidden-layer MLP baseline supports versioned multi-track inference, dynamic classes and transitions, measured latency, optional diarization, and speaker-disjoint 80/20 evaluation without hard-coded results.
- Applied AI and workflow missions for response drafting, text automation, CRM organization, and technical or operational execution.
- Inclusion-first conversational onboarding captures goals, availability, passion areas, support preferences, practical approaches, questions, and iteration without ranking learners.
- Formative learning-pod evidence tracks mentorship, tool use, collaboration, and iteration from active project work.
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

Optional practical-trial coaching uses an OpenAI-compatible endpoint configured server-side with `AI_ASSISTANT_API_URL`, `AI_ASSISTANT_API_KEY`, and `AI_ASSISTANT_MODEL`. The assistant is constrained to coaching observations, a next experiment, and a clarifying question; it does not rank learners or make assignment decisions.

The optional speech-task service is documented in `ml/README.md`. Configure `ML_INFERENCE_API_URL`, `ML_MODEL_ROOT`, and the same server-only `ML_SERVICE_API_KEY` in the Node API and Python service. No task output or benchmark is shown until consented labeled data has produced a self-describing `ml/artifacts/<task-id>/model.joblib` and `metrics.json`.

Apply the repeatable Supabase migrations in this order: `supabase/schema.sql`, `supabase/audio_recording_history.sql`, `supabase/audio_task_inference.sql`, `supabase/crm_schema.sql`, `supabase/gtm_pilot_workflow.sql`, `supabase/requirements_management.sql`, `supabase/sprint_task_board.sql`, `supabase/project_operations.sql`, `supabase/action_based_evaluation.sql`, `supabase/hybrid_partner_workflow.sql`, `supabase/test_quality_issues.sql`, `supabase/baselines_activity.sql`, `supabase/rbac_access_control.sql`, `supabase/support_ticketing.sql`, `supabase/learning_gamification.sql`, `supabase/learning_vocabulary.sql`, then `supabase/learning_reframing.sql`. The migrations enable private audio, transcript, and measured task-inference history, requirements traceability, controlled delivery and quality workflows, action-based learner evidence, commercial and inclusive project operations, hybrid department responsibility mapping, immutable release snapshots, structured differences, Realtime contributor analytics, role-protected support ticketing, isolated streak, XP, and skill-tree progress, dynamic programming-language vocabulary practice, and concept-reframing cue mastery.
