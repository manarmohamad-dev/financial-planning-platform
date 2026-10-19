# Final page-composition pass

Date: 2026-09-28

## Status
Implementation and the browser checks described below are complete. User visual acceptance is pending; this report does not declare the design approved. M7 was not started.

Checkpoint: `.local/pre-page-composition-20260928-095354.zip` (preserved).

## Structural changes and reference mapping

| Page | Reference | Structural change |
| --- | --- | --- |
| Financial Baseline | Image 2 | Completed-run selector and visible saved-record rail alongside real KPI outcomes and trajectory; editing, reserve/version controls and detailed calculation evidence remain expandable. |
| Forecasting | Image 1 | Separate historical-data setup, forecast-preview area, available confirmed versions and job history. Actual forecast chart moves to the preview panel when available. Optional forecasting and reviewed-assumption fallback remain explicit. |
| Scenario Builder | Images 3–4 | Actual outcome metrics precede the workspace; baseline/scenario charts move ahead of long setup/review forms, alongside saved-run/comparison context. Full manifests remain in source disclosure. |
| Risk Center | Image 5 | Saved-comparison/brief rail and real source/comparison trajectories; full policy findings and comparison table precede expandable editing controls. No synthetic risk score or invented risk factors. |
| Decision Briefs | Image 6 | Brief/comparison library with counts from real records, first-two-option trajectory preview and Risk Center handoff. Complete original brief article remains below, including assumptions, limitations and all options. |
| Data & Imports | Image 7 | Upload/preview/mapping/review work area beside actual file and confirmed-dataset history. Original upload restrictions, validations and lineage actions remain intact. |
| Workspace chooser | Supporting first-use composition | Existing workspace cards and demo entry grouped beside company creation, with join/invitation below; no invented spaces or onboarding steps. |

The references guided composition, not business content. The layouts intentionally omit unsupported forecast accuracy, collaboration counts, risk meters and decorative financial trends. This is not a pixel-identical reproduction of the illustrated references.

Shared record history now supports expanded display and places full identifiers behind source disclosure. Existing data is retained. New CSS is screen-only and uses the established palette. Overview files were not changed.

## Browser verification

Used the project's existing `scripts/saas-preview.ts` fixture workflow in a new isolated local acceptance database. A local-only copy redirected its metadata output to `.local/composition-acceptance.json`, preserving previous acceptance metadata and databases. The normal company environment on port 4200 was not reseeded. No screenshot values were copied into application data.

Reviewed Arabic/RTL at 1440 × 1000:

- Populated Baseline: real saved run, ending cash 160 EGP, minimum cash 120 EGP and operating result 20 EGP.
- Populated Scenario: real baseline/scenario comparison; scenario minimum cash 100 EGP, minimum-cash difference -20 EGP, unavailable funding gap preserved.
- Risk: saved comparison, real policy/threshold table and findings; matching chart scales across options.
- Decision Brief: saved brief library/context and actual option trajectories.
- Forecasting: existing confirmed planning version, no forecast jobs/artifacts; reviewed actual empty preview and setup state.
- Imports: no files/datasets; reviewed actual upload and empty libraries.
- Workspace chooser: existing synthetic company, demo entry, create and join controls.

English/LTR: saved Scenario page and comparison.

Responsive: representative Arabic Scenario at 390 × 844 and 900 × 900. Document width equaled scroll width (375/375 and 885/885 CSS pixels respectively). Charts retain local horizontal scrolling on narrow displays. Native keyboard Tab produced a visible solid focus outline. Existing hover/pressed/disabled and reduced-motion styles were retained; exhaustive hover testing and OS-level reduced-motion emulation were not performed.

Saved screenshots: `docs/evidence/page-composition/` (Baseline, Forecasting, Scenario EN/AR, Risk and findings, Brief, Imports, chooser, mobile and tablet).

## Defects corrected during review

- Generic sidebar styling leaked into newly added content asides: scoped reset applied.
- Paired charts were initially too tall; changed to desktop columns and increased chart-label sizing.
- Source disclosure styling was too prominent: made compact without removing IDs.
- Empty history blocks carried excessive padding: reduced within the composed workspaces.
- New Risk sections inherited sticky positioning from print-toolbar controls, causing overlap during scrolling. Explicit screen-only static positioning fixed it. Browser recheck confirmed sections no longer overlap: preceding panel bottom 454.70px, next section top 472.70px.
- Missing Arabic translation detected by the targeted test was added.

## Automated results

| Check | Final result |
| --- | --- |
| Full M1–M6 regression suite | 489 passed, 0 failed, 11 files |
| Targeted presentation/localization tests after template changes | 9 passed, 0 failed |
| Repository lint | Passed |
| Typecheck (API/shared TypeScript + Angular) | Passed |
| API production build | Passed |
| Final Angular production build after overlap fix | Passed, 7.657 seconds |
| Final initial bundle | 654.56 kB; estimated transfer 132.60 kB |

First full test attempt had 23 failures because `python` resolved to the Windows Store alias. Rerunning with the already-installed Python runtime on this process's PATH passed all 489. No financial/backend code or dependencies were changed to resolve this environment issue. Later changes were template/CSS/localization only, checked with typecheck, targeted tests and production builds; the final CSS-only positioning fix required the final Angular build and browser recheck.

## Preservation and limits

- No API, backend, financial calculations, permissions, responsibilities, routing identity or tenant-isolation implementation changed.
- `stress.ts` changes are presentation-only chart-period accessors and importing the existing chart component; all financial values still come from saved engine results.
- Printable Decision Brief article was compared with the checkpoint and is unchanged. New dashboard chrome is hidden through existing print-control rules. No new PDF generation/inspection was performed; this is not a new PDF acceptance claim.
- Populated forecast/hybrid and import mapping/validation screens were not visually exercised because these records were absent from the isolated fixture environment. Their regression coverage passed.
- Full accessibility, every role/state, every viewport and twelve-month chart-label density were not exhaustively visually tested.
- Risk/Brief preview charts show the first two options explicitly; full comparison/brief evidence retains all options below.
- Source titles remain in their stored language, including English fixture titles. No source values were translated or rewritten.
- Final visual acceptance belongs to the user. Stop here; do not begin M7.
