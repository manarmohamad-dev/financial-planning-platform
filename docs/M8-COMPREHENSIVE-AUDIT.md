# M8 — Comprehensive final project audit

## Final local closure — 2026-10-16

**M8_READY_FOR_M9**. See section 9 of [M8-FIX-CLOSURE.md](M8-FIX-CLOSURE.md): 612 tests pass, final build/security checks pass, remaining representative connected journeys and populated responsive defects are closed, and compiled full-application production startup is verified locally. [M9 handoff](M9-DEPLOYMENT-READINESS.md) preserves the external hosting/Neon/HTTPS/capacity gates. No deployment performed. The earlier audit and checkpoint below remain historical evidence.

## Historical follow-up closure — 2026-10-15

See [M8-FIX-CLOSURE.md](M8-FIX-CLOSURE.md) for the authorized implementation/verification follow-up. Router and related compatible security patches are applied; full and production-only dependency scans report zero vulnerabilities. README/security claims are corrected. A fresh dependency/source-copy check passed lint, typechecks, **611 tests (0 failures)** and both production builds. CSV/XLSX, populated forecasting, all four Guided Input families and EN/AR PDFs gained actual local integration evidence. Required previously untracked M7 source is staged, not committed or pushed.

Historical closure verdict (superseded above): **M8_STILL_BLOCKED**. Remaining exact UI acceptance permutations and complete production packaging/hosting proof are explicitly listed in the closure report. Device route checks are not claimed as all-device mutation tests. The original audit below is preserved as historical evidence; its affected dependency versions and AI documentation findings describe the pre-fix state.

Date: 2026-10-15. **M8_FIXES_REQUIRED**. Audit only; no implementation, dependency, database, account, provider or deployment changes.

## 1. Executive summary

The product is a substantial, coherent graduation project: reviewed company data becomes an immutable financial baseline, explicit decisions become comparable deterministic results, statistical forecasts are optional, and risk/brief evidence remains traceable. Revised M7 adds real LLM evidence selection and validated interpretation without delegating calculations. Guided Input is manual, not disguised AI.

**M7_ACCEPTED_REVISED_SCOPE remains the accepted checkpoint.** M8 does not reopen rejected extraction or recommend another model. Nevertheless, milestone acceptance is not proof of deployment readiness. Current packaging is backend-only, no complete approved free/no-card hosting arrangement has been verified, a current dependency audit fails the configured security gate, and public-facing documentation contradicts the implemented AI scope. Some final end-to-end visual coverage is still incomplete.

Recommendation: retain the architecture and design; close the release/security/documentation and focused verification gaps below. Do not start a broad redesign, new accounting functionality, provider experiment, billing, or deployment during this audit.

### Three review perspectives

These are separate review lenses applied by one auditor, not three external human certifications or independently executed agent reviews.

1. **Senior full-stack engineer:** sound domain boundaries, strong contract tests, immutable data and tenant controls. Biggest risks are release reproducibility, deployment topology, dependency gate and operating evidence.
2. **SaaS product reviewer:** recognizable financial SaaS with real workspace, account, setup and governance flows; substantially more than seven dashboards. Main weakness is complexity of reviewed workbenches and incomplete final device/journey coverage, not lack of billing or cosmetic features.
3. **Graduation examiner:** technically defensible and useful if presented as decision simulation under reviewed assumptions. The honest AI contribution is bounded evidence selection/interpretation; neither chat-driven scenario generation nor financial advice should be demonstrated or claimed.

### Scores

Subjective evidence-weighted scores out of 10, not certifications or statistical accuracy estimates. 10 would require complete verified final-release evidence.

| Dimension | Score | Reason |
| --- | ---: | --- |
| Engineering | 8.0 | Typed domain boundaries, real PostgreSQL tests, reproducible calculations; release packaging unresolved. |
| SaaS UX | 7.5 | Consistent shell, meaningful dashboard, reviewed workflows, bilingual support; dense evidence and incomplete final tablet/full-flow coverage. |
| Financial correctness | 8.5 | Decimal arithmetic, explicit timing, capability gates and invariants; no independently audited real-company accuracy claim. |
| AI value | 7.0 | Useful actual evidence assistance with strong safety constraints; bounded/repetitive wording and no accepted free extraction. |
| Security | 7.5 | Session/CSRF/RLS/role controls; dependency gate, operating setup and public-service limits remain. |
| Graduation readiness | 8.0 | Strong scope and explainability; documentation, demo rehearsal and deployment decision need closure. |

## 2. Evidence and method

Reviewed repository structure, Angular routing/shell/workbenches, domain engines/models, import parsing, Python runner, API composition/configuration/security, migration runner, Docker/CI, M1–M7 reports and acceptance artifacts. This was a risk-based cross-project source audit, not a claim that every line was independently re-proven.

- Established latest regression: **611 passed, 0 failed, 18 files**. Final M7 prompt-marker-only edit subsequently passed 47 affected tests and typecheck/lint/API/Angular builds. Counts are not additive. No unnecessary full rerun in M8.
- M7 live evidence: two actual saved Groq risk outputs in EN/AR; six role/language saved-history checks; two mobile checks; AI-disabled deterministic replay. Earlier two-scenario result explanation, assumption review and brief artifacts remain applicable.
- M8 newly executed read-only production dependency audit: initial TLS trust failure; rerun with Node `--use-system-ca` succeeded in retrieving advisories, reporting **one HIGH vulnerability, zero critical**, and exited nonzero. TLS verification was not disabled. No packages changed.
- Reinspected actual retained screenshots: `docs/evidence/density-composition/overview-regression-ar.png`, `baseline-top-ar.png`, `scenario-after-ar.png`, plus current M7 evidence reviewed in the preceding acceptance pass. These are saved evidence, not fresh M8 browser journeys.
- No Neon connection or secret-file contents inspected. Git tracked-file query for `.env*`, key material and `.local/*` returned only `.env.example`. This is not a complete historical secret scan.
- Current official hosting/dependency sources checked below. Account eligibility, actual quota and production topology were not asserted from marketing pages.

## 3. Blockers and high-priority findings

Severity meanings: BLOCKER prevents the requested working public release; HIGH must be resolved before final release/submission; MEDIUM is bounded operational/usability debt; LOW is optional polish. “Unverified” denotes missing evidence, not a demonstrated application failure.

### F01 — Complete public-hosting path is not established

**BLOCKER — unverified deployment prerequisite, not a financial defect.**

Evidence: `Dockerfile:10` builds only API; `Dockerfile:19` copies that dist tree; `apps/api/src/app.ts:637` serves Angular only if `dist/web/browser/index.html` exists. `docs/WEEK3-DEPLOYMENT.md:5` still describes an obsolete Railway plan. The separate Week 3 UI review is not the complete application.

Impact: deploying the present Docker image does not provide the full SaaS frontend. A static review URL does not prove authentication, imports, Python, AI or persistence work publicly.

Minimum fix: choose and approve one complete release topology, then package its required assets. Lowest architectural change is one HTTPS origin serving Angular plus API, with existing Python subprocess and external Neon. If separate frontend hosting is chosen, explicitly provide and test routing to the existing backend; do not silently assume it works. No need to rebuild the financial application.

### F02 — Split-origin frontend/backend is not configured

**HIGH — confirmed compatibility gap conditional on choosing separate origins.**

Evidence: relative `/api/v1` requests in `apps/web/src/main.ts` and workbench API helpers; exact-origin CSRF in `apps/api/src/app.ts:170`; secure production host-only cookie with `sameSite: 'lax'` at line 152; no cross-origin CORS middleware. Angular dev proxy is not a production proxy.

Impact: a Cloudflare Pages frontend cannot simply be pointed at an unrelated backend URL and expected to authenticate. This absence is correct for the current same-origin design, not itself a vulnerability.

Minimum fix: preserve same-origin browser requests with an explicitly approved hosting/proxy topology, or separately design and test credentialed cross-origin behavior if truly necessary. Do not weaken CSRF/CSP or broadly allow origins. Verify HTTPS, actual proxy hop count, cookies, logout, direct routes and API errors on the final topology.

### F03 — Dependency security gate currently fails

**HIGH — confirmed vulnerable-version/advisory finding; current remote exploitability not demonstrated.**

Evidence: `package.json` pins `@angular/router` 21.2.23; `package-lock.json` retains it. Current `npm audit --omit=dev --json` reports GHSA-ff3f-86qr-9cv3, affected 21.x versions before 21.2.24. `.github/workflows/ci.yml` enforces `npm audit --omit=dev --audit-level=high`, so this gate fails even though 611 tests pass.

The [Angular advisory](https://github.com/angular/angular/security/advisories/GHSA-ff3f-86qr-9cv3) concerns SSR denial of service through numeric URL matrix parameters. `angular.json` builds a browser SPA without an SSR entry point. Therefore do not describe this as a demonstrated remote DoS in the current Express/static deployment.

Minimum fix: select a supported patched Angular Router version compatible with the installed Angular packages; update the lockfile deliberately; rerun routing/unsaved-state tests, typechecks/build and production audit. No automatic broad dependency upgrade.

### F04 — Main documentation contradicts the accepted release

**HIGH — confirmed submission and operating-documentation defect.**

Evidence: `README.md:3` says no AI/LLM is implemented and M7–M9 have not started; README scope section repeats it. `docs/SECURITY.md:25` says AI is not implemented. `docs/WEEK3-DEPLOYMENT.md:5–7` describes Railway and excludes M7. In contrast, `docs/M7-FINAL-ACCEPTANCE.md` and the controlling section of `docs/M7-EXECUTION-CONTRACT.md` correctly describe revised acceptance.

Impact: examiners are told the AI contribution is absent; operators can miss Groq consent/privacy requirements or use an obsolete deployment plan. Historical reports should remain historical, but README/security/release instructions must identify the current source of truth.

Minimum fix: update only current entry-point documents, link the controlling scope and acceptance evidence, and clearly label Week 3 as a separate historical frontend review. Preserve failed extraction results. Explicitly describe selected evidence assistance, manual Guided Input, optional forecasting, ZDR/account configuration responsibility, and current release limitations.

### F05 — Reproducible release checkpoint is not yet established

**HIGH — confirmed local source-control state; remote omission is unverified.**

Evidence: `git status --short` includes untracked `packages/ai/`, `apps/api/src/ai-*.ts`, `migrations/009_ai_assistance.sql`, M7 tests and `docs/`, plus modified implementation files. Local tests include these files, but a clean checkout of the existing tracked state need not.

Impact: a Git-based deployment or examiner clone may omit accepted M7. This does not prove that a remote repository is broken; the remote release content was not inspected.

Minimum fix: review the exact intended release file set, run a secret/artifact review, create a named release checkpoint, then verify a clean checkout. Never indiscriminately add all output/local files. Include required migration/source/tests; exclude keys, local databases and unnecessary evidence dumps. No commit/reset performed by this audit.

### F06 — Final connected demo and device evidence has gaps

**HIGH — verification gap, not a confirmed workflow defect.**

Evidence: `docs/DENSITY-COMPOSITION-REPORT.md` explicitly says populated import/forecast states were not recreated; representative mobile coverage was forecasting only. `docs/M7-GUIDED-20261010.md` proves guided hiring/preservation, not every decision family. M7 final evidence adds risk mobile/history coverage, not a complete all-page/tablet journey. `tests/ai-guided-entry.test.ts` verifies choice/preservation policy rather than all editor completion flows.

Impact: the examiner may encounter a data prerequisite or mobile interaction that has not been rehearsed despite domain tests passing.

Minimum fix: one controlled synthetic company journey: import/review/version/baseline, all four guided decision families plus combined, comparison/risk/brief, optional eligible forecast/hybrid branch, and missing-history manual branch. Check Owner end-to-end, role boundaries with Manager/Analyst, EN/AR, desktop/tablet/mobile, keyboard/unsaved changes and direct URLs. Reuse saved records and existing fixtures; do not reconstruct completed implementation or replay every permutation unnecessarily.

## 4. Medium/low findings and bounded limitations

| ID / severity / confidence | Exact evidence | Impact | Minimum action |
| --- | --- | --- | --- |
| F07 MEDIUM, confirmed | `apps/api/src/app.ts:180` returns static health `{status:'ok', milestone:1}`; DB probe occurs only in `server.ts` startup | Healthy process can be mistaken for usable DB-backed app; stale milestone misleads monitoring | Separate liveness from bounded readiness or document health semantics and add DB/Python startup checks; no secrets in responses. |
| F08 MEDIUM, confirmed configuration, accumulation not measured | `app.ts:87` sets `pruneSessionInterval:false`; no session cleanup job identified | Expired sessions can accumulate in limited database storage; this is not proof expired sessions remain authenticated | Add bounded cleanup responsibility and verify expiration behavior before long-lived hosting. |
| F09 MEDIUM, unverified operating risk | `db.ts` TLS behavior comes from connection URL; migration/runtime roles separate; `scripts/migrate.ts` creates/provisions roles; actual Neon was not accessed | Wrong production role/TLS/migration state can prevent startup or undermine isolation | Read-only preflight later with approved access: role ownership/BYPASSRLS, verified TLS, migration ledger, backup/restore plan. Never run test suite against Neon. |
| F10 MEDIUM, confirmed design limit | `app.ts` in-memory rate limit; `forecast-runtime.ts` process-local two-worker cap; `ai-service.ts` process-local admission | Multiple replicas bypass intended aggregate limits; small free container memory is unproven | Start with one instance and measure realistic import/forecast/AI memory and latency before choosing resource limits. Do not lower existing import limits to fit a host. |
| F11 MEDIUM, confirmed path / occurrence unverified | `ai-routes.ts` artifact listing calls `readAiArtifact` for every row; `ai-service.ts` revalidates legacy output | One unsafe legacy artifact can fail the whole list, hiding otherwise valid history; no data deletion | Add a focused mixed-valid/invalid history test, then isolate unavailable item presentation if reproduced. Preserve strict validation and all records. |
| F12 MEDIUM, known accepted limitation | `ai-context.ts` sends risk-check statuses; `claimWire` caps six selected claims; `ai-service.ts` verifies source membership; selection priority is prompted | Safe selected interpretation is not exhaustive risk coverage; selecting benign checks does not prove absence of other breaches | Keep explicit selected-evidence limits and complete deterministic risk table visible. Add a mixed breached/met/unavailable relevance case to later quality regression; no need for a new provider. |
| F13 MEDIUM, confirmed scope limit | `app.ts` registration/login; `docs/SECURITY.md` states no recovery/email verification; invite delivery manual | Lost password can block a reviewer; public commercial onboarding has limited account assurance | Document controlled synthetic instructor onboarding/support. Add recovery only if required for public self-service, not as automatic graduation scope expansion. |
| F14 MEDIUM, observed usability / incomplete coverage | `ai-assistance.html` source JSON, `decisions.html` typed inputs, `i18n.ts` fallback to original text; retained screenshots | Long IDs/technical English labels and many fields burden nonfinancial users; translated UI is not fully translated source data | Keep evidence disclosure, teach one guided example, verify essential missing-input/error translations. Do not translate stored values or remove lineage. |
| F15 LOW, evidence gap | `docs/ADRS.md` is useful but historical; no Mermaid diagrams found in reviewed docs; no current unified examiner pack identified | Architecture is harder to defend quickly | Prepare one current architecture/data-lineage diagram and concise demo/limitations sheet, without rewriting code. |

No speculative billing, notification center, generic role changes, inventory accounting or universal-industry features are required.

## 5. Product and SaaS assessment

### Screen/flow coverage

`apps/web/src/navigation.ts` defines overview, planning, imports, forecasts, decisions, stress, briefs, members, settings, account and setup. Root/auth/workspace routing is implemented by `navigation.ts`, `main.ts` and `app.html`; account/team/settings are real views in the shell, not missing merely because they lack standalone files.

| Area | Assessment and evidence |
| --- | --- |
| Sign in/up, restoration/logout | Implemented session journeys (`main.ts`, `app.html`, `app.ts`), meaningful error codes and CSRF. Recovery is a disclosed scope limit. |
| Workspace/company setup | Existing selection/creation/private demo, currency, resumable setup and record counters. Company and demo data are not conflated. |
| Account, Team & Access, settings | Existing account presentation, Owner membership/invitation/ownership controls and workspace rename/archive. Preserve Owner/Manager/Analyst model. |
| Executive Overview | Existing dark structural sidebar, primary ending-cash KPI, trajectory, liquidity, recent decisions/activity. Useful decision context; no reason to redesign. Saved screenshot inspected, not current remote UI. |
| Baseline/imports | Reviewed data, explicit assumptions/timing and immutable version handoff; imports are not automatic bookkeeping. Long technical editor needs a rehearsed path. |
| Forecasting | Eligibility and history requirements visible; optional, not a blocker to manual planning. Populated final-screen journey still needs focused coverage. |
| Decisions/comparisons | Explicit guided family choice plus reviewed manual editor, saved results and pinned baseline comparisons. Missing inputs remain missing; not free-text AI. |
| Risk/brief | Actual policy findings, scenario/stress context, saved evidence and print. Risk is threshold comparison, not probability or investment advice. |

Navigation preserves record-aware URLs. `NavigationState` guards pending/dirty work, restores focus and handles dialog Tab/Escape. Loading/error/status patterns and native disclosure controls exist across workbenches. `i18n.ts` sets document lang/dir; CSS includes reduced-motion and responsive rules. These are positive code findings, not complete assistive-technology or tablet certification.

## 6. Financial correctness review

No confirmed financial formula defect identified in this audit. Do not treat that as an independent professional accounting certification.

- **Money/currency/rounding:** `packages/contracts/src/index.ts` uses Decimal precision 48 and named minor-unit half-up policy; mixed currency is rejected. Supported EGP/SAR/USD/AED does not imply FX conversion or consolidation.
- **Baseline:** `packages/planning/src/engine.ts` separates accounting effect, cash timing, obligations and capability readiness. Missing inputs are not automatically zero. Evidence and capability errors retain source/entry context.
- **Decisions:** `packages/scenarios/src/engine.ts` transforms explicit changes and delegates calculation back to `calculateBaseline`. Sales, payroll/headcount, expenses, simplified expansion and combined cases use validated changes; dependencies/order are explicit. Expansion is not inventory/manufacturing accounting.
- **Comparisons:** stored scenario-minus-baseline metrics, common currency/horizon/source requirements, zero-change equality and no mutation tested in `scenario-engine.test.ts` and `stress.test.ts`.
- **Forecasting:** `forecasting/src/engine.ts`, `runtime/worker.py`, `forecast.test.ts` cover temporal folds, minimum history, unsupported evidence, finite zero-series errors, deterministic execution and hybrid replacement restrictions. Point forecasts are not prediction intervals or guarantees. Manual schedules remain valid without forecasting.
- **Risk:** `stress/src/engine.ts` uses Money comparisons against explicit policy thresholds; statuses include unavailable, not invented risk scores. Rule version, policy and run evidence are retained. No thresholds changed in M7.
- **Imports:** parser bounds archives/rows/cells and rejects unsafe content; reviewed normalization handles totals/duplicates/ambiguous terminology. `import-service.ts` and forecast lineage services retain original/version/approval linkage. Mapping suggestions are deterministic and require review.
- **Brief/PDF:** immutable brief source/policy/option evidence; last accepted actual EN/AR PDFs four pages each, all eight visually inspected. M7 annotations are on-screen and excluded from deterministic print. No fresh M8 PDF claim.
- **Traceability:** imported file → reviewed mapping/dataset → confirmed planning version → baseline run → reviewed scenario version/run → comparison/policy/stress → brief, with optional approved forecast/hybrid branch. IDs and actor/workspace permissions remain distinct.

611-test evidence includes independent golden/invariant expectations and real constrained Python/PostgreSQL execution. It does not cover every real-company mapping, every timing combination, tax/compliance, multi-currency accounting or arbitrary industries. Those are not implied deliverables.

## 7. Revised AI and security review

Accepted M7 evidence is preserved in `docs/M7-FINAL-ACCEPTANCE.md`:

- Actual LLM inference selects permitted evidence; deterministic code validates and renders claims. Assumptions are reviewed, not invented.
- Saved scenario results 48,000 and 80,000 EGP differ against baseline 64,000 with stored differences -16,000/+16,000; no LLM arithmetic.
- Fresh extraction/continuation is HTTP410 on requests/context, and direct service calls are guarded. Capabilities exclude extraction. UI history-only controls hide generation. Explicit reviewed application of a historical proposal remains distinct from new inference.
- AI unavailable preserves manual paths; last actual replay returned matches=true with zero AI requests.
- Risk EN/AR actual live success is bounded two-case evidence, not a general reliability percentage.
- Privacy: consent and outgoing-context preview; provider key server-side; bounded selected evidence rather than raw uploads; logs redacted. ZDR/account policy was configured earlier but not independently rechecked in this M8 audit. Do not claim an audit of provider retention guarantees.

Security implementation positives: scrypt password hashing; timing-safe checks; PostgreSQL-backed HttpOnly/Secure production sessions; exact-origin CSRF; strict Zod validation; separate runtime/migration roles; startup rejects superuser/BYPASSRLS/workspace-owner roles; transaction-local RLS context; default-deny permissions; immutable/audited business state; bounded parser and subprocess behavior. `worker.py` uses standard-library isolation and resource bounds; credentials are not forwarded to subprocess environment.

No confirmed tenant escape, unauthorized financial action or key exposure identified. No penetration test, complete Git-history secret scan, production TLS check, backup restore drill or DoS load test was performed. Startup security and tests must not be presented as proof of those unexecuted checks.

## 8. Deployment readiness and current free-hosting constraints

**Verdict: not ready to deploy the complete project yet.** Core architecture is deployable with a normal Node/Python process and PostgreSQL, but actual account eligibility and resources are unresolved.

| Requirement | Existing contract / required verification |
| --- | --- |
| Build | `npm ci`; `npm run build` builds API and Angular. Angular output `dist/web/browser`. Current Docker runs only `build:api`; reconcile F01. |
| Start | From release root: `node dist/apps/api/src/server.js`; include Python worker path and production dependencies. Never use ng serve or synthetic acceptance server publicly. |
| Migration | `node dist/scripts/migrate.js` with separate admin-only `MIGRATION_DATABASE_URL`; check ledger and backup first. Do not give migration/test credentials to API. |
| Runtime | NODE_ENV=production, exact HTTPS APP_ORIGIN, secret runtime DATABASE_URL, random SESSION_SECRET, correct PORT/TRUST_PROXY_HOPS, trusted FORECAST_PYTHON. Optional AI_ENABLED/GROQ_API_KEY stay server-only. |
| Database | Existing Neon retained; role/TLS/migration status/connection limits/backups require later authorized preflight. No reset or reprovision proposed. |
| Storage | Imports/history stored in PostgreSQL; temporary runtime filesystem need not be durable business storage. Database quota still matters. |
| Monitoring | Structured safe logs/request IDs and persisted attempts exist. Health is liveness-only; alerting, memory/cold-start measurements and restore evidence remain. |

Official-source check on this audit date:

- [Render Free documentation](https://render.com/docs/free) describes sleeping free web services and usage limits. Prior user experience required a card; public docs do not override that account-specific restriction. Do not retry billing or treat Render as currently approved.
- [Back4app Containers pricing](https://www.back4app.com/pricing/container-as-a-service) advertises a no-card free container with 256 MB. This provider was explicitly excluded earlier. Its advertised limit is not proof Node plus up to two Python subprocesses fits; no return to this deployment without user direction.
- [Neon plans](https://neon.com/docs/introduction/plans) documents free quotas and scale-to-zero after inactivity. Database availability does not solve backend process hosting. Verify the existing account's actual allowance before release; do not upgrade.
- [Cloudflare Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/) distinguishes static assets from Functions. [Workers Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) includes partial/stub APIs; availability of a Node import is not proof the existing `spawn(python, ...)` worker can run unchanged. Cloudflare Pages alone is not a verified complete backend host for this architecture.

No safe, complete, account-verified free/no-card public hosting solution is established by this audit. Prefer resolving that operational prerequisite over re-architecting the project to fit a static/edge provider. Keep a tested local synthetic demo as a presentation contingency, not a substitute for a required public URL.

## 9. Graduation demo and examiner readiness

### Recommended 10–15 minute journey

1. Explain the problem: a company can have sales yet face cash shortages; test a decision before execution. Explain this is planning, not bookkeeping or a financial adviser.
2. Sign in as Owner; show company context, role, language switch and the difference between company and private synthetic demo.
3. Use a small synthetic import with known provenance; show one ambiguous mapping, explicit review and confirmed planning version.
4. Publish/calculate baseline; distinguish operating result from cash and show timing/source evidence.
5. Guided hiring plus a sales/expense alternative; review missing inputs, confirm, calculate, compare pinned results. Have expansion and combined saved examples ready.
6. Explain forecasting as an optional branch: show sufficient-history evaluation/approved hybrid, then short-history manual fallback. Do not wait for unsupported history to become eligible.
7. Show saved risk thresholds and one breach plus one unavailable result; distinguish deterministic finding from bounded AI interpretation.
8. Demonstrate saved-result/assumption AI assistance and source refs; show manual continuity if provider unavailable. Explicitly disclose extraction retirement.
9. Generate/reopen Decision Brief, show EN/AR print, source IDs and limitations.
10. Finish with Manager/Analyst role differences and an attempted foreign-workspace access rejected without exposing data.

### Questions to prepare

- Why is profit different from available cash? Where do receipt/payment delays enter the engine?
- Why is an unknown amount not zero? How do you handle incomplete import mapping?
- Which SME differences are supported, and which accounting details are excluded?
- How are baseline/scenario versions immutable and comparisons reproducible?
- Why is forecasting optional; how do you prevent temporal leakage and schedule replacement?
- What does AI actually do, why was extraction rejected, and how do you prevent invented claims?
- Does “met” mean safe? Is a threshold finding a probability? Which evidence supports each claim?
- How do role checks differ from tenant RLS? What happens after membership revocation?
- What happens on provider outage, server restart, database sleep or incomplete job execution?
- Can another machine reproduce the release, and which checks were live versus retained evidence?

The project has sufficient technical complexity: deterministic modeling, provenance/versioning, constrained statistical processing, multitenancy/security, reviewed imports, risk policies, bilingual UI and bounded LLM integration. Extra features will not compensate for misleading documentation or an unreproducible demo.

## 10. Minimum delivery-critical action order

1. Patch the narrow Router dependency advisory and revalidate the affected checks/security gate.
2. Correct README/security/release index to match accepted M7; prepare the current architecture/demo sheet.
3. Close F06's focused connected journey/device coverage and record any actual defect before changing UI.
4. Establish a reviewed, secret-free, reproducible release checkpoint and verify a clean checkout.
5. Resolve hosting/topology within user cost/card restrictions; build and test the complete release image locally before any public action.
6. Perform authorized production preflight (Neon role/TLS/migrations/backups, HTTPS/proxy/session behavior, Python runtime, memory/startup/health) and only then seek deployment approval.

No financial-engine rewrite, scope expansion, new extraction experiment or redesign is required by the findings. M8 stops at this report; all proposed fixes await review.

## Final result

**M8_FIXES_REQUIRED** — a credible graduation product with accepted revised M7, but not yet a verified complete public release. Confirmed release/documentation/dependency issues and explicit verification gaps must be closed first.

