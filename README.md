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
- Client Code, Project Code, effort category, department allocation, and evidence tracking.
- Management-controlled stakeholder assignments for cap-table pool classification.
- OVU tier calculation with reusability, speed, and quality modifiers.
- RLS-protected private records and anonymous L2 audit-proof preparation.

## Local development

Run `npm run dev` to start the React app and API together. The API runs on `http://127.0.0.1:8787`, and the Vite client proxies `/api` requests to it.

Create `.env` from `.env.example` and add the project URL and keys. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` enable browser sign-in and may contain only Supabase public client credentials. Never expose or commit service-role, database, or signing secrets.

The production Supabase schema in `supabase/schema.sql` has been applied. It is repeatable and includes RLS policies, contribution and investment records, stakeholder assignments, private audit records, and signup triggers.
