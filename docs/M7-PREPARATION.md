# Pre-M7 checkpoint and implementation boundary

Date: 2026-09-30. Status: preparation complete; implementation deferred by user until usage renews. No M7 application code or migration applied. Detailed final contract: `M7-EXECUTION-CONTRACT.md`; exact handoff: `M7-RESUME.md`.

## Rollback

HEAD: `555156db37d394b89707b7176583cb6132fca92b`.

Verified checkpoint: `.local/pre-m7-20260930-143444/` containing `workspace.zip`, `history.bundle`, and SHA-256 `manifest.json`. All 260 tracked/nonignored files, including existing untracked documentation/output, were archived and individually verified. Ignored credentials, local databases and dependencies were left untouched; this is a source rollback checkpoint, not a database backup. Restore must be into a separate directory for comparison, never a blanket reset or overwrite. Prior evidence: 489 tests pass; not rerun during preparation.

## Provider decision

Preferred first evaluation: Groq Free, `openai/gpt-oss-120b`, server-side only. Official structured-output documentation lists strict JSON-schema support; server-side schema and domain checks remain mandatory. Published free limits include 30 requests/minute, 1,000/day, 8,000 tokens/minute and 200,000/day; account limits must be confirmed. No Developer-tier upgrade, payment method or paid fallback is authorized. English/Arabic quality is unverified until live evaluation; availability alone is not acceptance.

Gemini offers a free tier but its unpaid-service data-use terms make it a less suitable default for financial company context. Local models avoid a provider key but require substantial runtime resources and are not the least-change hosting path. No local model/runtime deployment is proposed.

Groq data policy includes limited retention exceptions for reliability/abuse monitoring; do not describe it as unconditional zero retention. Review account data controls before any live test. Initial tests use synthetic data only. User-facing informed confirmation and minimum necessary context are required before transmitting workspace data. No raw spreadsheets, credentials, invitation tokens or unnecessary personal information go to the provider.

References checked:
- https://console.groq.com/docs/billing-faqs
- https://community.groq.com/t/do-i-get-charged-for-anything-on-the-groq-free-plan/832
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/structured-outputs
- https://console.groq.com/docs/your-data
- https://ai.google.dev/gemini-api/docs/billing/
- https://ai.google.dev/gemini-api/docs/pricing

## M7 implementation/acceptance contract

1. Natural-language scenario extraction into a bounded proposal compatible with existing scenario primitives. Missing inputs generate clarification questions, never invented financial defaults. Cover existing supported sales/hiring/spending/expansion/combined scenarios, with explicit unsupported/ambiguous responses.
2. Assumption review identifies issues but does not replace deterministic eligibility, conflict checks or risk rules.
3. Explain completed results using authorized immutable source/run references. Numeric values and attribution come from the deterministic engine, not model arithmetic.
4. AI narrative for an existing Decision Brief is separately labelled, traceable to the exact evidence, and never replaces authoritative figures or declares an automatic best decision.
5. Explicit human review before proposals enter the existing draft workflow; existing confirmation/publication steps remain mandatory. No model DB access, tool execution, SQL, permission decisions or automatic persistence.
6. Keep existing Owner/Manager/Analyst gates, RLS, CSRF and tenant transactions. Provider key stays server-side; bounded input/output, timeout, rate limits, sanitized errors/logs, and provenance are required.
7. With no key, quota exhaustion, timeout, malformed output or provider failure: explicit unavailable/retry state; the complete manual workflow remains available. No simulated AI success.
8. Reuse existing screens and design. English/Arabic support; generated content treated as untrusted text. Imported text cannot override instructions.

Tests added during implementation: schema/domain rejection, missing/ambiguous inputs, cross-tenant and role denials, source/reference validation, malicious input/output, numeric fidelity, manual fallback for absent key/429/timeouts, no mutation without review, redaction, provider adapter contract, and English/Arabic synthetic live evaluation. Test doubles verify failures but do not substitute for live-provider acceptance.

After M7: all 489 baseline tests plus new tests; lint/typechecks/API and Angular production builds; complete financial/role journeys, EN/AR responsive/keyboard review, actual EN/AR PDFs page by page. Disposable test database only, never Neon for regression setup.

## Release dependency still open

Full-application hosting remains unresolved; Week 3 Cloudflare is an isolated UI review. Preserve Neon and runtime RLS role. Current Dockerfile builds backend only while old documentation describes combined serving. A complete deployment must run Node and the existing Python subprocess and preserve session/CSRF behavior; do not assume separate-origin static hosting works without verification. No platform subscription or architecture change is approved by this document.

## Next step

Groq login and Free/$0 account have been verified. API key provisioning and Inference APIs Zero Data Retention activation remain unconfirmed. Do not call Groq or implement M7 during this preparation pause. On user resumption, follow `M7-RESUME.md` and the ordered execution contract; verify pending account settings/key presence without printing credentials. If card/billing is required, stop. Do not claim M7 complete before live and regression acceptance.
