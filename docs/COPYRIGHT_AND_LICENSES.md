# Copyright and Licensing Register

This register records the provenance checks for the CodeWithKris and connected Grad-a-Gig work. It is an engineering checklist, not legal advice or a substitute for written permission from an asset owner.

## Cleared or low-risk sources

| Item | Use | Basis | Action |
| --- | --- | --- | --- |
| React, React DOM, Vite, TypeScript, Express, CORS, Multer, Supabase client | Application dependencies | Package metadata identifies permissive open-source licenses; preserve package-lock metadata | Keep dependency notices available and review licenses on upgrades |
| Tailwind CSS CDN | Grad-a-Gig styling | Tailwind CSS is open source; the site loads the public CDN rather than copying its source | Pin a version for production and retain the upstream license notice if bundling later |
| Chart.js and chartjs-plugin-datalabels CDN | Grad-a-Gig charts | Public packages are distributed under their respective open-source licenses | Pin versions and retain notices if copied into the repository |
| Google Fonts Inter | Web typography | Served from Google Fonts under its published font licensing terms | Keep the font provider link; self-host only after recording the font license |
| Research references to Google Project Euphonia, Duolingo, and Quorum | Product research documentation | Nominative references for comparison and inspiration; no copied logos, code, or screenshots | Do not imply endorsement, partnership, or affiliation |

## Owner confirmation required

These assets are present in the repositories but their copyright owner, license, or written permission is not recorded in Git:

- `public/CodewithKris_logo.png`
- `docs/Grad-a-gig_Logo.png`, `docs/Grad-a-gig_Logo_Dark.png`, and other Grad-a-Gig logos
- `docs/Kris_theJumbo_Mascot.png` and CodeWithKris diagrams
- `docs/photos/*` team photographs
- `docs/Gradagig_CodewithKris_Short.pdf`
- `docs/Gradagig_CodewithKris_One_Minute_Pitch.pdf`
- `docs/Gradagig_Godaddy_2026Aug09.pdf`
- `docs/Tata_Alternative_Fundraising_Strategies(Non-IPO).pdf`
- `docs/Tata_Alternative_Fundraising_Strategies_Non-IPO.pdf`
- `Doc/MobileApplicationBuildPrompt.docx`
- `public/CodeWithKris_Volunteer_Agreement.docx`
- The Loom-hosted thumbnail and video embedded by `GradagigWebsite/index.html`

Before commercial publication, add one of the following for every item above: an owner/permission record, an applicable license and attribution, or a replacement asset created by the project team. Do not assume that receiving a file from a stakeholder grants redistribution rights.

## Specific content cautions

- The Tata name and related marks belong to their respective owners. Keep any article clearly framed as independent commentary, avoid implying endorsement, and verify that the article and PDF are original or licensed for redistribution.
- Team photos require consent from each identifiable person for website publication and the intended audience.
- The Loom video and thumbnail must be owned by the publisher or used with permission. Keep the provider attribution and terms link where required.
- The CodeWithKris and Grad-a-Gig marks should be used only with the brand owner's authorization. Do not reuse third-party logos from research or competitor sites.
- Product language inspired by other products should be rewritten in original wording. Do not copy Duolingo, Euphonia, Quorum, or other sites' copy, illustrations, UI screenshots, mascots, or source code.

## Repository hygiene

- `src/assets/react.svg`, `src/assets/vite.svg`, and `src/assets/hero.png` are Vite starter assets and are not referenced by the current app. Remove them before a public release if they are not needed, or retain their upstream license notices.
- `public/favicon.svg` and `public/icons.svg` contain artwork with no project provenance record. They are not needed for the current React UI except that `favicon.svg` is referenced by `index.html`; replace or document their source and license before commercial release.
- Do not publish `node_modules`, `.venv`, build output, temporary office lock files, or local databases. Keep them ignored and out of release commits.

## Release gate

A release is copyright-ready only when:

1. Every non-original image, document, font, video, and icon has a recorded source and permitted use.
2. Required attribution is visible in the site or in a distributed notices file.
3. Identifiable people have publication consent for the intended use.
4. Third-party names are used descriptively and no endorsement is implied.
5. A final asset scan is run against tracked files before pushing or deploying.
