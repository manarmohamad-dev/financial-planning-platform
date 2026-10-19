# M8 fix closure and remaining acceptance gates

Current: 2026-10-16. **M8_READY_FOR_M9**. See section 9 for the final bounded closure and remaining external M9 prerequisites. Sections 1–8 preserve the 2026-10-15 checkpoint.

M7_ACCEPTED_REVISED_SCOPE remains unchanged. This report closes the verified security/documentation defects and records additional actual local integration evidence. It does **not** declare every requested journey/device/error combination verified or authorize deployment.

## 1. Exact changes

| File/area | Change |
|---|---|
| `package.json` | Pin Angular common/compiler/core/forms/platform-browser/router/compiler-cli to 21.2.24. Pin build to 21.2.25 and CLI to 21.2.26 for subsequently identified build-tool security patches. Remain on Angular 21.2; no application migration. |
| `package-lock.json` | Resolve those compatible patches and patched transitive development dependencies, including piscina, MCP SDK, http-cache-semantics and source-map-js. No force/legacy-peer-deps or disabled certificate verification. |
| `README.md` | Replace obsolete “AI unimplemented” statements with accepted revised M7 scope, actual financial/AI boundaries and current release status. |
| `docs/SECURITY.md` | Document server-side extraction retirement, historical authorization, grounded assistance, manual fallback, server-side secrets and privacy boundary. |
| `docs/WEEK3-DEPLOYMENT.md` | Mark former Railway selection and former M7 exclusion as historical/superseded; retain history. |
| `docs/M8-COMPREHENSIVE-AUDIT.md` | Add closure status and link to this report; preserve original findings. |
| `docs/evidence/m8/` | Sanitized synthetic local verification results, build/audit logs and actual EN/AR PDFs. |
| `.local/m8-*` | Ignored local-only acceptance harnesses, temporary dependency installation/source copy and disposable PostgreSQL test environment. No production integration. |

Previously untracked M7 source, tests, migration 009 and documentation were added to the Git index after a source-pattern scan. Their implementation was not rewritten. There was no commit, push, reset, cleanup of user work or deployment. Existing M7 changes remain preserved.

No financial formulas, Financial Engine, provider/model, business API contracts, permissions, production configuration, Neon data or Neon migrations were changed. No new AI extraction or paid/provider generation calls were made by these acceptance harnesses. Local tests migrated disposable loopback PostgreSQL only.

## 2. Angular security conclusion — F03 closed

The installed Router was **21.2.23**. [GHSA-ff3f-86qr-9cv3](https://github.com/angular/angular/security/advisories/GHSA-ff3f-86qr-9cv3) affects Angular 21 versions below **21.2.24**. The advisory concerns Node/V8 SSR parsing of numeric matrix parameters; it explicitly excludes pure browser SPAs.

`angular.json` builds a browser application. `apps/api/src/app.ts` serves static browser assets and the SPA entry point; it does not invoke Angular SSR. There is no Angular server-rendering target or SSR request parser. Therefore the published remote SSR attack path is **not applicable to this architecture**. The compatible patch was nevertheless applied to remove the affected dependency/security-gate failure.

Exact peer requirements required updating the seven corresponding framework/compiler packages together. Initial npm resolution failed against old lock entries; targeted regeneration of those entries in an isolated directory resolved the conflict without bypassing dependency checks.

The subsequent full audit also reported development-tool issues. Compatible patch-only updates to Angular build/CLI and the affected transitive dependencies resolved them. These were build-tool risks, not evidence of an exploitable financial API defect. Final `npm audit` and `npm audit --omit=dev` both report **0 vulnerabilities**, recorded in `evidence/m8/audit-all.json` and `audit-prod.json`. This is a dated dependency scan, not a security certification.

## 3. Documentation — F04 closed

Current entry-point documentation now distinguishes:

- **Financial Engine:** sole authority for deterministic financial calculations.
- **Statistical forecasting:** bounded Python model evaluation, optional to planning; not an LLM.
- **Guided Input:** explicit manual scenario inputs and review, not AI extraction.
- **AI assistance:** review existing assumptions, explain saved evidence, interpret actual risk findings, support briefs; never invent missing amounts or autonomously confirm decisions.
- **Free-text extraction:** rejected during acceptance, disabled at UI/API/service boundaries; historical records remain authorized and readable.

Older experiment reports retain their historical results and are not current capability promises. The reviewed security documentation does not claim email verification, recovery, distributed rate limiting or production operations have been implemented.

## 4. Actual local E2E evidence — F06 substantially reduced, not fully closed

Environment: actual production Angular assets served by Express; real disposable PostgreSQL/RLS; synthetic company/Owner accounts. The original acceptance server was on loopback 4332. A separate current-source environment on 4334 used PostgreSQL 55456 and an explicit trusted `FORECAST_PYTHON` path. Neither uses Neon. No API interception or mocked browser responses were used.

| Journey | Verified in this pass | Errors/fallback and limitations |
|---|---|---|
| A. Authentication/workspace | Actual UI sign-in, session restoration across direct workspace routes, authorized company context. | Registration, revocation, foreign-tenant denial and role policy are covered by the passing API suite and retained M7 evidence. Not every auth error was replayed at every viewport. |
| B. CSV/XLSX import | CSV upload → structural preview → explicit financial mapping → validation → immutable mapping/dataset confirmation. Two XLSX datasets for 2024/2025 were confirmed through the same UI. Reopened dataset source/row lineage and replay returned HTTP 200 and “Normalization replay matched the immutable dataset and row lineage.” | A 24-month file against a supported 12-month planning horizon was correctly blocked by COVERAGE_RANGE/OUTSIDE_HORIZON; separate non-overlapping annual datasets succeeded. This was invalid test setup, not a parser defect. Full mutation journey was performed in English desktop; AR/device page presentation is separate evidence. |
| C. Forecasting | Selected both confirmed annual datasets; 24 actual monthly observations against 21 required; three-month origin January 2026. Eligibility → Python run → persisted artifact → reopened result and model/lineage evidence. Selected model **holt**. Actual forecast artifact `57292764-ba8a-45ff-b888-e163a53507e7`, job `b81f1f25-5339-43eb-999b-f35ef50c108d`. EN/AR populated views and tablet/mobile populated views exercised. | Old preview process returned FORECAST_PROCESS_FAILED and retained manual planning. Separate environment with explicit Python executable succeeded. Initial browser assertion targeted a hidden detail element; opening the saved result resolved the harness issue without recalculation. Forecast approval/hybrid composition has API regression coverage, not a newly completed UI mutation journey here. |
| D. Guided Input | Sales, Hiring, Spending and Expansion each selected through Guided Input; explicit values entered, readiness reviewed, immutable version confirmed and scenario calculated through real API. All four displayed “Calculated result”; **0 AI generation requests**. | Synthetic examples: sales +10%; hiring 2 × EGP 1,000 monthly plus EGP 200 onboarding; spending EGP 1,000 monthly; expansion EGP 1,000 investment, costs reviewed and revenue explicitly unknown. Scenario minimum cash respectively 28,000 / 25,800 / 27,000 / 27,000 EGP, displayed from engine results. EN desktop mutations verified; complete AR mutation/device/error permutations remain unverified. |
| E. Comparison/risk | Actual saved scenario and risk-comparison records reopened through connected UI in EN/AR and three viewport sizes. Baseline EGP 64,000 ending cash; saved sales scenario and zero-change stress both EGP 48,000, preserved in brief evidence. | Creating a new A/B/C comparison and executing a new stress batch through the UI in this pass are not established by reopening saved results. Their write paths and invariants passed API/domain regression. |
| F. AI review/explanation | Retained accepted M7 real saved inference evidence, including two differing scenarios, authorized history, risk finding references and provider-disabled fallback. Current patched browser loads actual AI-bearing result/risk pages without generating new inference. | This pass did not repeat provider generation or every historical artifact/task/role interaction. Prior M7 generation evidence must not be relabeled as new M8 inference. Extraction shutdown/authorized historical reads/fallback were rerun in the 611-test suite. |
| G. Decision Brief/PDF | Actual saved brief opened in both languages and exported using Chromium print rendering. All **8 pages** visually inspected (4 EN + 4 AR). Source IDs, evidence, amounts, assumptions and limitations present; no observed clipping, overlap, stray app heading or near-empty page. | A table continues onto page 4 with repeated header; this is legitimate pagination. Stored synthetic English titles/notes remain English in AR, intentionally preserving source values. This is one representative populated brief, not every possible input length. |

Recorded harness selector failures were corrected locally: option text made some labels ambiguous; one forecast state was inside a closed disclosure. These are not application failures. No production UI changes were made to satisfy automation.

### Devices and language

- Desktop **1440×1000**: seven financial routes × EN/AR = **14** authenticated route/presentation checks.
- Tablet **768×1024**: seven routes × EN/AR = **14** authenticated checks.
- Mobile **390×844**: seven routes × EN/AR = **14** authenticated checks.
- Additional populated forecast checks: tablet/mobile × EN/AR = **4**.
- Correct document `ltr`/`rtl`, correct page headings, no document-level horizontal overflow, and no recorded page-script exception in the accepted device matrix. Internal scrollable data tables are not asserted to fit all columns simultaneously.
- Representative screenshots were visually reviewed, including tablet Arabic scenario, tablet English forecast, mobile Arabic risk and desktop overview; not every screenshot received an independent manual pixel review.

The first overly rapid route sweep reached the sign-in surface partway through. Those subsequent rows were **not counted** as page successes. A paced run with explicit authenticated-state assertions completed all tablet/mobile checks without modifying rate limits. The initial failure is consistent with the 200-request/minute limiter and transient bootstrap handling; no HTTP capture from that initial sweep proves the exact cause, so it is not presented as a confirmed rate-limit defect.

These results do not prove completion of every mutation/error/fallback journey in both languages on every device. That remaining acceptance requirement is why this report does not declare full M8 closure.

## 5. Reproducible installation/build and Git

Final verification used a **fresh npm ci** in `.local/m8-lock`, with an explicit source-file manifest, no local environment/key files or production database connection. The clean dependency installation then ran the full repository `npm run check` against disposable local PostgreSQL.

| Check | Final result |
|---|---|
| Clean npm ci, final lockfile | Passed; 636 packages installed, 637 audited; 0 known vulnerabilities |
| ESLint | Passed |
| TypeScript and Angular template typechecks | Passed |
| Vitest | **611 passed, 0 failed; 18 files passed** |
| API production build | Passed |
| Angular production build | Passed; initial output 685.68 kB raw / 136.64 kB estimated transfer |
| Full and production-only dependency audits | Both 0 vulnerabilities |
| Final build vs browser-reviewed assets | 11 root browser output files compared; no changed file content |
| Required application/test/migration source tracking | No remaining untracked files under apps/packages/migrations/scripts/tests after explicit staging |
| Whitespace diff check | Unstaged diff passed. Staged check reports trailing blank lines in preserved M6/M7 reports and the verbatim check log; no implementation whitespace error was reported. Historical evidence was not rewritten to hide these warnings. |

Evidence: `evidence/m8/final-clean-ci.log`, `final-clean-check.log`, dependency audit JSON and build comparison JSON. Node 24.19.0 was explicitly used for the verification launcher; the machine's default Node 26 is outside the repository's `>=24 <25` requirement and must not be used for release setup. Python executable was explicitly configured for the successful browser forecast environment. The test runner inherited the trusted Python runtime path.

The working tree is **documented dirty**, not clean: legitimate prior M7 changes, new staged M7 files/documentation, and this security/docs patch remain uncommitted. No user work was discarded. The initial in-place npm ci met Windows locks held by the existing preview PostgreSQL process; dependencies were restored with npm install and clean-install proof was obtained in a separate directory without deleting its live database. Final clean source-copy validation is not a claim that the old Git HEAD already includes the release.

Source scan: 199 selected source/config/documentation files, zero matches for real-format Groq/Google/OpenRouter keys or private-key blocks. `git ls-files` for `.env*`, private-key patterns and `.local/*` returns only the placeholder `.env.example`. No key was printed. This is a bounded scan, **not a forensic audit of every historical Git object**. Before sharing, create a reviewed release commit containing the staged sources and the final dependency/docs diff; no push was performed or authorized here.

## 6. Remaining blockers and minimum completion

1. **Acceptance coverage gate (HIGH, unverified rather than a confirmed functional defect):** finish the remaining UI mutation/error/fallback matrix explicitly requested by the user—especially new comparison/stress creation and AR Guided Input/import confirmation, with tablet/mobile interaction rather than route opening alone. Reuse the existing local fixtures/results; do not repeat successful engine tests or provider experiments.
2. **Complete release packaging/topology (original F01/F02):** current Docker packaging remains backend-only; a complete same-origin application release image and trusted reverse-proxy/session configuration have not been built/run under production settings. This is a real readiness gap, not a reason to weaken CSRF/cookies or publish a frontend-only app. Minimum work is package the existing Angular output with the existing Express service, or prove an equivalent same-origin host topology, then smoke-test the actual image.
3. **Host/operations prerequisite:** no account-verified free/no-card host for the complete Node + Python workload has been established. This was not resolved by local tests. Do not revive excluded providers, add billing, or claim a public URL.

There is still **no confirmed financial formula defect**. The new work did not expose a reason to change Financial Engine, thresholds, roles, RLS or the accepted M7 scope. Audit medium/low items remain as classified in the original report; they were not silently implemented.

## 7. M9 prerequisites (not performed)

- Close the remaining acceptance gate above and freeze a reviewed source/lockfile commit; recheck secrets on that release commit.
- Select and authorize a complete host with sufficient Node/Python memory, runtime/process support and an explicit no-card/free arrangement if that remains required.
- Verify full image startup, static SPA/deep routes, Python forecast, health/readiness, logs and graceful failure; never deploy the development launcher.
- Preserve same-origin `/api/v1`, exact-origin CSRF and secure session cookies. Verify HTTPS, trusted proxy and APP_ORIGIN against the actual public URL.
- Separately authorize/check existing Neon runtime role (nonowner/non-super/non-BYPASSRLS), TLS, migration state, backups/restore and secret provisioning. None was changed or asserted verified here.
- Validate production capacity/cold starts, session persistence, rate limits and AI-unavailable manual continuity before instructor handoff.

## 8. Resume point

Do not redo the dependency patch, documentation correction, 611-test run, clean install, successful import/forecast/Guided Input calculations, or eight-page PDF inspection unless affected by a new change. The remaining work starts with the explicit coverage gate in section 6, followed by complete production packaging/preflight under approved scope. The current local M8 environment state is `.local/m8-browser-state.json`; earlier saved AI/PDF fixtures remain in `.local/m7-quality-browser.json`. Never interpret these loopback URLs as deployed services.

**Final: M8_STILL_BLOCKED — security and documentation fixed, core local integration and clean builds verified, but the requested full acceptance coverage and complete deployment packaging/hosting proof are not yet closed. No deployment performed.**

## 9. Final bounded closure — 2026-10-16

**Current verdict: M8_READY_FOR_M9.** This section supersedes the historical remaining gates/verdict in sections 6–8 above. The user explicitly bounded this pass to local acceptance and a deployment handoff, allowing the existing backend-only Dockerfile to remain with frontend hosting requirements documented. No public host or production deployment is claimed.

### Minimal confirmed fixes in this pass

- `apps/web/src/i18n.ts` and `locales/ar.ts`: translate the malformed import error wrapper while preserving the technical parse code and bidi isolation; translate the actual rate-limit message. Neither parser nor validation changed.
- `apps/web/src/imports.html` and `locales/ar.ts`: replace the incorrect plural/seconds rendering of import issue headings with explicit severity headings, translate readiness/evidence status and supported capability names/reasons, and translate the observed overlap/monthly-resolution notices. Stored source data and identifiers remain unchanged.
- `apps/web/src/product-system.css`: one scoped `grid-template-columns: minmax(0, 1fr)` declaration on `.density-import-detail`. A populated mapping editor previously widened a 390px page to 992px through the implicit grid's content minimum. The fixed page remains 390px; wide preview/mapping tables scroll inside their containers. No unrelated page or print style changed.
- `tests/ui-presentation.test.ts`: one new regression test for localized import rejection, preserved technical reason/English text, and the translated throttling message.
- This report, audit follow-up index, `M9-DEPLOYMENT-READINESS.md`, and sanitized evidence under `evidence/m8/final/`.

No Financial Engine, formulas, API contracts, risk thresholds, permissions, production provider, Neon connection/migration/data, or accepted M7 behavior was changed.

### Connected acceptance results

| Remaining journey | Actual result and evidence |
|---|---|
| Authentication/workspace | Real local Owner sign-in and authorized workspace access across six device/language combinations. Wrong-password HTTP 401 and visible error in EN/AR desktop. Compiled production session restores after reload. Existing role/tenant/history restrictions reran in the full API regression; this is not a claim of new manual testing of every role permutation. |
| Guided validation/draft | Six combinations: negative employee count rejected, switching the Guided selector does not overwrite the edited form, keyboard Tab stays in the leave-confirmation dialog, Escape keeps editing and preserves the decision name, explicit discard navigates. Tablet/mobile menu opens/closes with Escape. `journeys.json`. |
| Import error | Malformed XLSX rejected with `XLSX_INVALID`, no success fabricated. EN/AR and desktop/tablet/mobile exercised. The final mobile AR screenshot confirms translated error after the fix. Earlier rows retain their original pre-fix error text for provenance. |
| Import success/lineage | Prior accepted EN CSV/XLSX evidence retained. New AR mobile upload → preview → explicit financial mapping/coverage/opening cash → validation → immutable mapping HTTP 201 → warning acceptance → immutable dataset HTTP 201 passed. `xlsx-ar-result.json`, `xlsx-validation.txt`. Exact existing file/draft reopened for responsive checks. Original lineage/replay proof remains in section 4. |
| Forecast error/optional path | Six combinations explicitly select the unsuitable synthetic 3-month series: eligibility displays invalid-series/3 observations versus 21 required and does not offer model execution. Planning without a forecast remains available. Existing successful 24-observation forecast and populated EN/AR device evidence retained; no reason to rerun the worker model. |
| Guided financial decisions | All four families additionally entered, reviewed, confirmed and calculated through AR mobile UI. Sales minimum cash 28,000; Hiring 25,800; Spending 27,000; Expansion 27,000 EGP, matching retained EN fixture results. **0 AI generation requests**. `guided-ar-results.json`; original EN results remain in prior evidence. |
| New scenario comparison | EN tablet and AR mobile each select two actual saved runs and create a comparison through the API, HTTP 201. No provider used. `mutations.json`. |
| New stress workflow | EN tablet and AR mobile select an actual scenario, explicit existing policy, zero-stress template, review/confirm immutable definition, prepare/run a new batch, inspect result, and save a risk comparison (HTTP 201 at creation steps). Saved financial result: pinned baseline ending cash 64,000 EGP, source scenario 48,000, zero-stress 48,000; minimum cash 28,000. Three declared checks `met`; no universal safety claim. `risk-data-en.json`, `risk-data-ar.json`. |
| Saved AI risk explanation | Existing accepted EN/AR provider artifacts reopened with exact saved summary and source/evidence disclosure, authorized HTTP 200, zero new provider requests. Actual risk-check references retained. `history-matrix.json`. Accepted M7 assumption/result/brief inference evidence and permissions remain established; no new inference experiment. |
| AI unavailable | EN tablet and AR mobile on the provider-disabled local app show the translated manual-continuity message. Deterministic scenario replay HTTP 200 and `matches:true`; **0 AI requests**. `disabled.json`. |
| PDF controls | Saved brief print preview and enabled print control verified in all six combinations, correct RTL/LTR and no document overflow there. Previously visually inspected 4 EN + 4 AR PDF pages retained; print styles and brief content were untouched, so PDF generation was not repeated. |

### Responsive and visual evidence

Desktop 1440×1000, tablet 768×1024, mobile 390×844, each EN/LTR and AR/RTL:

- Six error/dialog/menu/print-control runs passed after correcting harness selectors and respecting the existing rate limiter.
- Six **populated import editor** checks after the scoped CSS fix passed: document width equals viewport, correct direction, keyboard moves to the next field; wide tables remain internally scrollable. `import-responsive.json` and six viewport screenshots.
- New comparison/risk screenshots have the expected 768px EN tablet and 390px AR mobile widths. All four AR Guided result screenshots are 390px wide.
- Representative screenshots visually inspected include final AR mobile import error, EN tablet forecast rejection, final AR mobile and EN tablet populated mapping, and AR saved AI risk evidence. Previous M8 route/screenshots/PDF inspection remains retained. Not every screenshot is claimed as an independent manual pixel review.
- Native file/date controls can follow the browser/OS language (e.g. the month selector) even when application text is Arabic. Technical codes, IDs and stored synthetic English source text remain intact. These are disclosed presentation limits, not fabricated translations.

The fast parallel harness exceeded the existing global request limit and visibly returned `Too many requests`; affected rows were not counted as successes. Sequential/paced reruns passed without changing the limiter. Other harness interruptions were selector/translation issues in test automation, not hidden application failures. This is representative acceptance, not every possible browser, input length, role/device Cartesian product or a formal WCAG certification.

### Complete application build/start proof

The actual compiled entrypoint `node dist/apps/api/src/server.js` ran with `NODE_ENV=production`, generated test-only secret, limited-role **disposable local PostgreSQL**, explicit Python path, and one-hop loopback HTTPS proxy. It served the real Angular production output from `dist/web/browser`.

`production-smoke.json` establishes: health HTTP 200, SPA direct route HTTP 200, actual sign-in, Secure/HttpOnly/SameSite=Lax host-only session cookie, authenticated reload, foreign-Origin mutation rejected with HTTP 403, deterministic scenario replay `matches:true`, visible AI-disabled fallback, and no page-script exceptions. It was repeated after the final web build. Temporary self-signed certificate handling was test-context-only; security policy was not weakened.

The existing backend-only Dockerfile was **not** rebuilt or expanded. Full-application non-Docker build/start is now proven locally; Docker frontend hosting and same-origin requirements are explicit in the M9 handoff. Linux image behavior, public TLS, free-host capacity/cold start and actual Neon connectivity remain external M9 preflight—not assertions made by local Windows acceptance.

### Final checks and source safety

| Check | Result |
|---|---|
| Full suite after translation/template fixes | **612 passed, 0 failed; 18 test files**, 24.69 seconds |
| TypeScript + Angular templates | Passed |
| ESLint | Passed |
| API production build | Passed |
| Angular production build | Passed; rebuilt after final scoped responsive CSS correction |
| Full dependency security audit | **0 known vulnerabilities**, unchanged dependency graph |
| Fresh install | Prior clean `npm ci` proof retained; package/lockfile unchanged in this bounded pass |
| New connected E2E | Six journey/error rows + six populated import responsive rows + AR import + four AR Guided calculations + two comparison/stress flows + two saved risk artifact reads + two disabled-provider/manual replay rows + compiled production smoke |
| Required application sources | No untracked files under apps/packages/migrations/scripts/tests |
| Secret-pattern scan | 233 tracked text files after final report/evidence staging; zero recognized provider-key/private-key patterns, no tracked `.local`, `.env`, `.pem` or `.key`; `.env.example` remains placeholders only |
| Git | Documented existing staged/unstaged work preserved; no commit, reset, push or deployment. Final reports/evidence explicitly staged. No clean-HEAD claim. |

Final evidence is in `evidence/m8/final/`. `check-final.log` is the full regression; `web-responsive-build.log` is the directly affected build after the final CSS-only fix. Older logs/screenshots remain historical and are not overwritten as if all were generated against the final CSS. Secrets and temporary TLS private keys are excluded from evidence.

### Remaining issues and M9 handoff

**No confirmed deployment-critical application defect remains from this bounded M8 pass.** There is still no verified public host, live Neon preflight, deployed memory/cold-start measurement, release commit or deployed-domain acceptance. These are explicit M9 external prerequisites, not completed work. Do not choose paid hosting or weaken application safety to close them.

See [M9-DEPLOYMENT-READINESS.md](M9-DEPLOYMENT-READINESS.md) for exact artifacts, commands, environment configuration, same-origin/CORS/HTTPS requirements, health-check limitations, free/no-card constraints and ordered external steps.

**Final: M8_READY_FOR_M9 — local acceptance closed; deployment has not started.**


