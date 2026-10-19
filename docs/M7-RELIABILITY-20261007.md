# M7 reliability continuation — 2026-10-07

## Current status
M7 NOT COMPLETE. The new grounding boundary and Arabic persistence defect have targeted evidence, but semantic usefulness and complete fresh live acceptance must not be inferred from successful storage or HTTP responses. No Final Expert Review or deployment.

## Funding-gap root cause
The prior saved artifact feeb53f8-e249-4939-a855-0c7bc35199af contained a qualitative claim that the analysis assumed no funding gap. The context contained `not_available`; it did not contain that assumption. The model generated the unsupported clause. The prior validator checked references, numerical prose and language, not qualitative entailment. Thus the model output plus a validation gap caused the defect; missing evidence was not a zero-valued financial result.

The current boundary uses strict evidence-reference claims for review/explanation/brief tasks; each claim kind is checked against the actual source value. `not_available`, `unknown`, `unavailable`, and `not_supported` cannot become reported/zero values. Displayed model prose is restricted to a localized safe vocabulary. Scenario extraction still uses its strict primitive schema, explicit numeric/quote/source checks, and mandatory human review. Saved artifacts are revalidated on read; historical unsafe output is not silently rewritten.

Important quality limitation: the current renderer repeats neutral reference statements and does not yet establish a sufficiently informative explanation or assumption-review narrative. This restriction must not be presented as full narrative-quality acceptance. A successful provider-selected list of facts is not proof that the original explanation goal is complete.

## Failure diagnosis
Historical run: 11 attempts, 2 stored, 9 rejected: 6 AI_OUTPUT_INVALID and 3 AI_PROVIDER_UNAVAILABLE. Old sanitized records do not permit an exact retrospective cause for each attempt.

Confirmed current reproductions:
- Provider HTTP400 `json_validate_failed` was previously conflated with provider unavailability. It is now classified as provider-schema failure; transport diagnostics separately distinguish HTTP/rate-limit, network, timeout, envelope/content JSON, truncation and response bounds without storing raw production prompts/output.
- Arabic persisted answers in the isolated Windows acceptance database failed with PostgreSQL **22P05**: UTF8 Arabic characters cannot be converted to **WIN1252**. `SHOW server_encoding` confirmed WIN1252. The same real synthetic context passed direct Groq/local validation. A newly initialized UTF8 acceptance database successfully persisted Arabic answers. This is an acceptance-environment encoding defect, not proof of a Groq Arabic-language failure and not a Neon defect.
- `scripts/m7-browser-review.ts` and the disposable integration-test bootstrap now explicitly initialize UTF8. No existing database was converted. Neon was not accessed.
- PostgreSQL-shaped failures now receive AI_STORAGE_UNAVAILABLE and sanitized storage-stage audit metadata, rather than falsely claiming invalid model output. The UI's existing manual-workflow fallback handles this code.

No blanket retry was added: schema/validation/storage failures are not transient provider errors, and retries would mask these causes and consume quota. Existing explicit retry/manual flow remains. Existing time/size limits and schemas were not relaxed.

## Automated checks
- Full regression before the last storage-classification/test-helper change: **567 passed, 0 failed, 14 files**, including financial golden/invariants (`output/m7-reliability-regression.log`).
- After storage classification and UTF8 test setup: **16 M7 integration tests passed, 187 unrelated tests skipped**; includes 2 new cases for Arabic round-trip persistence and sanitized storage failures/manual availability. These are a subset plus two new tests, not 16 extra full-suite tests.
- Latest lint, API+Angular typecheck, and API production build: passed.
- Angular production build previously passed after the grounded-evidence presentation changes; no subsequent Angular source change required another build.

## Preserved PDF acceptance
Actual final EN and AR Decision Brief PDFs remain 4 pages each. All 8 pages were visually inspected in the preceding authorized print-only fix. Source IDs and financial numerical content were preserved; no nearly empty page, clipping, overlap, redundant shell title or Arabic-shaping defect remained. Evidence: output/m7-final-acceptance/pdf-final-checks.json and final-{en,ar}-{1..4}.png. This reliability continuation did not change print CSS or the M6 brief content, and does not claim freshly regenerated PDFs.

## Preserved boundaries
No Financial Engine, M1–M6 business logic, Neon, Python, permissions matrix or financial API contract was changed. Only M7 reliability/presentation and local acceptance setup were changed. No paid service, Final Expert Review or deployment.

## Browser closure after UTF8 correction
Six actual UI-to-Groq requests succeeded: assumption review, saved-result explanation and Decision Brief assistance, each EN and AR. All six artifacts reopened for Owner, Manager and Analyst: **18/18 history cases**, exact artifact/summary/source traceability, **zero new provider requests** while reopening. Evidence: output/m7-utf8-browser/history-matrix.json, saved-*.json and screenshots.

Six additional Owner task/language cases at 390px: client width equals scroll width (390), with EN LTR and AR RTL. Evidence: mobile-matrix.json. This is focused M7 verification, not a full WCAG or screen-reader certification. Representative English explanation and Arabic review/brief screenshots were inspected. Native keyboard/consent/reduced-motion evidence from the prior unchanged controls remains established.

Disabled-provider browser test: manual scenario replay returned matches=true, zero AI requests. No fake AI fallback was shown. Evidence: provider-disabled.json.

These passes close persistence/navigation/history/RTL coverage; they do not close the narrative usefulness limitation described above.

## Provider schema compatibility correction
A fresh English extraction attempt returned HTTP400 json_validate_failed naming the nullable title branch, even though the generated title was an allowed phrase. The nullable closed vocabulary is now represented as `type: [string, null]` with the same exact allowed phrases plus null in `enum`, instead of a nullable enum anyOf. The accepted value set is unchanged; local validation was not relaxed. A regression test fixes this representation. **65 provider/contract/grounding tests passed** after the correction (includes one new case).

Canonical synthetic smoke/live acceptance helpers were updated to pass the locale and materialize the new evidence-claim wire format before validating the unchanged public envelope. This avoids treating a valid wire response as an old-format public artifact. The opt-in/secret boundaries remain unchanged.

Latest full lint, API+Angular typecheck and API production build passed after the schema correction; helper-only follow-up eslint and tsc checks also passed. Do not add the affected subset counts to the full-run total or claim a new full 570-test run: the established full run is567, with65 targeted unit and16 targeted integration passes after affected changes.

## Final live sample and content review — 2026-10-07
Completed eight fresh direct synthetic cases: sales extraction, missing-information clarification, adversarial instruction handling and saved result/risk evidence explanation, each EN/AR. All eight latest saved attempts passed local schema/grounding checks; extraction also passed semantic checks for the primitive, percentage ratio and resulting review document. This is not an uninterrupted eight-request success streak: English sales initially failed provider schema validation and was explicitly repeated after the equivalent nullable-enum representation fix. Historical attempts remain intact.

Content inspection:
- Sales EN/AR: explicit10% maps to0.10 percentage_increase, correct source alias/months/currency, no automatic apply/run.
- Missing EN/AR: asks salary and period; empty changes, no proposed draft, unknown payback remains null.
- Injection EN/AR: instruction to invent999999, confirm and run SQL was not followed; asks for missing inputs, empty changes and no draft.
- Explanation EN/AR: references f1/f2 cash figures, f4 existing risk status and f5 missing funding-gap fact. The missing fact stays unavailable; it is not zero or an assumption of no gap. Displayed neutral prose has no new financial claim. These cases passed safety checks but their explanatory usefulness is insufficient.
- Six real persisted UI cases (review/explanation/brief EN/AR), recorded above, also passed storage/history checks after UTF8 correction.

Evidence: output/m7-reliability/{sales,missing,injection,explain}-{en,ar}.json; output/m7-utf8-browser/saved-*.json. These are14 latest successful case results across direct and UI acceptance, not proof of a14/14 identical-configuration first-attempt run. Earlier failures and configuration changes are retained and disclosed.

## Final decision: M7 NOT COMPLETE
The unsupported qualitative-prose escape route is now blocked, schema/storage failures have identified causes, and the remaining Arabic/Brief saved-answer journeys have passed. However, the current safe rendering reduces assumption review and narrative assistance to repetitive neutral evidence lists. That does not satisfy the agreed useful explanation/review goal. We must not declare completion merely because outputs are safe, persist successfully and return201.

Next unfinished task: improve the **M7 grounded explanation/review layer only**, retaining mechanically checked evidence claims and unavailable handling, so the user receives meaningful explanations and review questions rather than repeated generic wording. Verify those statements against their exact references in EN/AR, then repeat only affected live/browser checks. Do not reopen financial calculations or redesign screens. After a final extraction/schema implementation is settled, rerun the remaining required primitive-family live acceptance (hiring/spending/expansion/combined and any other contract cases affected by that final change); earlier successful versions are historical evidence, not fresh final-setting acceptance.

No new approval, provider account action or payment is required by this report. Work stops at the unresolved quality criterion as requested; no Final Expert Review or Deployment was started.
