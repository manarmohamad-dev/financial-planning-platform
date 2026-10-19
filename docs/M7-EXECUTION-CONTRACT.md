# Controlling revised scope — 2026-10-15

This section supersedes the extraction requirements below; historical requirements and results remain for traceability.

Approved: manual Guided Input; evidence-grounded review of recorded assumptions; saved-scenario explanations; interpretations of actual saved risk-check statuses; Decision Brief assistance. AI selects evidence; deterministic code validates references and renders interpretations. Financial Engine alone calculates outcomes. No autonomous decisions, invented assumptions, AI calculations or new free-text scenario extraction.

Natural-language extraction failed acceptance and is retired at both API request/context boundaries and the service. Capabilities exclude it. Existing authorized historical retrieval remains; explicit reviewed application of historical proposals remains an existing manual action, not new inference. History is not deleted.

Acceptance requires: server and service denial without provider calls; authorized historical reads and tenant isolation; relevant risk-check evidence rather than unrelated financial metrics; unknown never zero; provider-unavailable manual continuity; accurate EN/AR wording; role, RTL/mobile and affected test/typecheck/lint/build verification. Saved historical evidence must not be misreported as a fresh live-provider/browser test. See M7-FINAL-ACCEPTANCE.md for current status.

---

# M7 execution contract — preparation complete, implementation deferred

Prepared 2026-09-30 for resumption on/after 2026-10-05. This document specifies future work; none of its proposed code, routes, migrations or tests has been implemented by this preparation task.

## 1. Established state and boundaries

- Main application: `outputs/planning-platform`, not the separate `outputs/week3-ui-review` deployment.
- Source HEAD: `555156db37d394b89707b7176583cb6132fca92b`. Existing verified rollback: `.local/pre-m7-20260930-143444/{workspace.zip,history.bundle,manifest.json}`. Preserve it unchanged. It excludes ignored secrets/databases/dependencies and is not a database backup.
- Established earlier evidence: 489 tests passed, zero failures; lint, typechecks, API and Angular production builds passed. These checks were not rerun for this documentation-only task and are not evidence of an implemented M7.
- Current untracked areas: `docs/`, `output/`, `railway.json`; preserve them. No reset, clean, overwrite or automatic push.
- Groq account login and Free/$0 plan were verified earlier. Key creation and Inference APIs Zero Data Retention activation remain UNCONFIRMED. `.local/m7-provider.env` is an ignored local placeholder; never copy its value to chat, logs, frontend or archives.
- No Groq API request is authorized during preparation. No M7 implementation now. Neon remains untouched.
- AI assists understanding, extraction, clarification and explanation ONLY. Existing deterministic engines compute all financial results and readiness. No autonomous decision, scoring, optimization, accounting expansion, redesigned UI or new role.
- Manual entry, forecasting-optional workflows, M1–M6, Owner/Manager/Analyst permissions, RLS, isolation, immutable history, source lineage and EN/AR remain intact.

## 2. Provider contract

Use a small server-side adapter with injected transport for tests, not an agent framework. Target Groq `POST https://api.groq.com/openai/v1/chat/completions`, bearer key on server only; model `openai/gpt-oss-120b`. No paid fallback, automatic model switching, tools, streaming, browsing or model database access.

Request `response_format.type=json_schema`, task-specific schema, `strict:true`. Every object forbids additional properties; every property is required, using explicit null where unknown. Use a provider-compatible schema subset and validate again locally with Zod plus domain checks. Prompt/schema/context-builder versions are explicit constants. The model name prefix does not mean OpenAI API integration.

Optional configuration: `AI_ENABLED=false` by default; `GROQ_API_KEY` optional; `AI_MODEL` allowlisted to the approved model; `AI_TIMEOUT_MS=20000`. Missing/invalid credentials disable AI rather than API startup or manual features. Production secrets enter the deployment secret store, never build-time Angular environment.

Initial safety budgets: user text max 4,000 characters, bounded context max 12,000 characters, response max 2,000 tokens and 64 KiB. Reject excessive context explicitly rather than silently dropping required evidence. One in-flight call per actor/workspace and a small process-wide concurrency cap (2); local admission limit 3 requests/minute per actor, returning retry guidance. Provider quotas remain authoritative. Do not present process-local controls as multi-instance global quotas; coordinate admission before scaling instances.

Abort timeout/disconnected requests where possible. No automatic retry on timeout/429/5xx (avoid duplicate calls/cost/quota); offer explicit retry. Honor provider Retry-After without exposing response bodies. No provider calls in ordinary tests.

Before first live call: confirm Free plan/current model/account limits and Inference APIs ZDR, verify key presence without printing it, and use synthetic context only. No card, upgrade or paid service activation. Existing official references are in M7-PREPARATION.md; account eligibility and Arabic quality are not assumed from documentation.

## 3. Public request and structured output schemas

API input envelope, strict object:

`{task, locale, source, text, priorArtifactId, answers, consentVersion, idempotencyKey}`

- task: `scenario_extract | assumption_review | result_explain | brief_narrative`.
- locale: `en | ar`; text string up to 4,000 characters or null by task.
- source: `{kind: published_baseline | scenario_draft | scenario_run | stress_comparison | decision_brief, id: UUID, revision: integer|null}`; task/source combinations are allowlisted. Sources must exist and be readable in this workspace. Draft review requires exact revision; result explanations use saved immutable runs.
- priorArtifactId: UUID|null; answers: max 10 `{questionId, text}` entries, each text max 500. Server reloads and authorizes prior artifact; never accepts prior output pasted as trusted state.
- consentVersion: current server-recognized notice identifier. UI shows what minimal context goes to Groq before first submission; server requires acknowledgment. This is not a substitute for organization-level data-sharing policy.
- idempotencyKey: UUID. Same actor/workspace/key with different request hash returns 409. Pending identical request returns pending status, completed request returns stored artifact without another call.

Provider output common envelope:

`{schemaVersion:'m7-1', task, outcome: ready|needs_clarification|unsupported, summary, questions, warnings, payload}`

Summary max 1,000 characters; questions max 10 `{id, field, question, reason}`; warnings max 10 `{code, message, evidenceRefs}`. All user-facing text is plain text in the requested language. Task-specific strict schemas replace a loose arbitrary payload.

### Scenario extraction payload

`{title, decisionType, changes, expansion, paybackRequested}`: title max 120 or null; decision type is existing `sales|hiring|spending|expansion|combined` or null; at most 30 change proposals. Each proposal contains a temporary alias, existing primitive kind (`adjust|entry`), decision type, authorized scope alias, target-entry alias or null, period(s), operation or null, decimal amount/rate string or null, currency or null, cash timing/schedule proposal or null, dependencies as proposal aliases, and evidence spans from user input. Expansion revenue mode/cost review fields remain unresolved until human review; never infer confirmation flags.

Implement task-specific branches matching the EXISTING `scenarioChangeSchema` primitive shapes; reuse its operation enums, period/money/rate rules and nested entry definitions. No arbitrary JSON payload. Unknown required fields stay null and produce questions. Only allowlisted context aliases resolve to server-owned UUIDs. Server assigns IDs, source/provenance and `assumption` classification; model cannot invent DB IDs, confirmed/observed evidence, publication state, actor or tenant.

No silently narrowed support: test every existing primitive/decision family including percentage operations, additions/removals, entry schedules, dependencies and expansion semantics. Unsupported or ambiguous instructions get clarification, not a partial executable interpretation. New unsupported financial functionality stays unsupported.

### Assumption review payload

`{issues:[{code,severity:info|review_required,assumptionRef,message,question,evidenceRefs}]}` (max 20). References must come from selected source. These are suggestions, never replacements for existing deterministic conflict/readiness checks, risk thresholds or approval requirements.

### Result explanation and brief narrative payload

`{sections:[{heading,segments:[{kind:text|fact_ref,text:string|null,factRef:string|null}]}],limitations:[string]}` (max 6 sections, 12 segments/section, 10 limitations). Fact segments use only server-generated evidence aliases. Server renders exact decimal values, units, period labels and provenance. AI does not supply calculated numeric fields or a winning decision.

Text segments must not contain unreferenced numerical claims: normalize Arabic-Indic digits and validate numerical tokens; require fact references for amounts, percentages, dates and counts. Reject invalid output, never repair its numbers silently. This restriction reduces numeric invention but cannot prove semantic correctness of prose; label generated explanation and require review. Do not claim schema validation proves factual or causal correctness.

## 4. Validation and data flow

1. Existing session/CSRF/origin middleware, bounded body, route UUID parsing.
2. Short RLS transaction: authorize membership/permission, reject archived workspace, load exact source/revision, create bounded evidence catalog, hash context, register pending request. No raw spreadsheet, email, password, key or unnecessary personal data in context. Treat all labels/imported text as untrusted data.
3. Outside DB transaction: call Groq. Never hold workspace FOR UPDATE lock or a pooled database transaction during network latency.
4. Parse JSON, strict schema, enum/bounds, source references, currency/scope, period range, units, supported primitive and numeric-evidence validation. Arabic/English normalization is deterministic; ambiguous separators, relative periods or missing currency/timing require review.
5. Short transaction: reauthorize actor and workspace, recheck source revision/context, save immutable validated artifact and audit metadata. Discard output if membership was revoked or source changed. Invalid output never becomes an actionable artifact.
6. Explicit user review/edit/accept creates an ordinary M3 draft through existing service and schema, preserving baseline publication requirements and optimistic concurrency. No calculation, confirmation, publication or replacement of an existing draft occurs automatically. Existing validation gates still decide whether the user can run it.

Clarification resubmission remains linked to the source and prior artifact. Maximum 3 rounds per chain; afterward return to manual editing, without truncating or losing user text.

## 5. Routes, permissions and persistence

Proposed scoped routes under `/api/workspaces/:workspaceId/ai`:

- `GET /capabilities`: authorized workspace member; safe availability/reason/task list, no secrets or quota internals.
- `POST /requests`: all tasks require existing `ai.use` and `data.view`; extraction additionally `scenario.edit`; assumption review `scenario.edit` for scenario drafts or `baseline.edit` for baseline inputs; explanation `comparison.view` for comparisons; brief narrative `brief.prepare`.
- `GET /requests/:id` and `GET /artifacts/:id`: same tenant/source access and task gates; no cross-workspace lookup fallback.
- `POST /artifacts/:id/apply`: extraction only, `ai.use` + `scenario.edit`, exact reviewed proposal/source version and idempotency, delegates to existing scenario creation service. Other tasks are read-only annotations, never financial mutations.

`ai.use` ALREADY EXISTS in contracts and demo permissions. Preserve the existing Owner/Manager/Analyst matrix verbatim. Demo may use only its owned synthetic data and existing capabilities. No new ability to publish, change policy or import company data into demo.

Additive migration (next number after checking current migration directory; anticipated `009_ai_assistance.sql`): tenant-scoped `ai_requests`, immutable `ai_artifacts`, `ai_applications`. Keep request status, task/locale, actor, source/version, context hash, schema/prompt/model versions, bounded validated output, timestamps, sanitized failure code and accepted draft link. Do not persist raw provider errors, key, chain-of-thought or unnecessary raw prompts. Do not request chain-of-thought.

RLS matches existing migrations/runtime role; composite tenant references prevent cross-workspace artifact/application links. Idempotency uniqueness is scoped to workspace+actor. Request state may transition pending to succeeded/failed; artifact content is immutable. Reauthorize before success and application. Define stale pending expiry so an interrupted process does not block retry forever; never report an unknown provider outcome as success.

Audit events: `ai.requested`, `ai.completed`, `ai.failed`, `ai.rejected`, `ai.proposal_applied`. Metadata: task, artifact/source IDs, version/model, sanitized code and duration; never prompt/output/body secrets. Denial audit survives rollback using established service pattern. Denied/invalid context must cause zero provider calls.

## 6. Error and fallback contract

| Case | API/UI behavior | Manual workflow |
|---|---|---|
| Disabled/no key | AI_UNAVAILABLE, explicit disabled/help state | Fully available |
| Missing/ambiguous user input | Valid clarification artifact, no executable draft | Editable |
| Unsupported request | Bounded unsupported explanation | Available |
| 401/403 provider | Sanitized AI_PROVIDER_CONFIGURATION; no raw body | Available |
| 429/local capacity | AI_RATE_LIMITED, retry-after if available | Available |
| Timeout/network/5xx | AI_TIMEOUT/AI_PROVIDER_UNAVAILABLE, explicit retry | Available |
| Invalid JSON/schema/reference/claim | AI_OUTPUT_INVALID; no acceptance button | Available |
| Stale source/revision | 409 AI_SOURCE_CHANGED; reload/review | Preserved |
| Revoked permission/tenant mismatch | Existing 403/404 non-disclosure semantics; discard | Existing role limits |

Do not fabricate fallback AI output or pretend a deterministic template is a successful provider response. Keep unsent text on failure, prevent double submission and expose accessible status messages. Operational logs redact Authorization, key, cookies and provider payloads.

## 7. Files and UI integration

New bounded modules (final names below are the implementation target):

- `packages/ai/src/model.ts`: shared strict task/envelope contracts and provider-compatible schemas.
- `packages/ai/src/validation.ts`: reference/numeric/domain proposal validation, no financial arithmetic engine.
- `apps/api/src/ai-provider.ts`: Groq transport, timeout, limits, sanitized failures, injected test transport.
- `apps/api/src/ai-context.ts`: authorized minimal evidence catalog and prompt builders/versioning.
- `apps/api/src/ai-service.ts`, `ai-routes.ts`: lifecycle, two short transaction phases, permissions, audit and application.
- Additive migration in existing migration directory, number verified before creation.
- `apps/web/src/ai-assistance.ts` and `ai-assistance.html`: small reusable assistance/review panel, existing design tokens/components, no general chat page.
- `tests/ai-contracts.test.ts`, `ai-provider.test.ts`, `ai-security.test.ts`, `ai-integration.test.ts`, plus EN/AR fixtures and opt-in synthetic provider acceptance script.

Targeted modifications:

- API `app.ts` mounts routes/dependency injection; `config.ts` optional AI settings; logging redaction where needed.
- Existing `scenario-service.ts` only if required to link accepted artifact to normal draft; no transformation/math changes.
- Web `decisions.ts/html`: natural-language scenario proposal, questions, editable review and explicit apply-to-new-draft; preserve unsaved input and exact baseline/run context.
- Web `planning.ts/html`: assumption review only where supported existing editable assumptions can be referenced.
- Web `stress.ts/html` (including existing brief view): explain selected immutable result and separate optional labeled AI brief narrative. Never rewrite saved M6 brief/figures. PDF inclusion, if enabled, is a separate reviewed annotation with source/model/version and requires print verification.
- `i18n.ts`, `locales/ar.ts`: UI/error/consent labels; render generated/user text as escaped text, preserve source values with bidi isolation.
- `.env.example`, README/API/security docs and package/TypeScript wiring only as necessary for new package. No provider SDK is required; use supported Node fetch.

UI states: unavailable, consent/context preview, entering text, pending, clarification, proposal/review, applied, error. Visible AI attribution; no fake certainty percentage. Keyboard focus, live status region, reduced motion and RTL use current patterns. Do not add a new navigation destination or redesign screens.

Untouched: deterministic planning/scenario/stress calculations, Python runtime/forecasts, imports/mapping behavior, permissions matrix, session semantics, original styling foundation, Week 3 copy, Neon, hosting accounts.

## 8. Ordered execution and verification checklist

- [ ] Resume: read M7-RESUME.md; inspect only Git status/diff since this handoff. Preserve checkpoint. Do not rerun repository audit or completed baseline checks merely to rediscover them.
- [ ] Confirm key availability without printing, Free/model limits/ZDR with user if pending. Stop for account/key/payment requirement. No live data transfer until requirements met.
- [ ] Implement shared schemas and fixtures first; test EN/AR amounts, Arabic-Indic digits, percent, currency, missing dates, ambiguity, unsupported requests, additional properties, malicious instructions and all existing primitive families.
- [ ] Add provider adapter and mocked tests: exact endpoint/model/schema, no tools/stream, missing key startup, abort/timeout, 429, 401, 5xx, oversized output, invalid JSON, log redaction, no automatic retry.
- [ ] Add local migration/service/routes. Test disposable PostgreSQL RLS/runtime role, same/cross tenant, all three roles/demo/archived states, revoked access during call, stale revisions, duplicate/concurrent requests, failure rollback/audit and no held DB transaction during transport.
- [ ] Test proposal application: no financial mutation before acceptance; only new normal draft; no invented IDs/confirmation/source classification; existing scenario readiness/calculation gates unchanged; application idempotency and rollback.
- [ ] Integrate existing UI panels/translation. Test all states, manual fallback, consent, unsaved work, exact source handoffs, literal escaped output, numeric bidi, keyboard/focus and narrow viewport. No redesign.
- [ ] Run opt-in LIVE synthetic EN and AR provider acceptance, after key/ZDR confirmation: sales, hiring, spending, expansion, combined; incomplete/ambiguous clarification; malicious source text; exact saved result explanation; separately labeled brief narrative. Capture sanitized source IDs/model/schema/outcomes, no key/raw personal context. A mock pass is not a live acceptance pass. If quality fails, report defect and stop from claiming full M7 completion.
- [ ] Run full baseline 489 plus all new tests, financial golden/invariants, lint, typecheck and both production builds. Report exact actual totals; do not predeclare new count. Tests run isolated DB, never Neon.
- [ ] Verify Owner/Manager/Analyst end-to-end, provider unavailable/manual-only journeys, EN/AR/RTL, responsive/keyboard/reduced motion. Generate real EN/AR Decision Brief PDFs and inspect EVERY page if narrative/print-relevant markup changed; record precise evidence, not screenshots of HTML as PDF proof.
- [ ] Save M7 report with actual changes/results/limitations and safe source checkpoint. Proceed to authorized final acceptance only after tests pass; hosting remains a separate unresolved dependency requiring working Node+Python+Neon+session flow, never frontend-only production claims.

Make small coherent checkpoints after contracts, API, UI and acceptance; do not commit secrets or mix unrelated untracked files. Stop at a real data/security/architecture issue or account/payment/authorization requirement. Do not reduce features/import limits to fit hosting. Preparation itself requires no application tests or build reruns.

## 9. Completion criteria

M7 is complete only with actual provider EN/AR evaluation, all supported extraction families reviewed safely into existing drafts, evidence-grounded explanations, transparent unavailable states, immutable provenance and tenant/permission tests, full regression/build success and applicable browser/PDF acceptance. Final graduation delivery additionally needs a working complete public deployment and delivery evidence; neither is claimed by this plan.
