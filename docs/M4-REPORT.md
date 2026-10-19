# Milestone 4 — Completion report

**Status: COMPLETE — Ready for Milestone 5. M5 was not started.**

Final verification: 17 September 2026, Node 24.21.0, PostgreSQL 18, existing Angular/Express application. This report covers M4 only and preserves the completed M1–M3 financial contracts.

## Continuation point and completed work

At the final continuation, M1–M3 and the M4 parser, mapping API, six-table migration, Angular workbench and baseline integration already existed. The interrupted work was verification, acceptance fixtures, security edge cases, browser acceptance and documentation. The project was not recreated or scaffolded. Git reports the project as untracked; there is no tracked baseline from which to present a meaningful diff.

Completed the remaining M4 tests and browser workflow, corrected defects described below, and updated the README and import contract/report. No alternative architecture or second financial engine was introduced.

## Implementation and architecture

`Original file → bounded structural parser → explicit sheet selection → deterministic suggestions → human-reviewed mapping → financial validation/capabilities → immutable mapping/dataset → existing M2 planning version → M2 baseline / M3 scenario`.

Owners and Analysts supply and confirm imports; Managers inspect and use confirmed data. Mapping suggestions never confirm meaning. The system preserves original file bytes/hash, actor/time, sheet and row/column coordinates, original evidence labels, mapping version, exclusions, review assumptions and accepted warnings. New imports create standalone datasets, with explicit source selection and overlap warnings; they never overwrite historical versions.

### Modules and files

- `packages/imports/src/model.ts`: versioned mapping/lineage/validation contracts and limits.
- `packages/imports/src/parser.ts`: bounded CSV/XLSX value parser, structural inspection and deterministic suggestions.
- `packages/imports/src/normalize.ts`: explicit financial interpretation, source conflict checks, monthly normalization and M2 capability evaluation.
- `apps/api/src/import-service.ts`, `import-routes.ts`: tenant-authorized upload, mapping drafts/versions, validation, dataset confirmation/replay and templates.
- `apps/web/src/imports.ts`, `imports.html`: upload/preview, review forms, blockers/warnings, capabilities, history, templates and baseline handoff.
- Existing `app.ts`, `main.ts`, `app.html`, `styles.css`: integration with the current API and navigation.
- Existing `decisions.html`: show month range/component in baseline item choices to distinguish imported monthly items.
- `tests/import-engine.test.ts`, `import-security.test.ts`, `import-helpers.ts`, `zip-fixtures.ts`; M4 API tests added to `tests/api.test.ts`.
- `tests/fixtures/imports`: 28 synthetic acceptance files and their manifest.
- `docs/M4-CONTRACTS.md`, this report, updated README.

Dependencies added for application parsing: `yauzl`, `fast-xml-parser`, `csv-parse`; TypeScript declarations for yauzl. No LLM or spreadsheet formula engine executes uploaded files.

### Database

Migration **006_imports.sql** adds `import_files`, `import_mapping_drafts`, `import_mapping_versions`, `import_datasets`, `import_mapping_templates`, `import_cancellations`. All use workspace RLS and composite tenant references. Only drafts are editable; immutable triggers protect confirmed content and originals. Migration applied successfully to the local database and isolated integration-test databases. No earlier migration was replaced.

## Final verification results

Command: **`npm run check` — exit 0**.

| Check | Final result |
| --- | --- |
| Automated tests | **359 passed, 0 failed**, 6 test files |
| Existing M1–M3 regression tests | 260 passed |
| M4 import domain tests | 58 passed |
| M4 hostile XLSX/security tests | 15 passed |
| M4 API/persistence/isolation tests | 26 passed |
| Golden mapping cases | 15 passed; normalized inputs and independent financial amounts checked |
| Financial/import invariants | All 17 required invariants covered and passing across domain/API suites |
| Lint | Passed, zero errors/warnings |
| Typecheck | Passed: TypeScript and Angular template compiler |
| API production build | Passed |
| Angular production build | Passed; initial bundle **327.65 kB**, estimated transfer **78.92 kB**, no budget warnings |
| Browser acceptance | Completed all 22 contract checks; details below |
| M5 | Not started |

The check output is retained in the conversation workspace at `work/m4-final-check.log`.

### Synthetic files and golden results

**28 synthetic input files** cover every required acceptance category plus recurring schedules, dated detail, supplied Forecast, branch scope and BOM/quoted decimals. Valid cases normalize after the documented review; malformed, unsafe, incomplete and ambiguous cases are blocked or require the specified acknowledgement. Rejection is the expected passing outcome for negative fixtures. See `tests/fixtures/imports/README.md` for the case-by-case manifest.

Golden tests cover period mapping, recognized revenue, direct cash receipts, payroll, rent, marketing, available/restricted opening cash, recurring commitments, approved Budget as assumption, unsupported Forecast and ambiguous Sales. They also verify locale/sign handling, exact dated-detail sums and delayed collection.

Independent service oracle: revenue 1000/1100/1200, payroll 300/month, rent 200/month, opening available cash 1000, same-month settlement → operating result **500/600/700**, closing cash **1500/2100/2800**. A January-only +10% sales scenario gives **1600/2200/2900**. These values were also observed in the browser.

### Required invariants

1. Deterministic normalization/replay from original parsed values and immutable mapping.
2. Existing confirmed dataset unchanged by later imports.
3. New upload/dataset receives new identities.
4. Old baseline/scenario results and replay remain unchanged.
5. Blank never silently becomes zero.
6. Currency mismatch cannot convert implicitly.
7. Total/detail and duplicate authority cannot silently double count.
8. Suggestions cannot substitute for confirmation.
9. Ambiguous financial meaning requires explicit review.
10. Actual, approved Budget assumptions and unsupported Forecast remain distinct.
11. Manual/import overlap requires explicit standalone source selection and acknowledgement.
12. Templates and template creation references are tenant scoped.
13. Incompatible structures cannot silently reuse templates.
14. Cross-workspace import metadata, originals, mappings, datasets and mutations fail.
15. Normalized entries reach original source amount/period coordinates and other mapped context.
16. Imported planning inputs use the existing M2 engine; M3 uses its published baseline.
17. Demo rejects company uploads and does not populate company imports.

### Security and isolation

Passed role enforcement for Owner/Analyst/Manager, anonymous denial, foreign IDs in both workspace URL contexts, original-byte isolation, RLS with absent/foreign context, immutable-row enforcement, composite foreign keys, idempotent confirmation, stale draft rejection and audit coverage without financial payloads.

Passed malformed/oversized CSV, unsupported extensions, filename validation, formula-like CSV remaining inert, ZIP encryption/active content/formulas/external relationships, encoded external mode, XML entities/depth/malformed XML, traversal, duplicate members, compressed expansion and archive-member limits. No formulas, macros or external requests are executed.

## Browser verification

Synthetic company: **M4 Import Verification — Synthetic**. Browser controls operated the real Angular UI and production API; no real company files were used.

| Contract step | Observed result |
| --- | --- |
| 1–3 XLSX / preview / sheet selection | Uploaded multi-sheet XLSX; Instructions and Service visible; selected Service |
| 4–6 Suggestions / edit / Sales ambiguity | Reviewed alias reasons; changed category selection; explicitly confirmed recognized revenue, basis and timing |
| 7–8 Validation / blocker resolution | Unreviewed mapping blocked; selected roles, numeric/date conventions, coverage and opening source resolved blockers |
| 9–10 Warning / capabilities | Partial-March warning required acknowledgement; operating/cash ready, Hiring/Expansion need inputs, FX unsupported |
| 11 Dataset confirmation | Immutable dataset and M2 planning version created |
| 12 Baseline | Prepared, published and calculated imported version; 1500/2100/2800 closing cash |
| 13 M3 scenario | January +10% sales; 1600/2200/2900, +100 cash difference each month |
| 14 Reload/history | Reopened saved dataset and mapping; normalization replay matched lineage |
| 15–16 Later import/history | New amounts in later file created another dataset; reopened original scenario retained the same results |
| 17 Template reuse | Compatible file received proposed mapping with semantic/coverage/source approvals cleared |
| 18 Changed structure | Incompatible CSV template rejected with explanation; no columns silently applied |
| 19 CSV | UTF-8 CSV uploaded, parsed and exposed for mapping; CSV confirmation covered additionally by API tests |
| 20 Malformed file | CSV_MALFORMED shown; failed import retained without creating dataset |
| 21 Unauthorized workspace | Authenticated browser request for a real foreign synthetic workspace returned HTTP 404 / NOT_FOUND |
| 22 Responsive | 390, 768, 1440 px: no page-wide horizontal overflow; large tables scroll in their own containers |

Measured document widths at the three viewport sizes: **375, 753, 1425 px** respectively (scrollbar space excluded). Mapping table content may be wider than its container, as intended.

Final production-build smoke check verified the corrected Sales choices: January, February and March were distinguishable by month range and component key. The browser's direct navigation to a JSON error response was not usable, so the authorization check used a small local test-only HTML button that called the same authenticated endpoint and displayed its HTTP response. This harness (`work/m4-production-preview.mjs`) serves the built Angular output locally; it is outside application source and is not a deployment feature.

## Defects fixed during implementation / final verification

- Missing recognized-activity months in dated detail or recurring input could imply zero; now blocked unless explicitly supplied.
- Imported Budget opening balances could be labeled observed; imported Basis must now be Actual, otherwise a reviewed manual assumption is required.
- Expanded entry lineage to include mapped currency/basis/scope/label/end-period coordinates.
- Rejected duplicate worksheet names and bounded numeric exponent parsing.
- Added decoded relationship-mode checking; entity-encoded or otherwise unsupported modes fail closed rather than relying on raw text matching.
- A blocked dataset could display evidence quality as reviewed; it now reports limited.
- Imported monthly Sales entries had identical scenario dropdown labels. Added month range and component key; **M2/M3 calculations and schemas were not changed**.
- Resolved two lint findings in filename/header regular expressions without weakening filename validation.

Test fixture corrections: retail COGS was initially incorrectly configured as a cash payment base; its golden mapping now uses explicit non-cash treatment and operating-only output. The encrypted ZIP test builder initially produced a malformed archive; it now includes the encryption header size so it tests the intended rejection. These were test setup defects, not changes to established financial rules. The M1 test expecting the old import stub now expects a missing-file-body response; migration count is six.

## Limits and known limitations

See `M4-CONTRACTS.md` for exact parsing/API limits. Key limits: **5 MiB upload; 10 sheets; 2,000 rows × 40 columns per sheet; 80,000 cells; 2,000 characters/cell; 250 ZIP members; 32 MiB expanded total / 8 MiB per part; 40 mapping rules; 150 normalized entries; 3/6/12-month horizons**.

One values-only table/sheet per dataset; no horizontal month-column unpivoting, automatic workbook joins, formula evaluation, currency conversion, branch consolidation, inventory accounting or statistical forecasts. Templates require exact structure and fresh review. Imports create standalone versions; no automatic merge. Recognition/cash meaning and completeness still require human judgment. Historical source overlap comparison covers the latest 50 planning versions; older immutable versions remain untouched and directly readable. CSV lineage uses parsed-record row numbers for multiline quoted records.

Import history and lineage are available, but detailed history is currently a technical JSON view. The duplicate-retention explanation is exposed through the mapping API; the UI offers row exclusion. Production retention/deletion, antivirus scanning, background workers and deployment are outside this milestone. Readiness for M5 means the graduation-project milestone is complete, not that the product is production-certified.

**Remaining M4 work: none. Final: Ready for Milestone 5. Milestone 5 was NOT started.**
