# Milestone 3 completion report

**Status: COMPLETE — Ready for Milestone 4. Milestone 4 has NOT been started.**

Verification completed across the resumed implementation sessions on September 16–17, 2026. The interrupted M3 backend work was retained and completed; M1/M2 were not rebuilt or replaced.

## Implementation summary

All five decision types are implemented: Sales Change, Hiring, Spending Change, simplified Investment/Expansion, and Combined Decision. They use two composable typed primitives, not five calculators. Validated scenario changes transform a pinned published baseline's inputs, and **both financial paths run the same authoritative M2 Financial Engine**.

The Angular workflow now supports baseline selection, explicit source/assumption entry, readiness explanations, conflict resolution, assumption review, immutable confirmation, execution, baseline/scenario/difference, A/B/C comparison, history, replay and readable calculation evidence. Personal Demo offers five isolated synthetic examples using the real engines.

## Files and modules

| Area            | Files / responsibility                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario domain | `packages/scenarios/src/model.ts`, `engine.ts`, `metrics.ts`, `fixtures.ts`: contracts, readiness, ordered transformation, lineage, comparison/payback and synthetic examples |
| API             | `apps/api/src/scenario-service.ts`, `scenario-routes.ts`; mounted in `app.ts`: versioned persistence, permission checks, replay, comparison and audit                         |
| Web             | `apps/web/src/decisions.ts`, `decisions.html`; integration in `main.ts`, `app.html`, `styles.css`: complete decision workspace and results                                    |
| Database        | `migrations/005_scenarios.sql`: six scenario/history/comparison tables                                                                                                        |
| Tests           | `tests/scenario-engine.test.ts`; M3 persistence/security coverage in `tests/api.test.ts`                                                                                      |
| Documentation   | `docs/M3-CONTRACTS.md`, this report, current scope in `README.md`                                                                                                             |

No new runtime dependency was required. The M2 financial engine and formulas were preserved.

## Database migration

`005_scenarios.sql` adds:

1. `scenario_drafts`
2. `scenario_versions`
3. `scenario_runs`
4. `scenario_period_results`
5. `scenario_comparisons`
6. `scenario_comparison_runs`

All six tables have tenant RLS and composite identity constraints. Confirmed versions/results/comparisons are immutable. Period financial values use `numeric(24,6)`. Migration passed against the isolated PostgreSQL test database and the persistent local development database; all five migrations are present. No production deployment occurred.

## Automated verification

| Check                        | Final result                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated tests              | **260 passed, 0 failed; 4 test files passed**                                                                                                                                           |
| New M3 coverage              | **82 tests**: 53 domain tests + 29 API/persistence/security tests                                                                                                                       |
| Golden scenario suite        | **30 passed**: financial outcomes across all five types, plus explicit conflict/double-counting rejection cases                                                                         |
| M3 invariants and validation | **23 passed**; persistence-related invariants additionally covered through the API                                                                                                      |
| Existing M1/M2 tests         | All 178 passed, including the existing 38 M2 financial-engine tests                                                                                                                     |
| Security/isolation           | Passed: roles, foreign IDs in both URL contexts, unauthorized baselines/comparisons/mutations/replay, RLS, immutable history, malformed payloads, audit attribution and Demo separation |
| Lint                         | Passed, `npm run lint`                                                                                                                                                                  |
| Typecheck                    | Passed, TypeScript and Angular template checks via `npm run typecheck`                                                                                                                  |
| API production build         | Passed, `npm run build:api`                                                                                                                                                             |
| Angular production build     | Passed without bundle-budget warning; final initial bundle 284.26 kB, estimated transfer 70.72 kB                                                                                       |
| Browser verification         | Passed, including final correction checks on September 17                                                                                                                               |

The full `npm run check` passed after the final financial validation change. After the subsequent evidence presentation change, lint, typecheck and both builds passed again. The evidence screen was then verified in the browser. Tests were not needlessly repeated for documentation changes.

### Financial guarantees verified

- Zero changes reproduce baseline financial outputs.
- Identical immutable snapshots replay identically; neither engine mutates the baseline.
- Existing baseline and scenario history survives draft edits, new versions, a different explicit baseline selection and reload.
- Opening cash plus net movements equals closing cash in each month; delta equals scenario minus the referenced baseline.
- No automatic financing, hiring revenue, marketing benefit or immediate collection is invented.
- Timing profiles preserve delayed cash and tail movements; explicit replacement schedules must reconcile.
- Conflicts, duplicate financial effects and incompatible scenario/baseline relationships are rejected.
- Missing salary and unreviewed expansion costs block confirmation rather than becoming zero.
- Unsupported break-even/payback is unavailable with a reason.
- Direct investment cash is applied in its declared payment month; an incompatible extra delay is rejected.

## Browser acceptance evidence

Tests used synthetic local records only, through the in-app Chromium browser. The full company workflow used an Owner account with the same scenario UI available to Manager/Analyst; server-side Manager and Analyst permissions were separately verified by the API tests.

| Contract check                         | Verified outcome                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open company / published baseline      | Opened existing synthetic company and explicitly selected baseline `95727322…`                                                                       |
| Sales / review / confirmation / run    | Created +10% sales assumption, checked readiness, confirmed and ran                                                                                  |
| Baseline comparison / evidence         | Inspected absolute values, differences, funding gap, delayed cash, original sources and scenario lineage                                             |
| Hiring                                 | Missing loaded employee cost showed explained blocking state; supplying it enabled confirmation and execution                                        |
| Spending                               | Added recurring marketing cost; cash reduced without invented revenue                                                                                |
| Expansion                              | Explicit investment, rent, payroll and delayed revenue; payback correctly not reached in the horizon                                                 |
| Combined                               | Composed expansion with additional marketing into a new confirmed version                                                                            |
| Conflict                               | Duplicate marketing component in overlapping months was rejected; removing the duplicate restored readiness                                          |
| A/B/C                                  | Saved Sales/Hiring/Combined against the same baseline; displayed Baseline/A/B/C without ranking                                                      |
| Reload / reopen                        | Reopened the original expansion run and saved comparison after reload                                                                                |
| Edit / new version / immutable history | Editing the expansion draft into a combined decision produced a separate version; original expansion amounts were unchanged and replay matched       |
| Personal Demo                          | All five examples executed, persisted, reopened and displayed their expected distinct results; combined example replay matched                       |
| Final direct-cash correction           | October-only investment left September cash unchanged and affected October onward; no misleading extra-delay control appeared                        |
| Final evidence presentation            | Readable change/source summary and movement calculation table, with full snapshots and lineage available for inspection                              |
| Responsive behavior                    | Final evidence screen checked at 390, 768 and 1440 px; document widths were 375, 753 and 1425 px respectively, with no page-wide horizontal overflow |
| Browser errors                         | No captured JavaScript errors in the final verification session                                                                                      |

### Independently checked browser values (EGP)

Company baseline: September–November 2026, opening cash 1,000; revenue 100/month collected one month later; rent 200/month paid immediately; reserve 750.

| Case                                                                                            | September closing cash | October | November |
| ----------------------------------------------------------------------------------------------- | ---------------------: | ------: | -------: |
| Baseline                                                                                        |                    800 |     700 |      600 |
| Sales +10%, original collection timing                                                          |                    800 |     710 |      620 |
| Hire 2 × 50/month + 10 total onboarding                                                         |                    690 |     490 |      290 |
| Additional marketing 30/month                                                                   |                    770 |     640 |      510 |
| Expansion: investment 200, rent 20/month, payroll 50/month, revenue 100/month delayed one month |                    530 |     460 |      390 |
| Combined expansion + marketing 30/month                                                         |                    500 |     400 |      300 |
| Cost-only investment 200 paid in October                                                        |                    800 |     500 |      400 |

Sales funding gap fell from 150 to 130. Expansion's original saved run `68cac60b…` retained 530/460/390 after its draft was edited into Combined and after reload/replay.

Synthetic Demo closing cash series were separately observed:

- Sales decrease: 28,000 / 38,000 / 48,000.
- Hiring: 16,000 / 24,000 / 32,000.
- Spending: 25,000 / 40,000 / 55,000.
- Expansion: 6,000 / 29,000 / 52,000.
- Combined: −9,000 / −7,000 / −5,000; no automatic financing was added.

## Defects found and fixed during completion

1. **Misleading onboarding label:** the UI initially said per employee while M2 correctly applies one total onboarding amount. The label and explanation now say total; no M2 formula was changed.
2. **Ambiguous direct-cash timing:** the initial UI offered an extra delay for direct investment payments, which M2 treats as already dated cash. Direct payments now use clearly explained payment months; scenario validation rejects incompatible extra timing. A regression test verifies rejection and correct October/February-style scheduled payment behavior.
3. **Null breach display:** the UI now distinguishes no breach in the modeled horizon from an unavailable cash/risk calculation.
4. **Unnecessary frontend schema bundle:** importing a metric list through the schema module pulled server-side validation code into Angular. A lightweight shared metrics module removed that import path; the initial bundle fell from approximately 782 kB to 284 kB without raising budgets.

The local database had stopped during interruption and was restarted using existing persisted data. An initial SQL-formatting attempt reported that Prettier had no SQL parser; it did not alter the migration or affect lint/build/database verification. Neither item was a product defect. No M1/M2 financial-engine defect requiring a formula change was found.

## Known limitations

- Monthly company-level planning only, using M2's 3/6/12-month horizons and a single workspace currency. Branch investment impacts are supported; separate branch accounts/consolidation are not.
- At most 30 changes and 150 transformed input entries. Runs are synchronous; the history selector lists the latest 100 runs.
- Fixed-amount adjustments target fixed revenue/operating-cost entries. Existing headcount or derived-cost amounts are not directly overwritten. Gross revenue against independent net settlements requires reconciliation outside M3 and is rejected.
- Stable component identities support duplicate detection; the system cannot infer that differently named inputs are the same real-world obligation. Explicit source and coverage review remains necessary.
- The new-entry UI offers a single cash-delay offset. Existing multi-bucket baseline profiles are preserved; explicit baseline cash schedules use supplied replacement amounts.
- Payback is a conservative, undiscounted incremental-cash recovery measure for the supported pure expansion structure; staged investment and incomplete benefits are not assigned invented payback. Unit-contribution break-even remains unavailable with a reason.
- No imports, mapping, statistical forecasting, AI, stress/sensitivity/Monte Carlo, automatic recommendations, external integrations, inventory forecasting, tax engine, automatic financing, daily/weekly modeling or production deployment.
- Browser verification covers the local Chromium workflow, not a cross-browser certification. Security results are the automated acceptance scope, not an external penetration test.

## Final disposition

All M3 definition-of-done categories have passed within these documented MVP boundaries. **Ready for Milestone 4. M4 has NOT been started.**
