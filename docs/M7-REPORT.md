# M7 implementation and acceptance report

Date: 2026-10-07 (Africa/Cairo)

## Latest continuation — 2026-10-10
**M7 NOT COMPLETE. Approved guided fallback implemented; free-text extraction not accepted. Final regression coverage: 610 passed, zero remaining failures (full run plus Python-PATH-corrected rerun of the two affected files).**

Read [bounded final gate and guided fallback evidence](M7-GUIDED-20261010.md) first. The last isolated free-model gate returned 8/8 valid provider schemas but only 1/8 semantically accepted results (0/6 complete requests). Main Groq/API/validation unchanged. Guided Scenario Builder now opens the existing manual review workflow without AI; saved extraction history preserved. No billing, Neon changes or deployment.

## Previous status (retained history)
**M7 NOT COMPLETE. Latest full regression: 599 passed, zero failures (16 files). The new 14-case bilingual extraction sample achieved structural validity 10/14 (71.4%), semantic/correct-outcome success 4/14 (28.6%), and only 2/10 fully specified requests succeeded. Strict validation was not weakened. No Final Expert Review or Deployment.**

Latest authoritative continuation: [Extraction root cause, per-attempt analysis, changes and final results](M7-EXTRACTION-20261007.md). This supersedes earlier totals/status below. One additional failed pilot and two offline revalidations are disclosed separately. The bounded completeness guard now rejects the detected expansion omission, but extraction functionality remains unreliable. Prior grounded-explanation, saved-history and PDF evidence is preserved; it does not establish current extraction acceptance.

## Preserved scope
M1–M6 deterministic financial engines, Python forecasting, Neon, existing roles and tenant isolation, original UI foundation and original rollback checkpoint are preserved. Migration009 was applied only to isolated test databases. Main application database and Neon were not migrated. No payment, upgrade or public deployment. Provider key remains in ignored local configuration, never shipped to Angular/Git.

## Delivered
- Optional scenario extraction, clarification, assumption review, saved-result explanation and separately labelled brief narrative.
- Strict JSON task schemas with local validation, source aliases, exact quoted evidence, explicit input checks, ratio normalization validation, reference-only narrative numbers, Arabic validation, provider reference restrictions.
- Server-only Groq integration: selected model, ZDR prerequisite, bounded requests/response/timeouts, no tools, no automatic retries or paid fallback, disabled/missing-key manual path.
- RLS-protected immutable assistance artifacts; authorization before and after inference; no DB transaction held during external calls; source revision checks; sanitized audit; concurrency/quotas/idempotency.
- Explicit consent and context preview, immutable history reopening, clarification continuity, human-reviewed ordinary scenario draft creation. No automated confirmation, run, publication or decision.
- Optional panels within existing Baseline/Scenario/Risk/Brief pages. No new top-level page or redesign. EN/AR translations and print exclusion.

## Defects found and fixed during acceptance
1. Provider JSON-schema compatibility for nullable unions.
2. Percentage magnitude10 rejected when input10% requires ratio0.10.
3. Arabic punctuation-only segments incorrectly rejected by language validation.
4. Source aliases invented by model rejected; provider schema additionally constrains references.
5. Reused clarification question IDs no longer overwrite prior answers; outgoing preview uses same merge as inference.
6. History restores request text; edited structured proposal drives visible review summary; consent resets when request/language changes.
7. Percentage review displayed EGP incorrectly: now shows Decimal ratio and readable operation labels.
8. Applied draft previously stayed on baseline route/dirty state: now navigates after pending operation ends to exact draft URL.
9. Prompt clarifies contiguous quotations, new-entry branch fields, explicit false payback and minimum projected cash terminology. Narrative transport schema excludes digits from prose; server validation remains mandatory.

## Automated evidence
- Full suite: **547 passed, 0 failed, 13 test files**. Includes original M1–M6 and financial golden/invariant suites. `output/m7-regression-final.log`.
- Subsequent affected provider/contracts/UI checks after final changes: **53 passed, 0 failed, 3 files**. This is a subset, not53 additional tests.
- M7 API integration subset:14 passed,187 skipped; included in the full suite total.
- Lint: passed. API+Angular typechecks: passed. API production build: passed. Angular production build: passed. `output/m7-build-final.log`.
- Final full suite preceded last isolated transport-schema/UI fixes; affected tests and typechecks/builds rerun afterward. Do not imply a fresh full suite after those final edits.

## Live Groq evidence
Twenty named case/language combinations have successful saved attempts: sales, hiring, spending, expansion, combined, missing inputs, injection, assumption review, result explanation and brief narrative in EN/AR. See `output/m7-live/acceptance-summary.txt` and individual JSON reports.
These results accumulated across prompt refinements, not a single clean20/20 run of identical final settings. Historical failures remain in attempt files. Provider400/schema errors, truncation,429, malformed quotes, missing fields and prose errors occurred and were rejected. No rejected output became an applied financial decision.
Latest configuration: gpt-oss-120b, temperature0, reasoning_effort low,2000 completion tokens,20sec,64KiB. Official support for reasoning settings: https://console.groq.com/docs/reasoning . No claim that settings guarantee deterministic or semantically correct AI prose.
Manual review found and corrected wording that confused minimum projected cash with a required threshold. Local schema validation cannot prove every qualitative sentence correct. User review remains essential.

## Browser evidence
On an isolated real Node/PostgreSQL environment with actual deterministic synthetic fixtures:
- Owner, Manager, Analyst sign-in and role-specific navigation inspected. Manager/Analyst do not gain Owner management controls.
- Existing saved scenario values/charts preserved; optional AI panel after page heading.
- EN/AR and RTL checked; native Enter opens disclosure; consent gates request.
-390px viewport measurement:375px client width and375px scroll width, no document horizontal overflow. This is not a complete mobile/accessibility certification.
- Real Owner request sent to Groq from UI; artifact ce69f16a-0c2c-453d-bb6c-db3a617cda41 reviewed; draft f08b18ca-51fb-4be6-93e5-6819119d074f saved.
- Exact URL ends `decisions?draft=f08b18ca-51fb-4be6-93e5-6819119d074f`; saved draft count2, saved run count1; no new confirmed version or calculation automatically created.
- Reopened assistance without new provider call; corrected ratio display verified; unsaved-change guard observed.
- All IDs above belong to isolated disposable acceptance data, not Neon or user companies.

## Final acceptance continuation - 2026-10-06

**M7 NOT COMPLETE: actual PDF inspection found a print-pagination defect. No deployment started.**

### Environment and changes
- Isolated Chromium154 via Playwright, actual production Angular assets and Node API, disposable local PostgreSQL with non-superuser/NOBYPASSRLS runtime role. No Neon connection or Groq request in this continuation.
- Extended only `scripts/m7-browser-review.ts` to seed a real deterministic stress comparison/brief and run a second AI-disabled API. All synthetic results came from existing financial services.
- No application implementation, financial engine, UI template or print CSS changed. Existing checkpoint preserved.
- Acceptance helper lint and TypeScript `tsc --noEmit`: passed. Full regression/builds not repeated because application sources did not change; earlier exact results above remain established.

### Browser results and coverage
-24 role/language/page cases: Owner, Manager, Analyst x EN/AR x baseline assumption review, scenario-result explanation, stress-comparison explanation, brief narrative. Each opened its exact real source, disclosure using Enter, verified consent-disabled request and successfully previewed outgoing context (HTTP200).
-Six additional role/language scenario-extraction cases: Tab reaches textarea; preview HTTP200; consent enables request; editing invalidates consent and disables request again.
-All24 narrow pages measured390px viewport/client/scroll widths: no document horizontal overflow. EN=LTR, AR=RTL.
-Reduced motion active; six extraction cases measured animation `none`, transition `0s`. Focused M7 keyboard/responsive checks, not full WCAG certification or screen-reader testing.
-Provider disabled: visible unavailable notice; manual scenario replay HTTP200 and `matches:true`; zero `/ai/requests` calls. No fake provider/financial fallback.
-Evidence: `output/m7-final-acceptance/browser-matrix.json`, `extraction-keyboard.json`, `provider-disabled.json`,30 screenshots plus brief/manual screenshots.
-Automation initially reached the unchanged200/min API limiter; continued only unfinished checks more slowly. A synchronous enabled-button assertion was changed to wait for Angular rendering; no application fix required.
-These checks cover source/context/consent/keyboard/fallback paths. They do NOT claim fresh successful-output/history journeys for every task and role. Prior live-provider and Owner extraction/draft/history evidence remains as recorded above.

### Actual PDF evidence: every one of12 pages inspected
Generated by Chromium `page.pdf` from the actual saved Decision Brief route and application print CSS, rendered with Poppler, visually inspected page by page. Real PDFs, not HTML screenshots.

-English: `output/pdf/m7-decision-brief-en.pdf`,6 A4 pages.
-Arabic: `output/pdf/m7-decision-brief-ar.pdf`,6 A4 pages.
-Brief `0fd6b56e-80c8-4510-8ae3-cf5e4375058d`; baseline `98c98b41-8c3b-462d-94b6-e679f122279c`; scenario run `a12070e3-342f-4d69-b522-8ecd0c082410`; comparison `7e017f4b-3b89-4e0e-b3fd-53499d005e1b`. All IDs present in both extracted PDFs.
-Render evidence: `output/m7-final-acceptance/en-page-1.png` through `en-page-6.png` and corresponding ar-page1 through6; `pdf-content-checks.json`.
-Both languages: p1 identity/policy; p2 baseline64000 ending/28000 minimum/22000 first-month outflow; p3 scenario48000 ending and assumptions; p4 two continuing limitations; p5 zero-change stress matching48000 ending; p6 concluding limitations.
-No missing IDs/figures, overlapping text or clipped financial values observed. Arabic letters join correctly; RTL headings and amounts readable. Stored English descriptions remain English. AI/Groq panels absent from deterministic print as designed.
-**FAIL: page4 in BOTH PDFs contains only two continuation lines and is otherwise almost empty; the following option forces a page break.** Page1 also includes a redundant application heading and concatenated workspace/currency/role context. English has a surrounding border absent in Arabic. Content is preserved, but pagination/presentation acceptance fails.
-Existing M6 print rules include `apps/web/src/stress.css` `.brief-option { break-before: page; }` plus shell print styles. No change made because the user explicitly prohibited modifying M1-M6. Required follow-up: narrowly scoped print-only pagination/shell correction, preserving evidence/calculations, then regenerate and inspect EVERY EN/AR page.

## Remaining acceptance - latest status
1. CLOSED: authorized print-only correction passed actual EN/AR every-page inspection; see latest section below.
2. OPEN: successful Arabic saved-answer and brief-narrative browser coverage. Provider returned invalid/unavailable responses in this isolated environment. Do not substitute fixture responses or claim missing cases passed.
3. OPEN: qualitative explanation quality: a structurally valid saved English explanation inferred a missing funding-gap assumption. Manual review rejected that conclusion. Requires targeted M7 quality investigation before completeness can be claimed.
4. No Final Expert Review or Deployment.

## Operational limitations
Free-provider quota and availability can reject requests; manual tools remain available. Process-local admission limits are suitable for one API process, not coordinated multi-instance quotas. AI narratives are additional on-screen annotations and excluded from M6 print output. Main DB migration/config enablement must be performed deliberately after acceptance; never enable against Neon as an incidental test step.


## Authorized print-only correction - 2026-10-06
User authorized minimal M6 print layout changes. `stress.css` hides the page heading during print and removes forced page breaks before each option. `styles.css` hides only the shell evidence strip and main focus outline during brief printing. Screen styling, templates, all data, API contracts and calculations unchanged (11 inserted lines,1 removed).

Actual regenerated EN and AR PDFs each have4 A4 pages. All8 pages visually inspected: no near-empty pages, clipping, overlap, redundant shell title or broken Arabic shaping/RTL. Tables spanning pages repeat their column headings. Every source-ID occurrence and numeric occurrence from the old PDFs is retained, except the removed workspace label's digit in M7. Evidence: `output/m7-final-acceptance/pdf-final-checks.json`, `pdf-preservation.json`, `final-en-1.png` through4 and `final-ar-1.png` through4. Old failing PDFs retained as before-en.pdf and before-ar.pdf.

Angular production build passed after the CSS change. Prettier checks for both CSS files passed. Full regression/API build not repeated: no TypeScript, API or financial implementation change. PDF acceptance is now CLOSED; remaining saved-output/history browser verification is in progress.

## Saved-answer continuation: real blocker found
New requests used only synthetic data through the actual UI/API/Groq integration. Successful English assumption-review and result-explanation artifacts were saved and reopened by Owner, Manager and Analyst:6 browser cases passed, exact persisted summary and source/model/artifact evidence visible, zero new provider requests while reopening, no draft-apply control on these annotation tasks. Evidence: `output/m7-final-acceptance/history-matrix.json` and history screenshots.

**Content review FAIL:** artifact `feeb53f8-e249-4939-a855-0c7bc35199af` says: "The analysis assumes no funding gap, yet the evidence marks this metric as not available." The first clause is not supported by the source: `not_available` means unassessed, not an assumption of zero. Numeric fact references remained correct, but structural validation did not reject this qualitative claim. This output is not accepted as a quality pass. No calculation, confirmation or financial decision resulted.

Other real attempts were rejected with sanitized AI_OUTPUT_INVALID / AI_PROVIDER_UNAVAILABLE errors. Initial and explicit repeat attempt evidence is preserved in failed-*.json and retry-failed-*.json. Repeats were acceptance actions, not an application automatic-retry mechanism. The current provider/API responses do not expose enough raw output to determine the precise invalid-output cause; no cause is invented here. Earlier20-case provider evidence remains historical, not proof that today's more complete contexts pass.

No API, provider prompt, schema, financial logic or permissions were changed to force acceptance. M7 remains NOT COMPLETE because PDF success cannot override the demonstrated qualitative defect and incomplete saved-output coverage. Stop before final expert review/deployment.

Final new-attempt totals:11 real requests,2 saved artifacts,9 rejected responses (6 AI_OUTPUT_INVALID,3 AI_PROVIDER_UNAVAILABLE). Only1 of the2 saved artifacts passed qualitative review; the explanation is explicitly rejected above. Final machine-readable acceptance status: `output/m7-final-acceptance/final-status.json`.


## Latest reliability outcome — 2026-10-07
**M7 NOT COMPLETE — safety/storage/browser progress passed; explanation quality remains open.**

- Funding-gap claim traced to unsupported model prose that the old structural validator accepted. Current M7 claim/prose boundary rejects unsupported conclusions and preserves unavailable facts.
- Arabic failure reproduced as local acceptance PostgreSQL WIN1252 storage error22P05; isolated test setup corrected toUTF8. Neon unchanged. Provider-schema errors and storage failures now have separate sanitized classifications.
- Eight latest direct Groq cases passed (EN/AR extraction, missing inputs, adversarial instructions, result/risk evidence), plus six saved UI task/language cases. Initial schema failure/retest is retained; this is not a perfect first-attempt success rate.
-18 saved-history role/language/task cases and6 mobile cases passed. Manual replay with AI disabled matched. Prior all-page EN/AR PDF acceptance remains valid and was not redundantly rerun.
-567-test full regression passed earlier in this reliability pass; subsequent affected suites:65 unit/contract/provider tests and16 integration tests passed. Latest lint/typechecks/API build passed; prior Angular production build preserved (no later Angular changes).
-Remaining: safe output is too generic to count as useful assumption review/narrative explanation. Final-settings primitive-family live acceptance must follow the eventual quality fix. No reduction of that criterion is accepted.

Full evidence, root causes, exact limits and next continuation point: [M7-RELIABILITY-20261007.md](M7-RELIABILITY-20261007.md).

