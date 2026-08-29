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

