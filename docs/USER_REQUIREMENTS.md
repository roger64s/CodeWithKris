# User Requirements Document — CodeWithKris Mobile Application

*Extracted from Product Owner conversations, organized by date.*

## 2026-08-22
- Build CodeWithKris as a speech-impaired voice training and practice companion.
- Support registration and sign-in for a private practice experience.
- Offer structured practice templates for phone calls, shopping, professional meetings, and social interactions.
- Let users record a voice sample and optionally upload an audio file.
- Provide real-time voice-to-text practice with accuracy matching.
- Show personal progress, recent practice sessions, accuracy, and streaks.
- Use a clean, responsive, accessibility-first mobile UI with high-contrast text and oversized controls.
- Keep the visual direction soft purple and indigo, adapted from the SpeechAssist wireframes.
- Use the supplied Kris the Jumbo logo as the visible brand mark in the application.
- Show existing-user Sign In first, with new-user signup available as a separate choice.
- Require email verification as part of the new-user signup flow.
- Provide a public Volunteer Agreement document formatted consistently with the website.
- Keep the application content sized to fit mobile screens without unnecessary overflow.
- Persist dictionary words, recordings, and practice sessions through the Supabase backend and private storage.
- Provide a demo Admin view with aggregate user statistics alongside the User practice view.
- Publish the application to GitHub and deploy the production app to Vercel at https://codewithkris.vercel.app.

## 2026-08-22 (Update)
- Change the login welcome headline to “Speak freely. Connect effortlessly”.
- Change the login welcome eyebrow text to “Breaking barriers - Learn to communicate without limits.”.
- Audit and improve the speech model, personalized Voice Dictionary, communication-channel integrations, and Go-To-Market Gigs learning workflow.
- Differentiate CodeWithKris for business use with practice scenarios for client briefs, project status updates, and QA handoffs.
- Make the audio sample upload control functional instead of displaying a placeholder row.
- Research Duolingo-inspired bite-sized learning, progress, habit support, and accessibility patterns for CodeWithKris.
- Enable a future large-scale CodeWithKris learning and application pathway that connects practice, work artifacts, and supervised opportunities with privacy safeguards.
- Research Quorum's accessible, block-like programming approach to help learners progress toward knowledge-economy contributions at their own pace.
- Include all three CodeWithKris phases: Universal Foundation, Commercial Task Tracks, and Applied AI & Workflow Execution.
- Show all three phases in the prototype demo with a lightweight selectable coding mission that can be expanded later.
- Group Phase 1, Phase 2, and Phase 3 tasks behind a left-side phase menu instead of showing every task in one page.
- Increase the CodeWithKris app header logo size for the overall page layout.
- Reduce excess top spacing across the authenticated app pages while keeping the larger logo visible.
- Audit project assets and third-party materials for copyright, licensing, attribution, and publication permission before commercial release.

## Closeout
- Phase-based navigation and the enlarged app logo were validated locally and are ready for publication.
- Track CodeWithKris project metrics separately from the Gradagig Website project and do not mix their commits, lines, hours, or effort data.
- Provide a CodeWithKris-only Project Metrics page for the Gradagig CodeWithKris Page link.
- Close the CodeWithKris project with documentation updated, local validation completed, and the final changes published separately from Gradagig Website.
- Keep the CodeWithKris-only Project Metrics page available at its production URL when the Vite app is deployed.
- Fit the desktop sign-in screen within one browser viewport without excess blank space or page scrolling.
- Fit the initial authenticated templates screen within one desktop browser viewport without page scrolling.
- Open a user dashboard after sign-in, then show only the tasks relevant to the phase selected from the left menu.
- Validate registration and sign-in credentials with Supabase Auth and provide a visible sign-out action.
- Keep the sign-in button compact instead of stretching across the full form width.
- Keep every desktop application and public-document screen within one browser viewport without page scrolling.

## 2026-08-29
- Provide user registration with selectable roles: Student, Woman/Carer, Investor, Mentor, Corporate, and Individual.
- Add an exclusive "CodeWithKris Administrator" role category reserved solely for roger.s@gradagig.com.
- Store the selected user role and render a role-specific dashboard greeting upon registration.

## 2026-08-30
- Include Persons with Disabilities (PWD) as the first category role option, alongside Student, Woman/Carer, Individual, Mentor, Corporate, Investor, NGO, Government, and Admin.
- Redesign category options into balanced squarish icon tiles arranged in a clean 5-column grid.
- Streamline welcome panel width and logo sizing to eliminate excess blank space on login and registration screens.
- Keep only "Create account" as the clean registration title without excess top kicker or subtitle text.
- Progressive disclosure on registration: display category icon boxes first; once a category is selected, collapse the full icon grid into a compact selected category pill with a change button, and reveal credentials inputs.
- Show the optional Speech Condition dropdown exclusively when "Persons with Disabilities" (PWD) is chosen; omit it for all other roles.
- Implement the AMUL-inspired cooperative sweat-equity model with role weights (Mentor: 1.5x, PWD/Student/Carer: 1.2x) and EVM 18-decimal precision units.
- Implement the OVU (Outcome Valuation Unit) Matrix with dynamic multipliers (+25% Reusability, +15% Speed, -30% Quality Penalty).
- Implement Web Crypto API zero-knowledge-ready data hashing for privacy-preserving, anonymous on-chain L2 audit verification.
- Implement the restricted Cooperative Financial & Equity Ledger with Row Level Security (RLS) policies for Grad-a-Gig Management and Authorized Investors.
- Track contributions from all participants without inventing financial values; begin with the founder's platform work, Abhinaya's logo design, and Josy Chow's audio recordings as unvalued records pending approved hours or OVUs.
- Derive contributor counts, approved hours, weighted units, and verification status from the secured contribution ledger instead of static demonstration figures.
- Let management record effort hours under controlled categories including Product Design, Development, Testing/QA, Marketing, Web Design, Brand Design, Audio/Voice, Research, Administration, and Other.
- Track financial investment separately from labor, including amount, currency, expense category, supplier, description, and receipt or invoice reference.
- Automatically bind every new effort and expense record to the logged-in Supabase user's ID, email, display name, and role; do not allow identity fields to be edited in the entry form.
- Let every authenticated user submit and review their own effort and expense records while keeping aggregate contribution and financial reporting restricted to management and authorized investors.
- Capture free-text Client Code and Project Code on every effort and expense record, ready for future validation against reference tables.
- Classify every record by the cost-control department allocation guide: Management (~10%), Delivery (~30%), Finance & Admin (~20%), Sales & Marketing (~20%), Customer Service (~10%), or Profit (~10%).
- Assign every registered user to one management-controlled cap-table stakeholder category after registration: Founders & Core Operating Team (40%), Institutional Seed Investors (20%), Employee & PwD Talent Pool (10%), Community & Ecosystem Trust (15%), Advisors (2%), or Unallocated Reserve/Future Rounds (13%).
- Automatically place new users in Community & Ecosystem Trust pending management review, except the founder account, which is assigned to Founders & Core Operating Team; registration roles must not grant cap-table ownership.
- Base OVU calculation on the user's assigned stakeholder category and OVU tier/modifiers, not their registration role; retain the category percentage as a cap-table pool classification rather than an OVU multiplier.
- Record Roger's USD 2,500+ documented operating investment without inventing a split across tax, accounting, GitHub Copilot, and related costs; support later receipt-level itemization.
- Fit the registration card cleanly within the desktop viewport without vertical scrolling.
- Keep CodeWithKris functional in Vercel production with its registration, contribution, investment, stakeholder-assignment, and RLS schema deployed to Supabase.
- Maintain final project documentation and effort charts before closing the workspace.

## 2026-08-31
- Restore the cooperative contribution ledger behavior to the correct prior version shown in the reference screenshot.
- Provide low-stakes Lead Generation, Appointment Fixing, Follow-Up Management, and Customer Service trials built around real-world scenarios.
- Build learning pathways from practical artifacts, learner questions, iteration, goals, and human-reviewed collaboration evidence.
- Keep the practical pathway free of paywalls and credit card prompts.
- Replace generic dashboard progress bars with a three-phase Cooperative Readiness tracker.
- Show peer-review contributions, reviewed code-quality scores, and live client sprint eligibility without inventing unavailable activity.
- Add a Client Project Impact widget for cooperative sprint and accepted-output activity.
- Show timestamped co-op impact metrics for active client projects, reinvested revenue, and member-owner contribution hours.
- Frame client impact around collective outcomes and shared training capacity rather than individual course purchases.
- Provide a collaborative queue where trainees submit focused commercial or technical work samples for producer-owner peer validation.
- Emphasize human governance, collective code ownership, and constructive revision feedback instead of automated instructor scoring.
- Provide a customizable Go-To-Market pilot workflow for client briefs, open-ended tasks, diverse participant assignments, anonymized target review, multilingual outreach, and conversion tracking.
- Compensate verified milestone effort separately from an 8% to 10% revenue success fee, with editable department splits and pricing visible only to the owning client and authorized administrators.
- Keep personal contact details hidden from the initial client target view until targets are prioritized and deeper engagement is authorized.
- Link every pilot task to auditable contribution and OVU records across the cooperative ecosystem.
- Provide a secure CRM database for companies, contacts, ownership history, and team-pod collaboration with owner-scoped access controls.
- Provide visible Company, Contact, and Contribution workspace views backed by owner-scoped CRM and contribution records.

## 2026-09-01
- Link Coop Equity company and contact records to their corresponding Go-To-Market Pilot target.
- Remove the obsolete “+ Contribute” navigation link and prevent access to its outdated contributions screen from the current user interface.
- Remove the Speech Condition field from new Persons with Disabilities account registration.
- After email verification, require every user category to complete a private first-login profile covering demographics, disability and communication context, language proficiency, skills, aspirations, hobbies, and a fun fact.
- Record signup and voluntary inactivity dates automatically, and use profile information only for research, Gradagig training and earning opportunities, and solution quality improvement.
- Provide a Profile menu where authenticated users can edit their details and change their password.
- Keep all profile information optional without enforced field validation.

## 2026-09-02
- Preserve all registration categories while separating them from project-specific Developer, Tester, and Project Manager operational roles.
- Map project memberships and operational roles to task allocation, contributions, and quality monitoring with secure session-aware access controls.
- Restrict Mentor users to project oversight views and exclude them from direct execution task queues.
- Provide hierarchical requirements management from product requirements through features, user stories, and tasks or technical specifications, with a persistent Table of Contents.
- Allow multiple authenticated collaborators to view and edit structured rich content together.
- Automatically trace requirements, features, stories, test cases, and issues with forward and backward impact analysis.
- Organize each product workspace into public and private Product, Backlog, Test Library, Release 1-4, and Sprint 1-3 folders.
- Provide a Kanban task board with Not Started, In Progress, Ready for Review, and Done workflow columns and drag-and-drop movement.
- Allocate tasks, reviewers, and approvals directly to registered CodeWithKris users with controlled, auditable workflow state changes.
- Generate test cases directly from features and user stories with ordered actions, expected results, and inline step notes.
- Generate and execute test runs across environment variants such as operating system, hardware heat range, and salinity.
- Track each test step as passed, failed, or blocked.
- Require a problem statement and attachment for every failed test step, then automatically create a linked issue or defect.
- Freeze and duplicate complete project, folder, document, sprint, task, test, and issue states into immutable versioned release baselines.
- Compare release baselines with added, changed, and removed items plus field-by-field and test-step telemetry.
- Provide a real-time contributor dashboard tracking activity, effort hours, lines changed, rework, and code-quality metrics from active workspace state.
- Require every new Requirements Project to link to a CRM Company classified as Client; select that Client and Project rather than free text when recording Coop Equity effort, with optional sprint-task traceability and approved hours included in activity analytics.

## 2026-09-03
- Manage each Grad-a-Gig Client Project from AI-assisted marketing and scope through milestones, budget, payment terms, work breakdown, and timeline.
- Assess skills and work preferences with consent-based accessibility support for Persons with Disabilities, women and carers, and students.
- Use AI to recommend suitable contributors while requiring a recorded human review before matching or assignment.
- Agree contributor roles, effort, and budgets before mentored delivery begins.
- Track quality, rework, timeliness, integration, client acceptance, milestone billing, and contributor performance without bypassing existing task gates.
- Protect contributor funds before allocating department and overhead shares.
- Measure inclusive participation, mentoring, paid effort, and accepted outputs, then manage improvements through PDCA cycles.
- Keep Coop Equity permanently visible and integrated with Client Projects, operations, sprint tasks, approved effort, and lifecycle activity.
- Preserve the current application architecture and established design patterns while adding a hybrid local-partner and foreign-client workflow.
- Assign discovery, lead generation, local outreach, and tier-1 support to the local partner.
- Assign core demo environments, final pricing, contract execution, and technical escalation to the foreign client.
- Integrate cross-party task handoffs, approvals, revenue controls, and audit history into the existing CRM, GTM, project operations, sprint, quality, and Coop Equity modules.
- Map the existing Management, Delivery, Finance & Admin, Sales & Marketing, Customer Service, and Profit departments to local-partner, foreign-client, or shared responsibility in the project UI and database.
- Use micro-task trials and practical play supported by assistant-guided reflection, without fixed learner scores or labels.
- Track progress formatively within learning pods through mentorship engagement, tool use, collaboration, and iteration evidence.
- Capture goals, availability, passion areas, and support preferences through agency-preserving conversational onboarding.
- Provide a shareable document describing the Universal Foundation, four commercial task tracks, Applied AI workflow training, practical trials, progress evidence, and readiness process.
- Support active listening, de-escalation, professional text and email communication, and synchronous or asynchronous voice clarity in the Universal Foundation.
- Let learners flexibly specialize in Lead Generation, Appointment Fixing, Follow-Up Management, or Customer Service.
- Teach responsible AI-assisted response drafting, text-task automation, CRM organization, and technical or operational workflow execution.

