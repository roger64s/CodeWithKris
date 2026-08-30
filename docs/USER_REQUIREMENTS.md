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
- Include all three CodeWithKris prototype phases: Basic Communication, Go-To-Market Skills, and Learn Coding & Pair Programming.
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

