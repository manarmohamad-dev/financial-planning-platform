# Targeted Page-Density and Composition Report

Date: 2026-09-28
Status: Implementation and requested automated verification complete; visual approval remains with the user. M7 has not started.

## Scope and checkpoint

Rollback reference preserved: `.local/pre-density-composition-20260928-133940.zip`.
This is a targeted composition pass, not a replacement design system. Checkpoint comparison identifies seven changed frontend files: `forecasts.html`, `decisions.html`, `stress.html`, `imports.html`, `planning.html`, `product-system.css`, and `locales/ar.ts` under `apps/web/src`.
No backend, API, route, permission, financial calculation, or component TypeScript changes in this pass. No fabricated results or new financial records were introduced for visual composition.

## Pages recomposed and real context surfaced

| Area | Changes | Actual data/context |
| --- | --- | --- |
| Forecasting | Three-column readiness/preview/context workspace; compact job history; prominent evidence-selection action; full original evidence/approval/hybrid controls in expandable editor | Confirmed version count, selected version count, version titles and lineage, actual eligibility state, existing job history. No output chart without a forecast artifact. Forecasting remains optional. |
| Scenario Builder | Existing setup moved into dashboard; compact start-decision state; saved result charts and context; history and comparison counts | Existing published baseline options, immutable saved-run currency/horizon/source reference, real baseline/scenario trajectories and saved records. A blank new-decision selector is explicitly distinguished from a restored saved calculation. |
| Risk Center | Source selector, explicit policy and stress context side by side; compact policy rules with expandable sources; comparison preview and history | Available completed sources, saved comparison/definition/brief counts, actual policy thresholds/severities, real saved comparison trajectories. No invented risk score or gauge. |
| Decision Briefs | Independent creation/readiness, selected-brief context and library; available comparisons and limitations modules | Existing brief title/time, options and policy-rule counts, actual policy and saved comparison records. Risk charts are not repeated as the brief-library identity. |
| Data & Imports | Upload/action, current stage/context and compact histories in three columns; original detailed workflow below | Real file/dataset counts, current inspection/mapping/validation/confirmation state, existing upload role gates. Six-step workflow retained. |
| Lower Baseline | Evidence summary plus next actions in 2:1 layout; limitations grouped in disclosure | Actual monthly period and evidence-movement counts; complete statement, tail movements, lineage, source inspection and deterministic replay remain accessible. |

Composition principles: multiple meaningful modules, 3-column desktop grids and 2:1 evidence layouts, content-sized panels rather than fixed empty heights, compact zero-record histories, clear next action, progressive disclosure of technical detail. Existing palette, typography, shell and navigation retained. Responsive grids collapse to one column.

## Preserved areas

- Overview source is byte-identical to the checkpoint; visually reviewed with populated existing fixture data.
- All Baseline template content preceding the lower evidence wrapper is identical after normalizing line endings. Top KPI/trajectory composition was visually reviewed.
- The Decision Brief article template is unchanged after normalizing line endings. Added CSS is screen-scoped; existing print contracts/styles are preserved.
- Owner/Manager/Analyst responsibility model, tenant isolation, deterministic engines, unknown-versus-zero semantics, history and source lineage unchanged.
- No stored user/source values were translated. New application labels have Arabic translations; identifiers remain available in details.

## Visual/browser verification

Used the already-running isolated acceptance preview on localhost:3100 and its existing synthetic company records. No reseeding or production/user-data mutation. This fixture is explicitly synthetic; its baseline ending cash is 160 EGP, minimum cash 120 EGP and last-month operating result 20 EGP. These are existing calculated records, not values copied from design references.

Desktop review at 1440 x 1000:
- Populated Overview: KPI hierarchy and trajectory preserved.
- Populated Baseline: top unchanged; lower evidence summary and next actions reviewed. Expanded calculation evidence exposes all 12 fixture movements and source inspection actions.
- Forecasting: pre-forecast state, one confirmed version, zero selected versions/jobs. Primary action opens the original evidence editor. No fake forecast chart.
- Scenario: no active scenario state and restored existing scenario-run state inspected. Real chart comparison and unavailable funding-gap state retained.
- Risk: unselected-source prerequisite state and saved-comparison state inspected. Policy card was too tall during review; only its sources/disclosures and spacing were compacted, then visually rechecked.
- Briefs: existing library with no selection and selected saved brief inspected; distinct brief context and print controls remain available.
- Imports: zero-file/dataset state inspected; upload action, stage and histories remain compact.
- English/LTR Forecasting inspected; Arabic/RTL inspected across affected pages, including mixed English stored titles and EGP values.
- Representative mobile Forecasting inspected at 390 x 844 in English and Arabic. Document width 375 px within 390 px viewport: no page-level horizontal overflow. Workflow stages retain intentional internal horizontal scrolling. RTL computed direction confirmed.
- Keyboard spot check: Tab from the primary forecasting action reaches Data & Imports with a visible solid focus outline. This is a representative check, not a full accessibility certification.
- Temporary viewport override reset; Arabic Forecasting left open for review.

Evidence screenshots: `docs/evidence/density-composition/`.
Important files: `forecast-ar.png`, `forecast-en.png`, `forecast-mobile-ar.png`, `forecast-mobile-en.png`, `scenario-before-ar.png`, `scenario-after-ar.png`, `risk-after-ar.png`, `brief-library-ar.png`, `brief-selected-ar.png`, `imports-ar.png`, `baseline-top-ar.png`, `baseline-lower-ar.png`, `overview-regression-ar.png`.
`scenario-before-ar.png` and `risk-before-ar.png` record intermediate review states before the final compact-card adjustments; final restored-scenario/risk screenshots are the corresponding after images.

## Exact automated results

Targeted verification preceded final checks:
- Angular template compilation: passed.
- `tests/ui-presentation.test.ts`: 9 passed, 0 failed.

Final `npm run check` completed successfully after the last CSS fix:
- ESLint: passed.
- TypeScript and Angular template typechecks: passed.
- Full Vitest suite: **489 passed, 0 failed, 11 test files**, 22.37 seconds.
- API production build: passed.
- Angular production build: passed, 5.596 seconds; initial bundle 672.17 kB, estimated transfer 134.59 kB.
- Log: `.local/density-final-checks.log`.

Node and the existing bundled Python runtime were explicitly placed on PATH for forecasting tests. No dependencies/configuration changes were needed.

## Limitations / states not visually verified in this pass

- No saved forecast artifact or populated import dataset exists in the review fixture. Completed forecasting, upload/mapping/validation and hybrid-baseline states were not recreated for screenshots; existing automated regression coverage passed.
- Scenario before/after means opening existing stored results, not creating a fresh financial record during this pass.
- The completely empty brief library and every role-specific UI variation were not separately re-exercised. Existing permission gates were retained and full automated tests passed.
- Mobile verification is representative Forecasting in both languages, not an exhaustive device/page matrix. English review is representative Forecasting, not every affected page.
- Actual PDFs were not regenerated or re-inspected in this composition-only pass. The printable article is unchanged and new layout styles are screen-only; no new PDF acceptance claim is made.
- Browser visual acceptance belongs to the user. This report does not claim pixel-for-pixel equivalence to reference images or final design approval.

## Final status

Requested targeted composition work is complete with the limitations above. No M7 or AI functionality started. Await user visual review before further design changes.
