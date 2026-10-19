# M5 — Statistical forecasting and hybrid baselines

## Boundary and architecture

M5 adds a bounded analytical input producer to the existing Angular / Express / PostgreSQL application. It does not calculate cash, profit, financing, risk scores, sensitivity or decision briefs. M2 remains the authoritative financial engine; M3 consumes the resulting baseline normally. No forecasting service, queue broker, external AI service or new npm/Python dependency was introduced.

Flow: confirmed planning versions (including M4 import-produced versions) → reviewed historical series → eligibility → persisted job → isolated Python → immutable evaluation artifact → human approval → explicit source composition → new M2 planning version and prepared baseline → existing M2 calculation.

M4 versions have bounded monthly horizons. Users can explicitly select up to twelve confirmed versions to assemble a longer series. The source version and entry for every observation are preserved. Overlapping months are rejected, never summed or resolved automatically. Import provenance remains accessible through the referenced planning version and immutable M4 dataset/mapping records.

## Eligibility policy, version forecast-1.0.0

The supported series is one company-wide, fixed monthly, nonnegative Actual revenue or variable operating-cost component in one currency. Categories: revenue, marketing, fees, cost_of_sales, other_operating. Revenue-linked and headcount drivers are not converted into observations. Other categories use explicit schedules/assumptions.

Inputs must be complete, continuous, distinct monthly Actuals, end immediately before the forecast origin, and contain no partial periods, commitments or scheduled values. Maximum 120 observations, each at most one trillion currency units. Source currency/category/effect must agree across selected versions. No imputation, outlier deletion, aggregation across branches, currency conversion or automatic semantic mapping occurs in M5.

Statuses are `eligible`, `insufficient_history`, `insufficient_evaluation_evidence`, `unsupported_horizon`, `scheduled_not_forecast`, `invalid_series`, and `structural_change_requires_assumption`. A malformed transport contract is rejected separately. An explicitly declared structural change blocks statistical execution. A conservative level-shift screen also blocks when the latest three-month mean differs from the earlier mean by more than max(4 earlier population standard deviations, 75% of earlier absolute mean, 1 currency unit). This screen is a project policy, not a causal change-point detector.

| Horizon   | Minimum usable observations | First training window | Seasonal candidate minimum total |
| --------- | --------------------------: | --------------------: | -------------------------------: |
| 3 months  |                          21 |             12 months |                               33 |
| 6 months  |                          30 |             12 months |                               42 |
| 12 months |                          48 |             12 months |                               60 |

Twelve observations alone do not imply enough evaluation evidence. For horizon H, the final 3H observations form three non-overlapping H-month validation windows. Training expands before each window. Seasonal fitting requires at least 24 training observations in **every** fold. History length permits evaluation; it does not establish business certainty or guarantee selection.

## Candidate methods, fixed-1

All candidates use Python standard-library Decimal with precision 40. There is no random initialization, parameter search, learned preprocessing or external package. Forecast points are quantized half-up to six decimals. M2 applies its unchanged money quantization when calculating financial movements.

1. **Naive**: repeat the final training observation. Always included as the benchmark.
2. **Moving average 3**: repeat the mean of the final three training observations across the horizon; this is a constant-level baseline, not recursive smoothing.
3. **Holt**: additive undamped trend, alpha=0.6, beta=0.2; initial level y0 and initial trend y1−y0. Subsequent level/trend updates use only training observations.
4. **Additive Holt-Winters**: annual season length 12, alpha=0.4, beta=0.1, gamma=0.2. Initial level is the first-cycle mean, trend is the difference of the first two cycle means divided by 12, and initial seasonal offsets are first-cycle observations minus their mean. Updating starts in the second cycle. Two full training cycles are required; selection still requires empirical improvement. Multiplicative seasonality is intentionally excluded because zero is a supported Actual.

No negative or over-limit extrapolation is clipped into a plausible-looking amount: the affected candidate fails visibly. Other candidates continue. A failed candidate retains completed folds and a safe failure reason. Unsupported seasonality is recorded as `not_applicable`.

Method references: [rolling-origin evaluation](https://otexts.com/fpp3/tscv.html), [Holt trend](https://otexts.com/fpp3/holt.html), [Holt-Winters](https://otexts.com/fpp3/holt-winters.html). Fixed parameters and the acceptance thresholds below are explicit project choices, not claims of optimal statistical tuning.

## Evidence, metrics and deterministic selection

Persisted evidence includes the complete input series and lineage, all fold boundaries/counts, each candidate/configuration/version, fold predictions and actual values, fold and pooled MAE/RMSE, final fitted points, skipped/failed outcomes, runtime manifest and selection reason. Each fold fits only its training prefix. The final fit on all observations happens after evaluation and does not replace validation evidence.

- MAE = mean absolute error; RMSE = square root of mean squared error. Both use currency units and are reported to six decimals. MAPE is not used.
- If naive predicts every validation value exactly, select naive. This comparison uses point values, not a rounded-zero MAE.
- Otherwise a challenger must improve pooled MAE by at least 10%, not worsen pooled RMSE, beat naive MAE on at least two of three folds, and have MAE at most 50% of mean validation Actual. Comparisons use the recorded six-decimal metrics, consistently on replay.
- Rank qualifying models by MAE, then RMSE, then fixed candidate order (simpler wins exact ties).
- If none qualifies, or the benchmark fails, the artifact is `fallback`, with no selected forecast points. It cannot be approved. Explicit assumptions remain available.

The 50% cutoff is a deliberately declared coarse acceptance policy, not a claim of commercially sufficient accuracy. Fixed methods can miss useful patterns and reject some forecastable series.

## Uncertainty semantics

This first candidate set supplies point forecasts only. The evaluation design yields three observations of error at each lead, without a fitted/validated probabilistic innovation model. That is not enough to claim calibrated prediction intervals. Each artifact therefore records `uncertainty.kind=unavailable` and explains the limitation. The UI explicitly states that values are not guarantees. It never fabricates an arbitrary ± percentage “confidence interval.” User assumptions are labeled assumptions; no stress-test range is implemented.

## Jobs and runtime security

`POST /workspaces/:workspaceId/forecasts/jobs` creates a queued job under a workspace-scoped idempotency key. A reused key with different payload returns conflict. `POST /jobs/:id/run` claims a persisted attempt, releases the transaction, invokes Python, and then commits the attempt, complete artifact and successful job state atomically. A successful rerun returns the same artifact. Failed attempts remain visible and can retry up to three total attempts. A running lease older than 30 seconds can be reclaimed; stale completions cannot overwrite a newer attempt. Interrupted execution resumes by an explicit user action, not a background scheduler.

The endpoint waits for the bounded worker while the UI displays running status. Jobs can be reopened after navigation; queued/failed jobs can run again, and interrupted running jobs can resume after lease expiry. A multi-machine distributed queue is not claimed.

Python receives only the validated period/value series, three fold definitions, origin, horizon and protocol version through stdin. No workspace identities, DB credentials, session secrets or financial values in process arguments. The executable is server configuration `FORECAST_PYTHON` (default `python` on PATH), never an HTTP parameter. Start the API from the repository root so the fixed worker path resolves. Production packaging must retain `packages/forecasting/runtime/worker.py` alongside the compiled application.

- Python `-I -S`; trusted standard-library imports only; restricted environment containing OS/path necessities, no inherited application secrets.
- No financial temporary files. Stdin ≤64 KiB, result output ≤1 MiB, maximum two simultaneous processes per Node instance.
- Ten-second wall timeout with process termination, five CPU seconds and 256 MiB address/process memory limit. POSIX uses rlimits; Windows uses a Job Object with one active process and fails closed if limits cannot be installed.
- After trusted imports/limit setup, an audit hook denies file opens, network socket calls and process spawning. This narrows a trusted fixed algorithm; it is not an arbitrary-code execution sandbox.
- Child stderr and arbitrary crash messages are never logged or returned. Public errors are fixed codes. Candidate exceptions do not expose data/tracebacks.
- Authorization is checked before claiming and again before committing. Revoked access cannot commit results; an authorized actor can later reclaim an expired job.

Python 3.12.14 was exercised on Windows; CI is configured with Python 3.12. No pip installation is required. Linux rlimits are implemented but were not exercised on this Windows workstation.

## Hybrid composition and financial correctness

The user chooses a confirmed **future template** matching origin/horizon, reviews component replacements/cash timing, and either selects an approved artifact or supplies one explicit assumption per month. The operation copies the template into a new draft, confirms a new planning version, and prepares a new baseline in one transaction. Publication remains the existing separate M2 permission/action.

Forecasts cannot replace known future schedules or committed entries. Exactly the overlapping component/effect entries must be explicitly selected for replacement; unrelated deletion is forbidden. Linked settlement entries block replacement until the user supplies a revised future template. Other entries and opening-cash/coverage declarations are retained. Existing M2 capability validation still applies. No automatic financial completeness is inferred.

New forecast entries contain artifact/approval/period references and exact stored values. Every M2 confirmation validates those references against owned approved artifacts, including amount/currency/component/category/effect/month. A manually forged Forecast label or changed amount cannot bypass approval. Optional references are backward-compatible for existing M2 records. Changed M3 monetary inputs become explicit assumptions and drop the obsolete forecast approval reference.

Every composed entry/month has a source assignment: copied planning version, forecast artifact and approval, or new explicit assumption. Previously published baselines/runs never mutate. Stored values flow directly to M2, so replay never refits Python. Retained forecasts from earlier hybrid templates preserve their original artifact references.

## Database and API

Migration `007_forecasts.sql` adds optional `planning_entries.forecast_ref` and five tables: jobs, attempts, artifacts, approvals, compositions. Artifacts/attempts/approvals/compositions have immutable-content triggers. All tables use existing tenant RLS; composite keys constrain relational workspace references. Source planning references in JSON are individually authorized before persistence. Job update grants cover only status/attempt/start/error fields, not immutable input payloads.

Read operations require `data.view`; create/run/approve/compose use existing `baseline.edit` in company workspaces. Thus Owner, Manager and Analyst may use previously confirmed history; existing data-confirmation and publication rules are unchanged. Foreign references return the established 404 non-disclosure response. Audit events contain identities/actions, not raw monetary series.

Routes under `/forecasts`: POST eligibility, POST/GET jobs, GET job, POST job/run, GET artifact, POST artifact/approve (`reviewed:true`), POST composition (`sourcesReviewed:true`), GET composition. Existing planning and scenario endpoints are retained.

## Explicit exclusions

Monthly, company-wide, one-currency planning only; no inventory accounting, industry modules, branch forecasts, automatic aggregation/imputation, tuning/search, guaranteed accuracy, probabilistic interval claims, production job orchestration or deployment. No M6 stress/risk/brief system, M7 LLM integration, M8/M9 final hardening/release work was started.
