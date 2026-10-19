# Milestone 5 — Completion report

**Status: COMPLETE — Ready for Milestone 6. Milestone 6 was not started.**

Verified 22 September 2026 on Windows, Node 24.21.0, Python 3.12.14 and PostgreSQL 18. M1–M4 were preserved. Before M5 edits, the actual existing suite passed: **359 tests, zero failures**. The continuation resumed the existing implementation; no scaffold or architecture replacement was performed.

## What was implemented

- Reviewed historical series selection from confirmed planning versions, including M4-produced versions, with explicit horizon-specific eligibility and fallback reasons.
- Four small fixed candidates: naive, three-month moving average, Holt trend and conditional additive annual Holt-Winters.
- Three expanding temporal backtests, persisted actuals/predictions/fold boundaries, MAE/RMSE and deterministic benchmark-relative selection.
- A constrained local Python worker, persisted idempotent jobs, safe process errors, bounded retry, expired-attempt recovery and atomic result persistence.
- Immutable artifacts and explicit approval, followed by source-reviewed composition of a **new** hybrid baseline.
- Existing M2 calculations/replay and M3 scenarios using stored forecast values, without a second financial engine or Python refit during financial replay.
- Angular forecasting/evidence/approval/fallback/history/composition journey and source assignments; desktop/mobile verification.

## Architecture decisions

Forecasting is an input producer inside the existing monolith. A server-controlled Python child process receives only the bounded monthly series and temporal metadata. No microservice, new statistical package, broker, LLM, automatic model search or multi-agent system was added.

History assembly is explicit because M2/M4 versions describe bounded planning periods: users choose non-overlapping confirmed versions for the same component. Duplicate/gapped/partial/non-Actual series are rejected. No silent aggregation or interpolation occurs.

The existing `baseline.edit` authorization controls forecasting operations, while original raw-data confirmation/publication rules remain intact. Job execution is an explicit bounded HTTP operation with persisted state, not a production distributed scheduler.

Full algorithms, configurations, runtime limits, routes and rationale are in [M5 contracts](M5-CONTRACTS.md).

## Models, evidence and fallback

| Model | Implementation | Eligibility |
| --- | --- | --- |
| Naive | Repeat last training value | Required benchmark |
| Moving average | Constant mean of last 3 training months | Eligible nonseasonal history |
| Holt | Additive undamped trend, fixed alpha/beta | Eligible history; reject invalid extrapolation |
| Holt-Winters | Additive annual seasonality, fixed alpha/beta/gamma | At least two annual cycles in every training fold |

Horizons 3/6/12 need at least **21/30/48** usable observations, respectively: twelve initial training months plus three non-overlapping horizon-length validation windows. Seasonal candidates need **33/42/60** observations, respectively. Continuity, semantic appropriateness, completeness, source type, commitments and structural changes also matter.

Naive is selected if every validation prediction is exact. Otherwise a challenger needs ≥10% pooled MAE improvement, no worse RMSE, wins in at least two folds, and MAE ≤50% of mean validation Actual. Qualifying models rank by MAE, RMSE, then fixed complexity order. No qualifying candidate means an explicit assumption fallback, with no approved statistical points.

**Uncertainty:** these point methods and three errors per forecast lead do not justify calibrated prediction intervals. Artifacts/UI explicitly record interval unavailability and that forecasts are not guarantees. Arbitrary confidence percentages were not added.

## Hybrid-baseline behavior

The user chooses a confirmed future template with the same origin/horizon and reviews exact replacement entries and cash treatment. Approved points replace only the selected overlapping component/effect. Known schedules/commitments cannot be replaced with forecasts; linked settlement conflicts require a revised template. Other schedules, assumptions, opening cash and coverage declarations remain explicit.

Each component/month records a source assignment. Forecast inputs retain artifact, approval and period references. Ordinary M2 confirmation also validates those references and exact values, preventing forged Forecast labels. The operation creates a new planning version and prepared baseline; it never mutates an existing baseline/run. Publication remains a separate action. M3 monetary changes become assumptions and discard obsolete forecast approval references.

## Files and migration

Added:

- `packages/forecasting/src/model.ts`, `engine.ts`: contracts, eligibility, temporal folds and pure hybrid composition.
- `packages/forecasting/runtime/worker.py`: fixed models, evaluation/selection and process restrictions.
- `apps/api/src/forecast-runtime.ts`, `forecast-service.ts`, `forecast-routes.ts`: runtime boundary, tenant-owned history/jobs/artifacts/approval/composition.
- `apps/web/src/forecasts.ts`, `forecasts.html`: M5 journey.
- `migrations/007_forecasts.sql`: five M5 tables and optional planning-entry reference.
- `tests/forecast.test.ts`, `forecast-helpers.ts`, `forecast_worker_test.py`: deterministic fixtures/numerical/failure/composition verification.
- `docs/M5-CONTRACTS.md` and this report.

Additive changes:

- Planning model/engine/service: optional approved-forecast references, confirmation verification and stored reference reading/writing; financial formulas unchanged.
- Scenario engine: remove stale forecast reference when replacing an input with a scenario assumption.
- API/app and Angular navigation: mount the new module; label approved forecasts in existing financial evidence.
- `tests/api.test.ts`: 21 M5 API/DB checks; expected migration count increased from 6 to 7.
- README, `.env.example`, Python cache ignores and CI Python 3.12 setup.

Migration 007 adds `forecast_jobs`, `forecast_attempts`, `forecast_artifacts`, `forecast_approvals`, `forecast_compositions` and nullable `planning_entries.forecast_ref`. It uses existing tenant RLS and immutable-content triggers. Existing rows require no data rewrite. It ran in the isolated test DB and local development DB. No production deployment was performed.

Git currently reports the project files as untracked, as before this milestone; there is no meaningful tracked baseline diff to claim. No commit was created.

## Security and failure handling

- Workspace authorization/RLS on requests, history, jobs, artifacts, approvals and composition; foreign references return 404.
- Server-only executable/script path; stdin data, sanitized environment and errors; no DB/session secrets sent to Python, no financial temporary files.
- Isolated Python standard-library runtime; audit-denied file/network/process access after setup; 10-second wall timeout, 5 CPU seconds, 256 MiB limit; Windows Job Object/POSIX rlimits; two concurrent workers per Node instance.
- Idempotency conflicts prevent changed-payload reuse; successful reruns reuse the artifact. Three-attempt maximum and 30-second lease recovery.
- Atomic completion tested by injecting a database failure during final job update: no artifact or completed attempt escaped the rollback, and recovery then succeeded.
- Old forecast artifacts survived a later M4 import, later mapping-draft edit, and another forecast. Old financial results replayed exactly.

## Automated verification

| Check | Final result |
| --- | --- |
| Existing M1–M4 suite before editing | 359 passed; 0 failed |
| Complete final Vitest suite | **415 passed; 0 failed; 0 skipped; 7 files** |
| New M5 coverage | 35 domain/runtime/composition tests + 21 API/DB tests |
| Independent Python numerical/failure assertions | 6 passed, invoked by one of the 35 Vitest tests; not double-counted in 415 |
| Existing financial/import goldens and invariants | All retained and passing, including M4's 15 golden mappings and 17 invariants |
| Lint | Passed |
| Typecheck (API/shared + Angular) | Passed |
| API production build | Passed |
| Angular production build | Passed; 345.88 kB initial bundle, estimated transfer 82.55 kB |

The complete suite passed after the domain/API changes. Following the final small approval-state UI correction, lint, typecheck and both production builds were rerun successfully, and the affected browser transitions/composition were reverified.

Numerical checks include zero/near-zero inputs, exact naive behavior, linear trend, genuine annual seasonality, seasonal-history rejection, MAE/RMSE oracles, six-decimal rounding, temporal boundaries/no future leakage, reproducibility, candidate/all-candidate failures and actual Python timeout/process failure.

Integration/security checks include idempotent submission/execution/composition/approval, cross-tenant references/jobs/artifacts, direct RLS visibility, forged forecast amounts, immutable artifact updates/deletes, explicit replacement, assumption fallback, lease recovery, rollback/no partial persistence, later M4 changes, M2 replay and M3 scenario replay.

**Financial golden example:** forecast revenue 172 / 174 / 176 EGP, scheduled monthly rent 50, opening cash 1000, same-month collection/payment → closing cash **1122 / 1246 / 1372 EGP**. Verified through both API and browser; deterministic replay matched.

## Browser acceptance — 27/27 passed

Tested the built Angular application against the real API, PostgreSQL and Python worker using synthetic data.

1. Open company workspace and Forecasts navigation.
2. Select three confirmed Actual versions and a component.
3. Choose origin and planning horizon.
4. Explicit history-review gate.
5. Supported eligibility and required evidence explanation.
6. Execute persisted comparison and observe completed job state.
7. Inspect naive benchmark and all candidate MAE/RMSE evidence.
8. See selected Holt and expected 172/174/176 values.
9. See point-forecast uncertainty limitation without fabricated intervals.
10. Human approval and corrected before/after approval source selection.
11. Review future template, replacement entries and cash timing.
12. Create a new hybrid baseline.
13. Inspect Forecast/Schedule source assignments and IDs.
14. Handoff to existing Data & baseline workflow.
15. Calculate and inspect exact golden cash results.
16. Verify deterministic replay matches stored result.
17. Insufficient-history-evidence outcome, without a run action.
18. Enter explicit monthly assumptions and create assumption-led baseline.
19. Known contractual values return scheduled-not-forecast.
20. Declared structural change returns assumption requirement.
21. Twelve-month horizon reports its own higher evidence requirement.
22. Reopen a previous completed job/artifact.
23. Controlled missing-Python failure shows safe error and retry; restoring runtime and retrying succeeds.
24. Responsive width 390 px: no document overflow.
25. Responsive width 768 px: no document overflow.
26. Responsive width 1440 px: no document overflow.
27. No browser console errors in the completed M5 journey.

Final responsive document widths were 375/753/1425 px, equal to the available viewport content widths after scrollbar allocation. Temporary viewport override was reset.

Synthetic evidence references: workspace `ce051010-4b9b-40a2-8607-cd6e8d8b5f36`; original approved forecast `94e094ba-ec55-4f66-8620-7ffd069fde45`; golden baseline `8de58b8f-00a1-4335-8d0d-62a161f117f2`; explicit-assumption baseline `61a0b32d-1105-4379-830e-6a953be6fae6`; final-build post-retry artifact `9320aae8-f72a-4cab-9675-744618b8c6f4` and baseline `420855d9-31a4-4bce-9891-0299283b5959`. These are local verification records, not production data.

## Defects/corrections addressed during verification

- Ensured known future schedules/commitments cannot be silently replaced by statistical inputs.
- Ensured a scenario monetary adjustment drops the prior approved-forecast reference.
- Reopening job history restores the corresponding series/history metadata; interrupted/failed jobs expose recovery actions.
- Exact naive selection compares actual/predicted values rather than trusting a rounded-zero error metric.
- Corrected Holt-Winters seasonal updating to use the previous trend value consistently.
- Corrected the UI's pre-approval composition mode: explicit assumptions remain available until approval enables Forecast selection. Reverified on the final production build.

Two verification-fixture mistakes were corrected without changing established behavior: opening cash date now follows M2's first-day convention, and the M3 test publishes its prepared baseline before requesting scenario inputs.

## Definition of Done

| Item | Status / evidence |
| --- | --- |
| 1. Explicit tested eligibility | Pass — structured statuses and domain/API tests |
| 2. Naive benchmarking | Pass — every artifact includes benchmark candidate |
| 3. Temporal evaluation/no leakage | Pass — prefix-only fitting, fold boundaries, future-value perturbation test |
| 4. Deterministic explainable selection | Pass — fixed methods/configurations/policy and repeatability tests |
| 5. Horizon-specific evidence | Pass — separate H-based minimum/folds |
| 6. Weak evidence → assumptions | Pass — API rejection/fallback and browser assumption baseline |
| 7. Versioned reproducible artifacts | Pass — stored complete evidence/runtime and immutable DB rows |
| 8. Correct uncertainty | Pass — explicit interval unavailability; no unsupported interval claim |
| 9. Approved forecast → new hybrid | Pass — approval/reference validation and atomic composition |
| 10. Visible/auditable source lineage | Pass — persisted assignments, artifact evidence and UI |
| 11. Replay without refit | Pass — M2 exact financial replay |
| 12. Historical immutability | Pass — old suites plus later-import/mapping/forecast regression checks |
| 13. Workspace isolation | Pass — API and direct RLS tests |
| 14. Responsive complete frontend | Pass — full workflow and three widths |
| 15. Existing M1–M4 tests green | Pass — all 359 retained |
| 16. New M5 tests pass | Pass — 56 additional Vitest tests |
| 17. Lint/typechecks/builds | Pass |
| 18. Browser acceptance | Pass — 27 checks above |

## Known limitations and intentionally deferred work

- Monthly, one-currency, company-wide fixed observed series only. Maximum 120 months and twelve selected source versions; no automatic missing-data treatment.
- Fixed candidate parameters and a coarse evidence policy are transparent MVP choices, not optimized forecasts or business guarantees. The structural-change screen is conservative and may reject usable history.
- No calibrated statistical intervals are claimed. User assumptions remain assumptions.
- Composition needs an already-confirmed matching future template and explicit cash timing. Linked settlement conflicts require a revised template. M2's 150-entry limit still applies.
- Jobs run in the application process boundary with manual retry/recovery; no durable distributed scheduler or production operations claim.
- The actual runtime/resource checks were exercised on Windows. CI Python is configured; hosted CI execution and Linux resource-limit behavior were not verified here.
- Production packaging must retain the fixed Python script and configure a trusted Python executable. No deployment was performed.

**M5 meets all 18 Definition of Done items. M6, M7, M8 and M9 were not started.**
