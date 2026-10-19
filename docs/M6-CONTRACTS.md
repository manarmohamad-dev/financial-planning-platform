# M6 — Stress, risk and deterministic decision evidence

## Architecture and financial authority

M6 adds `packages/stress`, API stress routes/services and one Angular workbench to the existing application. It does not replace M2, M3, M4 or M5. A definition pins a completed published baseline run or a completed scenario run, including its original inputs, calculated results and provenance. M3's supported amount-change transformations and M2's financial engine remain authoritative. No separate financial calculator or Python forecasting invocation is introduced.

Approved forecast amounts are stored source inputs. Stress can turn a selected forecast amount into an explicit adverse assumption while retaining the original source snapshot and forecast references. Unchanged evidence retains original provenance. Stress-specific evidence records the confirming actor and definition version.

## Supported definitions

- Revenue decrease: a reviewed proportion applied to supported fixed revenue entries.
- Operating expense increase: a reviewed proportion applied through M3's supported spending semantics. Payroll/headcount and derived drivers are not overwritten.
- Collection delay: an integer additional month offset applied to existing revenue collection-profile buckets; no recognition-date shift. Beyond-horizon receipts remain explicit tail evidence.
- Combined/custom: bounded compositions of those supported changes.
- Zero reference: an explicitly selected unchanged source. Empty adverse definitions and modified zero references are rejected.

Each modification records its target, inclusive monthly range, rate or delay, reason, pinned-source reference and dependencies. Overlapping amount changes to the same target/month, duplicate timing changes, missing targets, unsupported drivers and out-of-range periods are rejected. Amount and timing changes may coexist. Percentages reference pinned amounts, not the output of earlier percentage changes. Dependencies identify earlier modifications; they do not introduce compounding.

Defaults in the UI are reviewable examples: revenue -20%, expense +10%, delay +1 month. They are not industry estimates. At most 24 modifications per definition and eight distinct versions per batch are accepted. Editing creates a new immutable version.

## Batch execution and recovery

PostgreSQL stores batches, child statuses, immutable attempts and immutable results. Execution is explicitly triggered through the API/UI, sequentially per requested batch; there is no background scheduler. Each child is claimed transactionally under workspace locking. Calculations run outside the transaction; successful result, attempt, status and audit changes commit together.

Idempotency keys reject changed request payloads. Successful children are never rerun. Failure exposes a safe error code and retains successful siblings. A running child has a 30-second lease; an expired lease records interruption and may retry. There are at most three attempts. An exhausted interrupted child settles as failed. Cancellation records a persistent tombstone; pending/failed children become cancelled and in-flight completion cannot publish a late result. Completed siblings remain available.

## Risk policies and findings

Only the existing `risk.edit` permission can create workspace policy versions (Owner in the current role model). Managers and Analysts can use approved versions without silently changing workspace thresholds. A manager-requested reserve is recorded as an explicit declared constraint with its source/reason; an Owner confirms it.

Available company-level rules are:

| Rule | Comparison | Severity |
| --- | --- | --- |
| Negative cash | Closing cash strictly below explicit zero | Critical |
| Minimum cash reserve | Closing cash strictly below declared reserve | Warning |
| Operating floor | Operating result strictly below declared floor | Attention |

Policies record currency, source, configuration, creator and revision. Equality meets a minimum. Monetary comparisons use existing decimal semantics. Missing data produces unavailable status, never a fabricated zero or a safe conclusion. Operating result retains M2's limitations and is not net profit.

Findings contain rule/version, policy ID, severity, metric, threshold, comparison, calculated run reference, exact period values and field paths. Consecutive breaches form an episode. Recovery is the first observed non-breach after that episode; unknown periods and the horizon boundary do not establish recovery. Explanations use deterministic templates.

## Comparisons and briefs

Up to three settled batches can be compared. They must use the same pinned baseline, currency, monthly horizon, financial coverage/requested outputs, engine and rounding versions, company scope and risk policy. Comparisons include unstressed source results, the pinned baseline for scenario-only comparisons, successful stressed variants and failed/cancelled child disclosures. No automatic ranking or recommended decision is generated.

A brief is an immutable snapshot of the comparison evidence. It includes declared constraints, baseline/run references, exact ending/minimum cash, first-month outflows (explicitly not total investment), monthly operating result/cash, stress assumptions, source assumptions, risk episodes and limitations. A scenario run's baseline section is identified separately in references. Replay regenerates the deterministic document from stored evidence and checks exact equality.

Runway, unit break-even, stress payback and total required investment are not inferred. Existing scenario payback remains source-run evidence; it is not represented as a newly calculated stress metric.

## Persistence and security

Migration `008_stress_risk_briefs.sql` adds nine tenant-scoped tables: `risk_policy_versions`, `stress_definitions`, `stress_batches`, `stress_children`, `stress_attempts`, `stress_results`, `stress_cancellations`, `stress_comparisons`, `decision_briefs`. RLS and workspace-qualified foreign keys enforce tenant ownership. Analytical artifacts are append-only with database mutation guards; only child execution state is mutable.

Routes inherit session, Origin/CSRF and bounded JSON controls. Each read, source reference, batch execution, comparison and brief operation checks workspace membership/permission. Child claiming and completion reestablish tenant context. Safe failure codes and identifiers are used instead of logging financial payloads.

## UI, print and verification limits

The Stress Testing tab supports reviewed source/policy/definition selection, batch execution/retry/cancel, comparisons, grouped risk timeline, evidence inspection and historical briefs. Tables scroll within their container on narrow screens. The brief has an A4-width preview, print-specific styles, 16 mm page margins, repeating table headings and page breaks between options.

The automated suite and actual browser/PDF acceptance evidence are recorded in [M6-REPORT.md](M6-REPORT.md). The exact rendered application document and loaded styles were printed with Chromium to a five-page A4 PDF. Every rendered page was visually inspected and all 112 expected content blocks matched the PDF text. This verifies the saved synthetic three-option brief; other printer drivers and arbitrary future document lengths are not exhaustively certified.

M7 is not started. LLM integration, risk scores, Monte Carlo, optimization, reverse stress, sensitivity sweeps, bookkeeping and new operational-accounting models remain deferred.
