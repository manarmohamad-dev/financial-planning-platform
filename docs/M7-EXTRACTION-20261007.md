# M7 Scenario Extraction root cause and acceptance — 2026-10-07

Status: **M7 NOT COMPLETE**. Current sample and regression are complete; extraction reliability remains unacceptable. No Final Expert Review or Deployment.

## Historical eight-case analysis (evidence preserved unchanged)
Sources: output/m7-quality-live/{case}-{locale}.json and attempt files.

| Attempt | Observed failure | Classification |
| --- | --- | --- |
| Hiring EN | Passed the original structural and semantic assertions | No failure |
| Hiring AR | Entry primitive also contains adjust-only targetAlias/operation/value/start/end/cashReplacement | Provider HTTP400 json_validate_failed; union-branch schema mismatch/additional properties. Not demonstrated to be an Arabic comprehension failure |
| Spending EN | Same mixed primitive branches; evidence also joins separated clauses into a non-contiguous quote | Provider schema mismatch plus independent downstream fabricated-quote violation |
| Spending AR | Entry contains adjust-only fields including operation set | Schema mismatch with conflicting branch content, not merely harmless redundant nulls |
| Expansion EN | Mixed primitive branches; rent labelled spending instead of expansion | Provider schema mismatch plus semantic expansion classification concern; a schema error does not prove the remaining output correct |
| Expansion AR | Structurally valid ready spending proposal, expansion null, rent only | Semantic loss of expansion intent; missing completeness gate, not malformed JSON or clarification |
| Combined EN | Sales adjustment present; marketing entry includes adjust-only properties | Provider union schema mismatch on second action; both action families were attempted |
| Combined AR | New-entry object has extra scopeAlias; cashTreatment explicit instead of requested profile | Additional-property violation plus independent timing interpretation error. Reported provider error refers to failed alternative branch and is not the full root cause |

All captured failed generations parse as complete JSON. No evidence of truncation, network or rate-limit failure in these eight attempts. Six provider-schema errors and one semantically incomplete accepted output must not be collapsed into one cause. The prompt already instructed omission of other branches, but a large overlapping nullable/discriminated schema and mixed task instructions did not reliably enforce this. Provider-internal cause cannot be proven from sanitized responses.

## Contract verification and limited change
Official Groq documentation checked at https://console.groq.com/docs/structured-outputs on 2026-10-07: GPT-OSS120B supports strict JSON Schema, required properties and additionalProperties:false. The existing request already sends response_format json_schema with strict:true. Local transport tests verify this; switching from prompt-only formatting is not the missing fix. Actual HTTP400 schema failures remain evidence despite advertised guarantees.

- Provider-only extraction-slots-1 uses distinct required nullable adjust/entry slots. Local decoding requires exactly one active slot, validates unknown properties and then passes the unchanged public m7-1 schema and all existing financial-input/quote/grounding checks. Conflicting fields are never stripped to manufacture acceptance.
- Extraction prompt no longer mixes narrative/review instructions. It explicitly describes root versus payload keys, all compound actions, expansion revenue exclusion, numeric timing, exact quotations and clarification of the whole request.
- Added conservative EN/AR explicit-intent completeness tripwires: required decision families, expansion metadata/classification and excluded_unknown, combined type, and separate named expense categories. Failure is AI_INTENT_INCOMPLETE; it cannot create a review draft. No missing action is synthesized.
- This is a bounded lexical safety check, not proof of arbitrary natural-language completeness. Negation/background mentions may cause conservative rejection; uncommon wording and repeated same-category actions remain a limitation. Human review and independent live semantic assertions remain mandatory.
- No automatic retries introduced. Semantic failure is not retried to inflate a rate. No provider/model/financial engine changes, no Neon access, no secrets logged.

## New sample protocol
Fresh synthetic inputs: February–April 2026; sales15%; two employees, monthly6200 and onboarding250; expense1700; explicit unknown expansion revenue. Seven task cases × EN/AR: sales, hiring, spending, expansion, four-family compound, missing information, ambiguous alternative request. New values/periods and four-action compound differ from the historical eight. The direct harness constructs an in-memory review document only, never persists or applies a financial decision.

Structural validity and semantic success are separate: schema parse is not enough; expected outcome, action count/type and expected values are independently asserted. Clarification is a success only for intentionally incomplete/ambiguous cases. Safe rejection of a fully specified request is a reliability failure. All raw synthetic outputs and rejected attempts are retained under output/m7-extraction-v7-live. The first compound-AR attempt precedes the added explicit root/payload prompt sentence; retain and identify it as a pilot, not a clean final-configuration run.

## Final new-sample results
**14 fresh case/language combinations: structural 10/14 (71.4%); semantic/correct-outcome 4/14 (28.6%).** Fully specified requests: 2/10 (20%). Incomplete/ambiguous requests: 2/4 (50%). Structural rate counts a network failure as failure to deliver a valid response; conditional on a received provider response it is 10/13 (76.9%). These are a small acceptance sample, not population reliability estimates.

| Case | EN result | AR result |
| --- | --- | --- |
| Sales | Structure valid, percentage magnitude15 instead of ratio0.15 rejected | Passed |
| Hiring | Provider400: question enum violations; captured count is string rather than integer; asks for technical fields | Structure valid, driver/componentKey missing despite explicit inputs; rejected |
| Spending | Structure valid, cashTreatment null despite explicit timing; rejected | Passed |
| Expansion | Provider400: extra expansion placeholder has primitive:null, alongside rent | Structure valid, metadata present but associated change still spending/combined instead of expansion; AI_INTENT_INCOMPLETE rejection |
| Four-action compound | Structure valid, percentage unit error rejected | Structure valid, unnecessary clarification despite supplied inputs; also replaces requested profile timing with explicit. Not an executable accepted proposal |
| Missing hiring details | Correct clarification, no changes | Provider400: Arabic question uses a synonym outside the closed enum |
| Ambiguous alternative | Correct clarification, no changes | Network/provider unavailable; explicit failure, no guessed fallback |

The extra initial compound-AR pilot failed schema (payload fields emitted at root). It is retained separately, so total live attempts in this continuation are **15**, with 4 semantic successes overall (26.7%). Two offline revalidations of the successful Arabic sales/spending artifacts are **not additional live attempts**. The final sample includes the compound-AR call after the explicit root/payload prompt correction. Application-side completeness checks were tightened during the run; earlier successes were revalidated offline against the final checks. This is not claimed as an untouched, homogeneous benchmark.

Raw evidence and summary: output/m7-extraction-v7-live/summary.json and individual reports. No semantic failure was retried into an eventual-success statistic. A rejected fully specified request still counts as failed functionality.

## Regression and preserved acceptance
- **599 passed, zero failures, 16 test files** in the full suite: output/m7-extraction-v7-regression.log. Includes original financial golden/invariant, authorization/isolation and existing grounded explanation tests. Thirteen additional extraction tests exercise slot conflicts, unchanged public-schema materialization, compound/expansion and same-family omission rejection. Do not add subset totals.
- Lint passed; API/Angular typechecks passed; API production build passed; Angular production build passed (output/m7-extraction-v7-web-build.log). Acceptance-harness-only additions afterward passed targeted ESLint and TypeScript checks; application sources were unchanged after full regression.
- Existing 30 saved-answer role/language journeys, 10 mobile checks and eight inspected EN/AR PDF pages remain previous evidence. No print, UI, narrative-generation or financial-engine edits in this continuation. They were not unnecessarily rerun. This is not a claim that the failed current extraction flow passed new browser end-to-end acceptance.
- No explanation repetition/evidence-selection changes were attempted because extraction did not stabilize; existing explanation safety tests still pass.
- No automatic retry or invented fallback. Existing manual path remains covered by regression; no provider failure runs or applies financial calculations.

## Final conclusion and exact resume point
**M7 NOT COMPLETE.** Branch ambiguity and silent expansion omission now have stronger explicit boundaries, but the limited repair has **not** achieved acceptable functional reliability. Remaining causes are model/provider schema violations, explicit inputs omitted or misinterpreted, percentage-unit mistakes and incorrect clarification, plus one separate network failure. Do not describe them all as one schema issue, claim arbitrary-language completeness from lexical checks, or lower the acceptance bar.

Next work must address the remaining extraction transport/semantic fidelity within the existing strict boundary and reevaluate fresh bilingual cases. In particular, the repeated closed-question enum errors suggest a compact question-code transport with server-rendered text may warrant a separate small verified change; this report does not claim it was implemented. No Final Expert Review or Deployment. No Financial Engine/M1–M6/Neon changes.

Source checkpoint: .local/m7-extraction-20261007-final; original pre-M7 and previous quality checkpoints preserved.
