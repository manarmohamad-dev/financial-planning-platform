# P0 implementation and verification

Date: 2026-10-19 (Africa/Cairo)
Scope: public landing and approved P0 usability improvements only. No deployment or push.

## Implemented

- `/` is a public, lazy-loaded bilingual landing page. It explains SME users, the three-step journey, sales/hiring/expenses/expansion, optional forecasting, risk findings, Decision Briefs, and the precise role/limits of AI. Sign In and Get Started link to existing authentication screens.
- Actual application screenshots were captured from an isolated synthetic company in English and Arabic, not fabricated marketing results. No testimonials/customer logos were introduced.
- Company setup now identifies the next action from existing saved progress and keeps forecasting optional.
- Scenario shortcuts provide direct access to comparisons and history. In-page navigation retains exact record query parameters and moves keyboard focus.
- Disabled-action explanations added for comparison, scenario confirmation, baseline preparation, forecasting eligibility, import mapping and stress actions. Existing permission/eligibility expressions remain authoritative.
- Workflow stages explicitly explain that they indicate progress and that actions are below.
- Guided Input instructions and import handoff copy now describe the user's action. Historical AI evidence remains accessible.
- AI headings distinguish saved assistance, assumption review, scenario explanation, risk interpretation and Decision Brief assistance. Consent-help descriptions have task/source-specific IDs.
- Stress adjustment labels are translated rather than exposing raw enum values.
- `/workspaces/:workspaceId/account` redirects to `/account` before matching the generic workspace page route.
- Existing record identifiers, evidence and financial calculations remain intact.

## Changed implementation areas

New: `apps/web/src/landing.ts`, `landing.html`, `landing.css`, `locales/p0.ts`; `apps/web/public/assets/product/overview-en.png` and `overview-ar.png`.

Updated: `angular.json` (public asset copying), `apps/web/src/navigation.ts`, `main.ts`, `app.html`, `ui.ts`, `ai-assistance.ts`, `ai-assistance.html`, `decisions.html`, `planning.html`, `imports.html`, `forecasts.html`, `stress.html`, `product-system.css`, `locales/ar.ts`.

These changes are within the pre-existing dirty working tree. Earlier M7/M8/deployment work was preserved; this report does not attribute all Git changes to P0.

## Automated results

- `npm run typecheck`: PASS.
- `npm test`: **621/621 passed**, 19 files, 0 failures (final run 41.68 seconds). Local test database only; external TEST_ADMIN_DATABASE_URL removed from the test process environment.
- `npm run lint -- --ignore-pattern 'tmp/p0-release/**'`: PASS. The exclusion is only the generated isolated release used for browser review; no source files excluded. Plain lint first scanned generated/minified release output and reported 2714 generated-code errors; this was an inspection-artifact issue, not a reason to change lint rules.
- `npm run build:api -- --outDir .local/p0-release/dist`: PASS.
- `npx ng build web --output-path tmp/p0-release/dist/web`: PASS, no bundle budget warning. Initial bundle 734.54 kB / estimated transfer 145.05 kB. Landing lazy chunk 22.34 kB / 5.47 kB.
- Original normal `dist/` and the existing public demo build were not replaced.

## Browser verification

Chrome, production Angular/Express build, local HTTPS proxy and independent embedded PostgreSQL. AI intentionally disabled to verify unavailable fallback; no provider calls. Loopback self-signed certificate exception was confined to the test browser, not production TLS.

`docs/evidence/p0/browser-results.json`: **93 passed checks**, no failures, no JavaScript page errors, no unexpected failed HTTP responses. One expected `/api/v1/auth/me` 401 occurred before login.

Routes inspected: `/`, `/sign-in`, `/sign-up`, `/workspaces`, `/account`, and workspace overview, setup, planning, imports, forecasts, decisions, stress, briefs, members, settings, account alias. Saved baseline/run/stress-comparison/brief contexts were used on relevant routes.

Each of the eleven workspace-route cases was checked in EN/LTR and AR/RTL at 1440x1000, 768x1024 and 390x844. No document-level horizontal overflow. Internal tables retain their existing scroll containers. Landing images loaded at all three widths in both languages.

`docs/evidence/p0/interaction-results.json`: **14 passed checks**:
- Landing header does not overlap content at all six language/size combinations.
- Visible CTA hover feedback and Get Started -> sign-up.
- Comparison shortcut focuses its target and retains the exact scenario run ID.
- AI-unavailable message visible and request button disabled.
- Unsaved Guided Input text survives Keep editing; navigation is cancelled.

Also verified login using the real local API, session persistence after reload, Secure/HttpOnly session cookie flags, keyboard skip link and account alias navigation. No session-cookie values are recorded.

Visual review caught and fixed two landing-only issues: dark headings on dark panels and mobile header height inherited from global styles. Final screenshots were regenerated and inspected in English/Arabic, including mobile. Existing authentication/permission semantics were not changed.

## Evidence

- Landing: `docs/evidence/p0/landing-{en,ar}-{desktop,tablet,mobile}.png`.
- Setup, decisions, stress and briefs: `docs/evidence/p0/{setup,decisions,stress,briefs}-{en,ar}-{desktop,mobile}.png`.
- Interaction evidence: `comparison-entry-en.png`, `guided-draft-en.png`.
- Machine-readable results: `browser-results.json`, `interaction-results.json`.

## Practical limits / remaining review

- This is local P0 acceptance, not public-host verification or deployment. Google Sign-In and permanent hosting remain P1.
- Browser checks used Chrome viewport emulation, not physical mobile devices, Safari or a screen reader. Keyboard/focus checks are targeted, not a full WCAG certification.
- Financial/API regression passed, and saved financial screens loaded through the real local API. This pass did not repeat every import/forecast write journey, every role combination, or regenerate PDFs; their implementations were not changed. Brief screens were checked; new workflow guidance is hidden in print.
- AI fallback was verified; live provider quality was not retested because P0 changes labels and guidance only.
- Product screenshots intentionally contain synthetic names/source values; stored source values are not translated.
- Visual approval remains the user's decision. No claim of instructor approval is made.

## Safety / stop

No financial formula, Python runtime logic, AI provider/business logic, authentication or permission semantics changed. No Neon connection, migration/reset, billing, Git push or deployment. P0 implementation and the verification documented above are complete. Stop here for review.
