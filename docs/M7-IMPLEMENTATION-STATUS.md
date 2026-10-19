# M7 implementation status — 2026-10-06

M7 implementation is present; final acceptance is still in progress. Do not deploy or claim complete.

## Preserved
- Original checkpoint `.local/pre-m7-20260930-143444/` and HEAD 555156db37d394b89707b7176583cb6132fca92b unchanged.
- No Neon or main local DB migration. Migration009 tested only in disposable PostgreSQL.
- No financial engine, Python, role model, tenancy policy or existing design rewrite.
- Groq Inference ZDR verified by user screenshot; ignored local key never printed/committed. Free only.

## Implemented
- Strict four-task AI contracts, exact evidence references, explicit-value and percentage-unit validation, Arabic validation, reviewed draft proposal conversion.
- Bounded server-only Groq adapter, no tools/automatic retries, TLS verified with system CA, missing-key/manual fallback.
- RLS immutable artifacts/audit, permissions rechecked after inference, no held transaction, quotas/idempotency and reviewed draft-only application.
- Optional Angular panels, context preview/consent, clarification, history, exact-source lineage, human review, JSON advanced edit, bilingual feedback; print hidden.
- Latest fixes: preserve repeated-ID clarification answers; preview uses the same clarification merge; history restores original request; edited proposal summary uses edited document; language/text changes invalidate consent/preview; saved outputs remain visible without provider availability.

## Verified evidence
- Full regression: 547 tests passed, 0 failed, 13 files. `output/m7-regression-final.log`.
- M7 integration subset:14 passed (includes source revision, clarification continuity/quota, revoked membership, no open transaction, reviewed draft application).
- Lint/typecheck passed; API+Angular production build passed. `output/m7-build-final.log`.
- Browser: Owner/Manager/Analyst login and correct management navigation; exact saved-run view; optional panel; consent blocks requests; EN/AR; Arabic RTL; Enter disclosure keyboard;390px DOM client/scroll widths375/375.
- Live synthetic reports `output/m7-live/`: latest successes for all five extraction families EN/AR, assumption review EN/AR, explanations EN/AR, missing-input/injection EN/AR, brief AR; brief EN terminology is being rechecked because earlier output called minimum projected cash a requirement.
- Several historical provider400/schema/truncation failures were safely rejected. Keep attempts; never represent cherry-picked passes as zero failure rate.
- Transport now temperature0 + reasoning_effort low (Groq official docs support this); still2000tokens,20s,64KiB. Prompt m7-evidence-4; safe schema fact-ref enums. Explain reliability limitations.

## Exact current continuation
- Live command session14724: final brief-en rerun after successful sales-ar/spending-ar/missing-en; poll once.
- Isolated server session8776: http://127.0.0.1:4320. IDs in `.local/m7-browser-review.json`. Synthetic owner/manager/analyst accounts only. Do not target Neon.
- Browser reviewTab logged in Owner, Scenario Builder with baseline45cd1c71-e4be-408c-880b-d7072a8fc24b. English synthetic10% request entered, context preview open, consent unchecked. Finish real browser generation -> review -> draft only -> history reopen, after provider test spacing.
- Still required: final UI journey/fallback checks; actual EN/AR PDF generation/page inspection where affected (NOT done); final report and safe M7 source checkpoint excluding all secrets.
- Browser tool currently has no print-to-PDF or native-app APIs; do not substitute old PDFs or HTML screenshots as proof. Find supported export/printing method or report this accurately unverified.
- Latest checked build includes current UI; server started before final validation-only title/label guard change. Rebuild/restart only affected checks when needed.

Use bundled Node AND Python PATH; clear TEST_ADMIN_DATABASE_URL for regression. Never print `.local/m7-provider.env`.

## Latest handoff
See M7-REPORT.md for current evidence and pending acceptance. All20 named live combinations now have successful attempts across prompt revisions. Final ratio and exact-draft handoff fixes browser verified. Full suite547; subsequent affected subset53; lint/typecheck/builds pass. Temporary browser tab no longer present. No current PDF inspection; do not claim complete.


## Latest acceptance checkpoint - 2026-10-06
See M7-REPORT.md final acceptance continuation. Actual EN/AR PDFs (6 pages each), all12 pages inspected. Real pagination defect remains: page4 only two lines and redundant shell heading. M7 NOT COMPLETE. No app/CSS/Neon changes.30 focused browser cases completed, AI-disabled manual replay passed, helper lint/TypeScript passed. Remaining: permitted print-only correction and successful-output/history browser matrix. Do not rerun547-test suite/builds absent relevant edits.


## Latest authorized correction - 2026-10-06
PDF defect CLOSED: minimal print-only CSS change, EN/AR4 pages each, all8 visually inspected, identifiers/numeric evidence preserved, Angular production build and CSS formatting passed. See M7-REPORT.md. M7 still NOT COMPLETE: actual saved English explanation invented a funding-gap assumption; Arabic/brief successful saved-output matrix remains blocked by invalid/unavailable provider responses. Six actual persisted-answer reopening cases passed (two English tasks x three roles, no generation during reopen). No deployment or final expert review. Preserve current state; next work is targeted M7 answer-quality diagnosis, not redoing PDFs or completed tests.
