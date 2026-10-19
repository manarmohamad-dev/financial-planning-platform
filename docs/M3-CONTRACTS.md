# M3 scenario contracts and API

## Architecture

Published immutable M2 baseline snapshot + confirmed scenario changes → validated input transformation → the existing `calculateBaseline` function for both baseline and scenario → invariant checks → comparison and persisted evidence.

`packages/scenarios/src/engine.ts` does not implement a replacement financial engine. Recognition, payroll, linked costs, timing, cash balances and funding gaps remain in `packages/planning/src/engine.ts`. Money arithmetic uses the existing decimal Money contract. No floating-point financial calculation is introduced.

## Change semantics

- `adjust`: targets an existing fixed-amount revenue or operating-cost entry, over an inclusive month range. Supported operations: set, add, subtract, percentage increase/decrease, remove. A rate of `0.10` means 10%. Every adjustment references the original pinned baseline, never another adjustment's output.
- `entry`: adds an explicitly supplied M2 planning entry. Its financial category is independent of its fixed, headcount or revenue-linked driver. A monthly amount repeats through its inclusive start/end range; equal start/end makes a one-time item.
- Hiring adds payroll using employee count × loaded monthly cost, plus an optional **total** onboarding cost once at the start. It never increases revenue.
- Expansion explicitly supplies investment payments, costs, payroll and revenue/ramp, or declares revenue unknown for a cost-only analysis. Cost coverage must be reviewed. Investment requires an explicit payment, including an explicitly reviewed zero when applicable. A branch investment is represented as an impact within the company, not as branch accounting.
- Combined decisions compose these same primitives. Changes are resolved by dependency and then revenue, revenue-linked costs, payroll, operating spending, and direct cash movements. M2 resolves activity, timing and calculation afterward. Overlapping component/effect/month changes, duplicate identities, missing/cyclic/reversed dependencies and incompatible inputs are rejected.
- New costs linked to scenario-added revenue declare their dependency explicitly. Existing baseline linked costs are recalculated by M2 against the changed revenue.
- All changes include currency, supported company scope, source kind, source explanation/reference and dependencies. Forecast evidence is rejected in M3.

## Cash timing

Recognized revenue/cost activity retains its baseline timing profile when adjusted. Fixed explicit cash schedules require complete replacement schedules for the changed activity months; no automatic scaling is performed. The replacement identifies both activity month and cash month and must reconcile with the whole modeled amount, including tail amounts.

Direct cash entries (investment, purchases, known payment/receipt) already specify actual cash months. They are not shifted by an activity timing profile. The UI hides the extra delay control for these entries and explains that start/end are payment/receipt months. The API rejects conflicting delay/non-cash treatments; an equivalent one-bucket 100% same-month profile remains compatible. Recognized activity can use delayed collection/payment profiles. The UI offers a single month offset for newly added activity; baseline multi-bucket profiles are retained by the engine.

## Readiness and versioning

Readiness (`ready`, `missing_required_input`, `invalid_conflicting_input`, `unsupported`) is separate from evidence type (`observed`, `schedule`, `assumption`). M2 capabilities are evaluated on transformed inputs before confirmation. Every finding explains the requirement.

Draft edits use an expected revision. Confirmation requires `assumptionsConfirmed: true` and creates an immutable version. Confirmation of the same revision is idempotent. Execution references that version and its exact published baseline. An idempotency key cannot be reused for another version. Old runs store their full input snapshot and result; replay compares a recalculation against the stored result. A later draft, baseline or reserve-policy change does not rewrite old history.

## Results and interpretation

Monthly results contain baseline, scenario and difference for revenue, operating expenses, Operating Result, cash inflows/outflows, net cash movement and closing cash. Risk comparison includes minimum cash/month, first negative month, reserve breach and funding gap. Unavailable monetary outputs remain null. No breach is distinguished from an unavailable calculation in the UI.

Funding gap retains M2's maximum reserve shortfall over projected periods. It is not inserted as financing. Commitments distinguish recognized activity from cash payments/receipts; these are not additive measures. Cash movements beyond the horizon remain visible.

Simple payback is available only for a pure expansion with explicit modeled revenue, cash outputs and positive investment paid in one month. It reports undiscounted recovery of cumulative incremental cash after an initial deficit, sustained through horizon end. Otherwise it reports not reached or unavailable with a reason. It does not infer beyond-horizon benefits. Unit-volume break-even is unavailable because this contract does not supply a validated unit-price/contribution-margin model.

Comparison sets contain one to three distinct authorized runs with the same baseline, financial engine and rounding policy. The UI supports Baseline/A/B/C, does not rank decisions, and preserves saved comparisons.

## API

All paths below have prefix `/api/v1/workspaces/:workspaceId/scenarios`. Existing session, CSRF, tenant transaction and server-side permissions apply.

| Method / path                    | Purpose                                                        |
| -------------------------------- | -------------------------------------------------------------- |
| GET `/baselines/:id/inputs`      | Read the exact published baseline snapshot                     |
| GET / POST `/drafts`             | List / create draft                                            |
| GET / PATCH `/drafts/:id`        | Read / revision-checked edit                                   |
| POST `/validate`                 | Evaluate submitted scenario readiness                          |
| GET `/drafts/:id/readiness`      | Evaluate saved draft readiness                                 |
| POST `/drafts/:id/confirm`       | Confirm expected revision and reviewed assumptions             |
| GET `/versions`, `/versions/:id` | List / inspect immutable versions                              |
| POST `/versions/:id/runs`        | Execute with an idempotency key                                |
| GET `/runs`, `/runs/:id`         | List recent runs / retrieve saved result                       |
| GET `/runs/:id/evidence`         | Retrieve immutable snapshot, lineage, movements and comparison |
| POST `/runs/:id/replay`          | Verify saved-result reproducibility                            |
| GET / POST `/comparisons`        | List / save compatible comparison set                          |
| GET `/comparisons/:id`           | Reopen saved comparison                                        |
| POST `/demo-examples`            | Run one enumerated synthetic example in Personal Demo only     |

Scenario editing/confirmation uses `scenario.edit`; execution/replay uses `scenario.run`; comparison uses `comparison.view`; read/history/evidence uses `data.view`. Owner, Manager and Analyst receive only their established M1 permissions. Scenario access grants no membership, company administration, ownership or reserve-policy privilege. Demo custom drafts/edits/confirmations/execution are blocked; its fixed examples use the real engines through an isolated synthetic workflow.

## Persistence and audit

Migration `005_scenarios.sql` adds six tenant-scoped tables: `scenario_drafts`, `scenario_versions`, `scenario_runs`, `scenario_period_results`, `scenario_comparisons`, `scenario_comparison_runs`. Composite foreign keys bind workspace, baseline, scenario and comparison identities. All have RLS; the runtime role is not a database owner or RLS bypass role. Drafts are mutable; versions, runs, period results and comparisons have immutable update/delete triggers.

Audit records creation, draft/assumption edits, confirmation/versioning, successful runs, comparison creation and rejected mutation/execution requests. Rejection audit survives mutation rollback where the caller has workspace access. Audit metadata excludes financial payloads. Routine read-only comparison views are not separately audited in M3.

## Limits

Monthly 3/6/12-month M2 horizons; one currency per workspace; company scope; 30 scenario changes; at most 150 transformed M2 entries; synchronous local execution; latest 100 runs listed (known run IDs remain retrievable). Duplicate detection relies on stable component identities; it cannot infer that differently named user inputs represent the same real expense. Users must review coverage and identity choices. Gross revenue adjustments against independent net settlements are rejected. Existing headcount/derived-cost targets cannot be overwritten using fixed-amount adjustments.

No imports, semantic mapping, statistical forecasting, AI, stress testing, sensitivity, Monte Carlo, recommendations, integrations, currency conversion, consolidation, inventory forecasting, tax engine, automatic financing, daily/weekly liquidity or production deployment were added. M4 has not started.
