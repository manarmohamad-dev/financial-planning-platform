# Revised-scope blocker closure — 2026-10-15

## M7_ACCEPTED_REVISED_SCOPE

This is acceptance of the explicitly approved revised scope only. Natural-language scenario extraction failed acceptance and remains retired. It is not a claim that the original extraction contract passed. No deployment or final expert review was started. Earlier audit below is retained as historical evidence; its M7_BLOCKED status is superseded by this section.

### Exact changes

- `apps/api/src/ai-routes.ts`: new extraction and continuation requests to `/requests` and `/context` return HTTP410 `AI_EXTRACTION_RETIRED`. Capabilities advertise only assumption_review, result_explain and brief_narrative, with scenarioCreation=guided_input and freeTextExtraction=false.
- `apps/api/src/ai-service.ts`: direct generation service also rejects extraction before database/provider access. Historical authorization/read functions are unchanged. New stress-comparison responses must reference actual saved risk-check status evidence; unrelated financial references and unknown references are rejected, not silently repaired.
- `apps/api/src/ai-context.ts`: stress-comparison provider context exposes actual check-status facts only; instruction prioritizes breached/unavailable checks. Existing predicate-checked EN/AR interpretations already existed and are reused. No new financial computation, threshold or risk scoring.
- `apps/web/src/ai-assistance.html` and `locales/ar.ts`: replace “proposes assumptions” with review of recorded assumptions; explicitly distinguish engine-calculated findings from AI evidence selection and checked explanations. No layout redesign.
- `packages/ai/src/model.ts`: prompt traceability marker updated to `m7-reviewed-evidence-8`; internal schema and provider/model unchanged. Stored historical markers are not rewritten.
- `docs/M7-EXECUTION-CONTRACT.md`: controlling revised scope and acceptance criteria added above the preserved original contract.
- `tests/api.test.ts`: obsolete new-extraction-success tests replaced with revised generation, retirement and seeded historical-read coverage. History fixtures do not call a retired generation path. Permission/RLS, idempotency, failure sanitization, Arabic persistence, no financial mutation and in-flight membership revocation remain tested. Pre-change test source retained in ignored `.local/m7-pre-retirement-api-tests.ts`; old test results remain in historical reports.
- `tests/ai-revised-scope.test.ts`: direct-service bypass denial and EN/AR risk selection/rendering checks, including met, breached, unavailable and unrelated/unknown reference rejection. Fixtures are self-contained; tests do not depend on ignored acceptance artifacts.

### Actual risk interpretation evidence

Two actual Groq requests using the existing configuration/model, no retry/provider change, both HTTP201 and both saved successfully. Isolated local UTF-8 PostgreSQL and synthetic engine-generated baseline/scenario/stress comparison only; no Neon. This is a bounded two-language verification, not a statistical availability guarantee.

Workspace `f6a640e2-efa2-4f1d-bfb0-8f577ba5a1a0`; comparison `bd0d2822-5cdd-4efe-8a2d-e85b50f66883`.

- EN artifact `48640690-a67f-492a-ab93-8273bc3d7159`.
- AR artifact `ac33b186-129b-4e23-932c-6d33fef203aa`.
- Evidence: `output/m7-revised-acceptance/saved-risk-en.json`, `saved-risk-ar.json`, generated-risk screenshots.
- Actual selected references include saved `cash_negative`, `cash_reserve`, and `operating_floor` checks for baseline and scenario. All selected checks in this fixture are `met`. Explanation correctly says the configured rule is met and that this does not imply all risks are absent. No invented breach, probability, amount or recommendation.
- Local regression separately proves breached/unavailable predicates in both languages. Those cases are synthetic deterministic tests, NOT additional live Groq successes.
- The live calls preceded the final traceability-marker rename; prompt behavior/context/selection validation are identical. Their stored prompt marker remains the historical value. No repeat provider calls merely to change metadata.

### API and historical safety evidence

- HTTP410 for fresh extraction and prior-artifact continuation on both routes, with unchanged provider-call count and artifact count.
- Direct service call rejected before pool/provider access.
- All provider initiation sites inspected: the shared generation service is the sole API inference path. Preview/context cannot generate; artifact reads/request status/listing cannot generate; historical explicit apply uses the existing reviewed draft service, not the provider. Existing historical apply was not removed or rebranded as new extraction.
- Owner/Manager/Analyst can read/list a seeded historical extraction artifact; foreign tenant is denied. Runtime-role mutation and foreign RLS reads remain blocked.
- In-flight membership revocation discards output; no idle transaction held during provider wait. Archived workspace denied before provider.
- Fresh browser EN/AR baseline-route checks confirm no extraction textarea or generation button. Initial harness accidentally selected the saved-result explanation panel on the run route; corrected to the baseline route. That assertion failure was a test-target error, not a production extraction leak.

### Browser, fallback and financial regression

- Six fresh saved-risk journeys: Owner/Manager/Analyst × EN/AR, HTTP200, exact saved artifact/source evidence, zero new generation calls on reopening (`history-matrix.json`).
- Two fresh 390px mobile checks: EN LTR and AR RTL; client width=scroll width=390. Screenshots retained. Arabic desktop and English mobile inspected visually; no observed overlap/clipping. Technical source labels remain unchanged English identifiers.
- AI-disabled browser: manual scenario replay HTTP200 with matches=true; zero AI requests (`provider-disabled.json`). Guided manual tools remain independent of provider success.
- Earlier accepted review/results/two-scenario/brief and all-page EN/AR PDF evidence remains established; none of those financial/presentation contracts or print styles changed. No redundant PDF regeneration. No claim of complete WCAG certification.

### Exact checks

- Full regression after implementation and revised integration coverage: **611 passed, 0 failed, 18 files**. Includes financial golden/invariant and M1–M6 coverage. Previous 609-pass run preceded two added authorization tests; it is not the final count.
- Final prompt-marker-only change: affected contracts/provider/revised-scope subset **47 passed, 0 failed**; included in 611, not additional tests. No behavioral changes after the full regression.
- TypeScript + Angular template typechecks: passed.
- Full ESLint: passed.
- API production build: passed.
- Angular production build: passed.
- Git diff whitespace check: passed (existing CRLF advisories only).

### Remaining limitations, not reopened scope

AI still selects bounded references and uses validated wording; explanations can repeat and cover selected checks rather than every risk. No autonomous recommendations, no free-text scenario creation, no LLM calculations. Manual risk tables retain the complete saved evidence. Free-provider downtime remains possible and safe fallback stays available. Older invalid historical outputs may be refused by existing safety validation; records are never deleted. This pass proves authorized access to valid historical records, not universal display of unsafe legacy prose.

No delivery-blocking defect remains in the three targeted revised-scope blockers. No billing settings, provider/model, Neon, migration, financial formulas, risk thresholds, Guided Input implementation, PDF styles or unrelated UI were changed. Temporary local acceptance servers/databases are synthetic and do not replace project data.

---

## Preserved pre-fix audit

# M7 revised-scope readiness audit

Date: 2026-10-15. **M7_BLOCKED**.

## Scope and method

The user approves Guided Input, grounded assumption review, saved-result explanation, risk interpretation and brief assistance. Free-text extraction, autonomous decisions and AI financial calculations are excluded. This audit does not accept the original extraction scope or change production implementation.

Reviewed current routes, service/context/grounding code, Guided Input guards, existing integration tests, persisted acceptance JSON and browser evidence. Revalidated ten saved actual Groq artifacts against current validation and ran four focused unit suites. No new provider call, extraction experiment, billing, database operation, Neon change, deployment or application edit. Only this report was added.

Evidence is from real persisted synthetic acceptance scenarios, not fabricated AI answers and not customer/Neon data. Browser matrices/screenshots are retained October 7 evidence; this is NOT a fresh live-browser or live-provider acceptance run. The Arabic mobile review and English brief screenshots were visually reinspected. Current hosted/runtime availability was not verified.

## Verified capabilities

| Capability | Evidence and finding |
| --- | --- |
| Guided scenario entry | `apps/web/src/decisions.html`, `decisions.ts`, `guided-entry.ts`: explicit selection opens existing reviewed editor; not AI inference. Current focused tests pass. Prior hiring browser journey preserves inputs and requires review. Full live all-family coverage is not established by this audit. |
| Assumption review | `saved-review-en.json` and `saved-review-ar.json` in `output/m7-quality-browser`: actual source classifications distinguish revenue assumption, observed opening cash, schedules and missing values. Current strict revalidation passes. No invented alternative assumptions or quantified causal attribution is supported. |
| Saved-result explanation | Two actual saved scenario runs and both languages revalidated; comparison below. Genuine model evidence selection followed by deterministic text/value rendering. |
| Risk interpretation | Brief artifacts select existing risk-check statuses and qualify their meaning. Dedicated risk-page artifacts select cash/operating values only. Safe financial explanation is proven; adequate risk-specific interpretation on that path remains unverified. |
| Decision Brief assistance | Saved EN/AR artifacts reference saved cash, minimum cash and `cash_negative` checks, with the qualification that a met check does not mean all risks are absent. This is on-screen assistance; existing deterministic PDF excludes AI annotations. |

Actual LLM responsibility is selection of permitted evidence references and interpretation kinds. Server code constructs the financial wording and binds stored values. Do not describe this as unrestricted reasoning, automatic scenario creation, independent advice or AI-written financial calculations.

## Two-scenario evidence

Workspace: `d10f24a0-db55-41a1-ba9d-c921b90f1b6f` (isolated synthetic acceptance).

| Saved source | Ending cash | Final operating result | Stored cash difference | Stored operating difference |
| --- | ---: | ---: | ---: | ---: |
| Shared baseline | 64,000 EGP | 18,000 EGP | — | — |
| Run `cbfead39-3ffc-4eb7-be58-d4c202978aae` | 48,000 EGP | 10,000 EGP | -16,000 EGP | -8,000 EGP |
| Run `c1a35245-e886-4b29-b4e6-6ac28942187a` | 80,000 EGP | 26,000 EGP | +16,000 EGP | +8,000 EGP |

Sources: `saved-explain-{en,ar}.json`, `saved-alternate-{en,ar}.json`. English artifact IDs: `1bbccceb-3e91-4663-bf75-7bd7b815f7a1` and `86a97988-47d5-4b5b-8ac7-a0010892239e`.

Both language pairs reference the correct scenario-specific differences. English alternate output additionally selects unchanged minimum cash and unavailable funding gap. Selection therefore is not identical across the two sources; Arabic uses similar relevant metric categories with opposite stored differences. Reused local reference names such as f17 refer to each artifact's own evidence, not global facts. Some repeated definitions remain; variation alone does not establish comprehensive explanation quality.

`apps/api/src/ai-context.ts` reads stored scenario results with `readScenarioRun`, stress comparisons with `readStressComparison`, and briefs with `readBrief`. Comparison differences are copied from existing results. `ai-service.ts` applies `materializeClaims` and `validateAiOutput` before persistence. The model selects references; it does not supply authoritative result numbers. Input amounts used by assumption review originate from reviewed user/source inputs, not from Financial Engine calculations; calculated financial outcomes originate from the engine. Unknown remains `not_available`, not zero.

The original scenario input documents were not reconstructed or recalculated during this audit. Prior quality acceptance documents the differing scenario data; saved result/evidence JSON directly demonstrates differing deterministic outcomes. This is a provenance/code and saved-artifact check, not a fresh independent engine replay.

## Permissions, fallback and history

- `authorizeAi` requires `ai.use` and `data.view`, plus task-specific baseline/scenario edit, comparison view or brief prepare permissions. Workspace-scoped transactions and RLS remain present.
- `tests/api.test.ts` contains cross-tenant rejection before provider invocation, hidden foreign artifacts, immutable artifacts, failure sanitization and in-flight authorization coverage. These integration tests were inspected, not rerun in this audit.
- Retained `history-matrix.json`: 30 Owner/Manager/Analyst × EN/AR × review/results/alternate/risk/brief cases returned exact saved summaries and source evidence with zero new provider requests.
- `provider-disabled.json`: manual replay HTTP200, `matches:true`, zero AI requests. Current UI explicitly offers manual continuation when unavailable. Provider unit coverage rerun below; no fresh runtime outage injection.
- Migration 009 retains immutable artifact triggers and tenant policies. `readAiArtifact` revalidates stored output before display; unsafe legacy output can be refused without deletion. History listing currently validates every returned artifact and may fail the whole listing if one old record fails validation; treat this as a history-availability risk requiring a focused mixed-history check, not a proven current data-loss incident.
- History-only extraction UI still exposes reviewed historical apply behavior. This is not new inference, but must be explicitly distinguished from the rejected extraction capability. No historical rows were modified or deleted.

## Arabic, English, RTL, mobile and PDF

Retained `mobile-matrix.json`: ten Owner cases at 390px, EN LTR / AR RTL and matching document client/scroll width. Retained desktop history matrix covers all three roles and both languages. Reinspected screenshots show readable joined Arabic and source details, and readable English risk qualifiers. Technical evidence labels remain English; this is not complete localization or full accessibility certification.

Prior keyboard/consent/reduced-motion evidence remains documented in M7 reports. Prior actual Decision Brief PDFs contain four pages per language and all eight were visually accepted after print repair. No print changes occurred here; PDFs were not regenerated. No claim of a fresh full responsive/browser/PDF run.

## Delivery blockers and minimum fixes

### 1. New extraction remains available through API — confirmed blocker

`apps/api/src/ai-routes.ts` returns all `aiTasks` from capabilities and accepts `scenario_extract` through POST `/requests` whenever AI is enabled. POST `/context` also accepts it. `createAiService` has no retired-task guard. Existing integration tests even expect extraction generation HTTP201. UI `historyOnly` guards correctly suppress generation/context preview, but do not enforce the API boundary.

Minimum fix: remove extraction from generatable capabilities; reject NEW extraction and clarification continuation before provider invocation/request creation; retain read-only historical retrieval and appropriate permissions. Add route/service regression assertions proving no provider invocation, no new artifact/scenario and preserved history. Decide explicitly whether old reviewed apply remains supported or history becomes read-only; never delete history merely to retire generation. Do not disable all AI to satisfy this requirement.

### 2. Dedicated risk interpretation is not established — acceptance blocker

`saved-risk-en.json` and `saved-risk-ar.json` select f3/f13/f23 cash and f4/f14/f24 operating results, not risk-check statuses. The brief path proves check interpretation exists, but cannot stand in for risk-page relevance. Minimum action: focused risk-question/evidence relevance acceptance on saved comparisons in both languages; if necessary, narrowly improve selection/relevance enforcement without inventing risk judgments or changing the engine. No new provider/model/extraction experiment is justified.

### 3. Capability wording and contract are stale — confirmed delivery blocker

`apps/web/src/ai-assistance.html` says “AI explains evidence and proposes assumptions”; Arabic locale says “يقترح افتراضات”. Actual accepted behavior reviews existing assumptions and missing information. Replace that claim with precise review language in both languages. The original execution contract and accumulated reports still include original extraction acceptance and older contradictory statuses. Add a clearly controlling revised-scope contract/status section, preserving historical failed evidence. This report records the approved scope but does not silently rewrite earlier contracts.

### Remaining focused verification before readiness

After only the necessary fixes: prove extraction denial plus historical access, risk-specific relevance, revised wording, and affected role/language/mobile flows. Guided Input all-family runtime coverage and mixed-valid/legacy-invalid history handling are not newly established here. Required unverified behavior must be closed before acceptance; do not substitute passing unit counts for runtime/content evidence.

## Tests and build results

- This audit: `vitest run tests/ai-grounding.test.ts tests/ai-presentation.test.ts tests/ai-guided-entry.test.ts tests/ai-provider.test.ts`: **60 passed, 0 failed, 4 files**.
- This audit: all ten saved EN/AR review/result/alternate/risk/brief artifacts passed current `validateAiOutput`: **10/10**. Structural/grounding acceptance does not certify risk relevance.
- No current lint/typecheck/build rerun: audit changed no implementation. Prior guided-pass typechecks/lint/Angular build passed; API build evidence retained from the earlier pass. These are historical results, not new executions.
- Latest documented complete coverage: **610 tests with no remaining failures across the initial 587-pass/23-fail environment run and corrected affected-file rerun (238 passed)**. Not a single fresh 610-test pass, and not 610 + 60 tests.

## Final recommendation

**M7_BLOCKED**. The revised scope is implementable using existing capabilities, but API extraction retirement is not implemented, risk-page relevance remains unverified, and capability wording is inaccurate. No need for a new provider, new extraction experiment, redesign, financial formula change or database change. Stop after this audit; do not deploy or declare acceptance.
