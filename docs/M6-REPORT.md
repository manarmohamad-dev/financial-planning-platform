# Milestone 6 — Final implementation and verification report

**Status: COMPLETE — all 23 acceptance items passed, including inspection of the actual five-page PDF. Ready for M7. M7 was not started.**

Verified 23 September 2026 (Cairo), Windows, Node 24.21.0, Python 3.12.14, PostgreSQL 18. The run resumed the existing M6 implementation; no project scaffolding or architecture replacement was performed. Before M6, the complete M1–M5 baseline was **415 passing tests**.

## Already complete at continuation

- Versioned stress definitions, transformations through existing financial semantics, persisted batch/child execution and retry/cancel behavior.
- Versioned explicit risk policies, threshold findings, grouped breach/recovery timelines and compatible comparisons.
- Deterministic immutable briefs, replay, tenant security and the Angular Stress Testing workflow.
- Initial M6 domain/API tests. Final verification and documentation were outstanding.

## Completed during final verification

- Resolved a TypeScript UUID-inference issue in the batch test helper and isolated M6's test application rate-limit state from earlier suites. The production limiter was not relaxed.
- Verified the entire automated suite, financial goldens, API build and Angular production build.
- Added acceptance coverage for expired/exhausted child leases, post-result-insert transaction rollback, cancellation retaining successes, foreign result access, approved M5 forecast reuse without Python, incompatible baselines and brief immutability after later financial/forecast/import-mapping activity.
- Rejected silently empty adverse definitions and changes disguised as zero-stress references; added a regression test.
- Fixed a real browser defect: global fixed-height flex header styles caused decision-brief title overlap. A component-scoped header override fixes screen/print layout without changing the application header.
- Completed browser source → policy → definitions → batch → results → risk evidence → comparison → brief → historical reopen/replay acceptance, responsive inspection and print-preview inspection.
- Added architecture/contracts documentation and this report; updated README status.

Earlier M6 implementation corrections retained in the final code include original-entry lineage through amount/timing splits, confirming-actor provenance, expired final-attempt settlement, missing-result rejection, and a pinned baseline option in scenario-only comparison construction.

## Implementation/modules

| Area | Files |
| --- | --- |
| Stress contracts, risk, financial transformation, brief construction | `packages/stress/src/model.ts`, `engine.ts` |
| API orchestration, persistence, authorization and replay | `apps/api/src/stress-service.ts`, `stress-routes.ts`; route mount in `app.ts` |
| Tenant persistence | `migrations/008_stress_risk_briefs.sql` (nine tables) |
| Workbench and printable brief | `apps/web/src/stress.ts`, `stress.html`, `stress.css`; navigation/integration in `main.ts`, `app.html`; print shell rules in `styles.css` |
| Verification | `tests/stress-helpers.ts`, `stress.test.ts`, M6 group and migration count in `api.test.ts` |
| Documentation | `docs/M6-CONTRACTS.md`, this report, `README.md` |

No new dependency, microservice or financial engine was introduced. Git reports the project as untracked, as it did before this continuation; no commit or clean tracked-diff claim is made.

## Supported behavior

Revenue decrease, supported operating-expense increase, profile-based collection delay and bounded combined/custom cases reuse M3 transformations and M2 calculations. Zero stress is explicit. Fixed revenue/cost amounts can originate from approved forecasts; no forecast refit occurs. Payroll/headcount, derived drivers and explicit settlement schedules are not overwritten by these templates.

Policies version the declared cash reserve, optional negative-cash rule and optional operating floor. Threshold comparisons are strict: equality is not a breach. Every finding retains its exact calculation evidence and policy version. Unknown values remain unavailable. Comparisons reject inconsistent baseline, currency, horizon, scope, financial basis or policy, and disclose failed children without discarding successful siblings.

Briefs copy stored authoritative numbers, source references, assumptions, risk evidence and limitations. They do not select a decision, invent unavailable metrics or imply a safety guarantee. See [M6-CONTRACTS.md](M6-CONTRACTS.md) for limits, rules, security and immutable artifact semantics.

## Automated results — final run

`npm run check` completed successfully after the final code changes.

| Check | Actual result |
| --- | --- |
| Complete automated suite | **470 passed / 0 failed**, 8 test files |
| Existing M1–M5 tests | **415 passed**, preserved |
| New M6 tests | **55 passed**: 36 domain/golden tests and 19 API/integration tests |
| Financial goldens/invariants | Passed, including unchanged source, amount/timing reconciliation, horizon tails, decimal rounding, threshold boundaries and brief/run equality |
| Security/isolation | Passed: role restrictions, cross-workspace reads/reference injection, child execution context and all nine tables' RLS |
| Immutability/replay | Passed: stored stress/brief replay, immutable tables, later policy/data/forecast/import-mapping changes |
| Lint | Passed |
| Typecheck | Passed: TypeScript and Angular template compilation |
| API production build | Passed |
| Angular production build | Passed; initial raw bundle total 380.34 kB, estimated transfer 88.76 kB |
| Migration | Eight migrations verified in tests; migration 008 also applied to local verification database |

Verification log: `../../work/m6-check.log` relative to the repository. Full test duration was 41.95 seconds. Results are from real PostgreSQL integration tests, not mocked persistence.

### Financial examples

For the synthetic three-month source with opening cash 100, monthly revenue 100 and expense 80:

| Case | Closing cash by month |
| --- | --- |
| Baseline / zero change | 120, 140, 160 |
| Revenue -20% | 100, 100, 100 |
| Expense +20% (automated fixture) | 104, 108, 112 |
| Collection delay +1 month | 20, 40, 60; 100 receipt retained beyond horizon |
| Revenue -20% plus delay +1 month | 20, 20, 20 |
| UI combined: revenue -20%, expense +10%, delay +1 month | 12, 4, -4 |

Boundary cases 99.99, 100 and 100.01 against reserve 100 passed. The API forecast integration succeeds with `FORECAST_PYTHON` set to a nonexistent executable during definition confirmation, stress execution and replay; later forecast generation and source edits leave the earlier brief unchanged.

## Browser acceptance — actual production builds

Synthetic workspace: `M6 Verification — Synthetic` (`6b0cf780-b424-408b-8391-54ab725de0dc`). No real company data was used.

- Chose published baseline run `33c56f8a-4ef7-4c5a-838a-f0463c7a49de`.
- Created explicit reserve/negative-cash/operating policy with review confirmation and source note.
- Reviewed and confirmed revenue-decline and combined adverse definitions.
- Prepared batch `962e7095…`; both children completed on attempt 1, with inspectable results.
- Compared baseline and both stresses. Baseline ending cash 160; revenue case 100; combined case -4. Equality at reserve 100 was met. Combined reserve breach began January and persisted three months; negative cash first occurred in March; no recovery was claimed beyond the horizon.
- Opened finding evidence: exact `periods[2].closingCash = -4.00`, stress run ID, policy ID and rule version were visible.
- Generated brief `ed309a87-19f9-4b48-bbb1-9a56a56d827f`; monthly cash/operating evidence, source assumptions and unavailable metrics were displayed.
- Reloaded the application, reopened the historical brief and ran verification: **“Historical brief matches its stored evidence exactly.”**
- Browser error log during the successful workflow: no errors recorded. A final intentional empty-definition submission was rejected with the expected validation message: “Add supported modifications or explicitly select the zero-stress reference.” Historical replay also passed after restarting the final API build.

### Responsive results

| Viewport | Result |
| --- | --- |
| 390 × 900 | Passed: page fits; comparison table scrolls within its container; brief text wraps after header correction |
| 768 × 900 | Passed: workbench and historical brief readable; no header overlap |
| 1440 × 900 | Passed: normal layout and 794 px print-preview content width |

Document widths observed were 375, 753 and 1425 px respectively (viewport scrollbar space excluded); none exceeded the viewport. The temporary viewport override was reset.

### Print/PDF acceptance — completed 23 September 2026

**Passed on the actual PDF:** [M6-Decision-Brief.pdf](../output/pdf/M6-Decision-Brief.pdf), five A4 pages, 128,669 bytes. The saved brief remains `ed309a87-19f9-4b48-bbb1-9a56a56d827f`; no financial data or application implementation was changed during this print-only follow-up.

The previous in-app printer-dialog limitation was resolved by capturing the application's actual rendered `app-root` and loaded stylesheet rules through the browser's read-only DOM interface, then printing that unchanged HTML/CSS snapshot with local Headless Chrome 153 (Skia/PDF). This uses the implemented Angular markup, print-media rules and stored brief content; it does not rebuild the report with a separate PDF template or recalculate its numbers. Browser-added date/URL headers and footers were disabled; the application's A4 page size and 16 mm margins were honored.

Every PDF page was rendered to PNG with Poppler at 110 dpi and visually inspected. `pdfplumber` additionally checked that all **112 expected content blocks** (headings, paragraphs, metric labels/values and table cells) from the rendered brief appear in the extracted PDF text. There were **zero missing blocks, zero blank pages and zero text boxes outside page bounds**. Three deliberate option page breaks produce the baseline, revenue and combined sections on pages 2, 3 and 4; the combined limitations continue clearly on page 5.

| PDF page | Inspected content and result |
| --- | --- |
| 1 | Title, preparation timestamp, complete brief/baseline/comparison IDs, policy version/ID and declared thresholds/source. All legible; no clipping or overlap. |
| 2 | Baseline run/source IDs, 160.00 ending cash, 120.00 minimum cash, 80.00 first-month outflows, three monthly rows, assumptions and financial limitations. Clean section start and complete content. |
| 3 | Revenue stress run/source IDs, 100.00 ending/minimum cash, monthly rows, 20% stress assumption/target and source limitations. Clean page break; headings remain with their content. |
| 4 | Combined run/source IDs, -4.00 ending/minimum cash, 88.00 outflows, monthly cash 12.00 / 4.00 / -4.00, three stress assumptions and all three risk findings/rule references. Negative signs, decimals, long IDs and final finding are readable within margins. |
| 5 | Continued source assumptions, operating-result and beyond-horizon limitations, unresolved-case disclosures, unsupported measures and final no-recommendation statement. No missing text, overlap or clipped ending. |

Evidence is retained under `docs/evidence/m6-print/`: five inspected page images, the rendered source snapshot and [machine verification results](evidence/m6-print/verification.json). PDF SHA-256: `f0e9fdcabf88ee54d7aca75eeeb006988c17321d849323a8e3d908572a1689bd`.

No print defect was found in the generated output, so no implementation fix or rebuild was necessary. Directly affected checks were the actual PDF rendering, five-page visual inspection, content completeness and geometry checks; all passed. The previously verified **470 passing tests / 0 failures**, lint, typecheck and production builds remain the applicable code results and were not unnecessarily rerun for artifact/documentation-only changes. Acceptance covers this actual synthetic three-option brief in Chromium; it does not claim certification of every printer driver or every future document length.

## Definition of Done

| # | Requirement | Status/evidence |
| --- | --- | --- |
| 1 | Explicit reviewable versioned stress definitions | Pass — immutable definition history and validation |
| 2 | Existing stress financial semantics | Pass — M3 transforms/M2 engine |
| 3 | Safe batches and visible child failures | Pass — partial failure, retries, rollback and cancellation integration tests |
| 4 | Authoritative deterministic engine | Pass — no replacement calculator |
| 5 | Forecast reuse without refitting | Pass — Python-unavailable API integration |
| 6 | Explicit versioned risk policies | Pass — review, source, optimistic revision and Owner permission |
| 7 | Finding evidence and policy links | Pass — stored references and browser evidence inspection |
| 8 | Numerical threshold boundaries | Pass — below/equal/above tests |
| 9 | Breach/recovery timeline | Pass — grouped episodes, persistence, unknown and horizon behavior |
| 10 | Compatible comparisons | Pass — domain rejection cases and API baseline/policy checks |
| 11 | Explicit traceable reserve | Pass — policy source/version displayed; Owner confirms workspace threshold |
| 12 | Stored-evidence deterministic brief | Pass — no AI generation |
| 13 | Exact authoritative brief numbers | Pass — field equality and replay tests |
| 14 | How-calculated lineage | Pass — source/run/policy/field-path evidence |
| 15 | Immutable history | Pass — DB guards, replay and later-change integration tests |
| 16 | Workspace isolation/permissions | Pass — RLS and authorized API tests |
| 17 | Complete responsive workflow | Pass — actual browser journey and three required widths |
| 18 | Usable printable brief | **Pass — actual five-page A4 PDF rendered and every page inspected; 112 content blocks matched** |
| 19 | M1–M5 regression suite | Pass — 415 tests |
| 20 | New M6 tests | Pass — 55 tests |
| 21 | Lint/typecheck | Pass |
| 22 | Both production builds | Pass |
| 23 | Browser acceptance | Pass — workflow, evidence, historical reopening, responsive behavior and actual PDF acceptance |

## Known limitations and deferred work

- Monthly, single-currency, company-scope planning only; a monthly positive closing balance does not prove within-month liquidity.
- Bounded fixed-amount/profile-based stress only. Unsupported business-driver changes require existing supported M3 workflows or future scoped work.
- Explicit run/retry execution, 30-second lease and three-attempt limit; no distributed/background scheduler.
- Existing operating-result exclusions remain; no invented net profit, unit break-even, runway, stress payback, investment total or probabilistic confidence.
- PDF acceptance passed for the actual saved three-option brief. Other printer drivers and arbitrary future input lengths were not exhaustively tested. No known failing acceptance check remains.
- This is the existing development MVP, not a newly deployed production service. Earlier authentication/deployment limitations remain documented in README/security documentation.
- **Milestone 7 was not started.** No LLM/provider, AI recommendations, automatic selection, synthetic risk scores, Monte Carlo, optimization, reverse stress or sensitivity system was added.

## Final handoff

The code, automated checks, browser workflow and actual paginated PDF output have passed M6 acceptance. **M6 is complete and ready for M7. Work stopped after M6; M7 was not started.**

