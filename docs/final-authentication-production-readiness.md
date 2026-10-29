# Financial Decision Simulator — authentication and deployment review

Review date: 25 October 2026. Independent of FinPilot. **Local review, not authorization for deployment.**

## 1. Discovery and preservation

Repository: `<local-workspace>/planning-platform`.

Angular 21 standalone frontend; Express 5, Passport-local, express-session and PostgreSQL session storage; PostgreSQL 18 with tenant RLS; decimal.js deterministic calculations; bounded Python forecast worker; optional Groq assistance with validated evidence. The existing same-origin architecture and permission model were retained. This project did not previously implement Google Sign-In.

Checkpoint: `refs/checkpoints/before-auth-audit-20261024`, object `87dff7b15f3582f67a90156617e264e4b5498d0f`. Source snapshot: `D:/DockerTests/simulator-before-auth-audit.zip`. Existing deployment preparation changes were retained. No production database, original records, unrelated application or hosting account was modified. Nothing was pushed.

## 2. Implemented authentication

- Added Google Identity Services button and server verification using `google-auth-library`. Default configuration is disabled; a missing Client ID cannot be enabled successfully. No fake credential was installed in a running environment.
- `GET /api/v1/auth/google/config`, `POST /api/v1/auth/google/challenge`, `POST /api/v1/auth/google`, `POST /api/v1/auth/google/link`.
- Challenges are random, expire after five minutes, store nonce/session hashes and are deleted atomically before verification. Every mutation passes the existing exact-Origin and synchronizer-CSRF middleware. The nonce is included in the GIS ID token and checked server-side.
- The supported library verifies signature, issuer, audience and expiry. Additional checks require subject, verified email and expected nonce. Stable subject, not email, identifies returning users.
- Migration `010_google_identity.sql` adds a unique provider identity per user and challenge table, and permits null password hashes for Google-only accounts. Existing password hashes and records are preserved. It was applied only to disposable test clusters.
- Existing matching email returns `GOOGLE_LINK_REQUIRED`; no silent linking. The authenticated Account page requires current password plus Google proof with matching email. SQL uniqueness prevents assigning a provider identity twice. No workspace or privileged membership is created by Google login.
- Successful login uses the existing Passport session regeneration and rotates its CSRF token. Existing logout destroys the session. No new JWT system or frontend token storage was introduced.
- Added localized loading, disabled, error and retry states and the official Google-rendered button. Email/password registration and sign-in remain available. Account linking is explicit and independent of company permissions.
- Enabled-only CSP/COOP adjustments permit official GIS resources while retaining Helmet and existing same-origin controls. The selected flow is a JS ID-token callback, not authorization-code exchange; PKCE/redirect-state are not applicable to this flow.
- Compatible dependency updates were applied. A broader Angular patch installation encountered a peer-resolution conflict and was not forced; pinned Angular versions remain consistent with the existing application. Remaining findings are listed below.

Main changes: `apps/api/src/{google-auth.ts,app.ts,config.ts}`, `apps/web/src/{google-sign-in.ts,main.ts,app.html,locales/ar.ts}`, migration 010, `.env.example`, package/lockfile, Google/API tests, and `scripts/auth-browser-review.ts` for a guarded synthetic-only local review server. No financial model was changed.

Final console inspection also found a missing favicon request. Added a small SVG using the existing upward-arrow identity and linked it from `index.html`; this fixes the 404 without redesigning the application. Anonymous `/auth/me` 401 responses are expected before login. Final smoke evidence and Arabic login/account screenshots are in `D:/DockerTests/auth-final-smoke.json` and `simulator-final-{auth,account}-ar.png`.

## 3. Actual tests and findings

| Check | Result |
| --- | --- |
| TypeScript + Angular template checks | Passed |
| ESLint | Passed |
| Automated unit/integration suite | **642 passed**, 21 files |
| Backend production build | Passed |
| Frontend production build | Passed; initial bundle 750.71 kB exceeds the 750 kB warning budget by 712 bytes |
| Browser review | 90 layout checks: 15 routes × 2 languages × 3 widths; no document overflow or page JavaScript exceptions |
| Printed decision brief | Actual English and Arabic PDFs generated and inspected; 4 pages each, nonempty text and visible data/tables |
| Live Google provider login | **Not verified: user has not configured Google Cloud** |
| Live Groq call | Not performed; deterministic/manual and provider-failure behavior tested without fabricating a live AI result |

Auth regression covers registration, password errors, session persistence/logout/expiry, exact Origin and CSRF, tenant access and the full role matrix. Google integration tests use an explicitly injected test verifier: matching-email collision, replay rejection, password confirmation, linking preserving the original user, subsequent subject login, new Google-only account with no workspace access, cross-browser nonce rejection and expired proof. Separate verifier tests assert audience is passed to the supported library, mandatory claims/nonce are checked, and library errors fail closed. These tests do not claim real provider verification or consent success.

The first forecast run failed because the Windows `python` alias pointed to the Store launcher; it was rerun with the bundled real interpreter through `FORECAST_PYTHON`. Forecast and integration tests then passed. An orphan disposable PostgreSQL worker from an interrupted run was identified and stopped; subsequent isolated runs completed. No production role/database was used. Initial fast browser traversal triggered rate limiting; the review was paced and rerun, with protections unchanged.

Financial verification includes exact decimal results, frozen baseline snapshots, scenario comparisons, Python forecasting and approval, stress calculations, immutable artifacts, tenant isolation, import security and AI evidence/fallback contracts. Existing tests inspect the real calculations; provider fixtures are labelled test inputs.

Routes reviewed: `/`, `/sign-in`, `/sign-up`, `/workspaces`, `/account`, and `/workspaces/:workspaceId/{overview,planning,imports,forecasts,decisions,stress,briefs,members,settings,setup}`. Populated baseline/scenario/stress/comparison/brief evidence comes from the guarded synthetic review server. Original company records were not used.

Evidence:

- `D:/DockerTests/simulator-auth-browser-results.json` (90 checks).
- `D:/DockerTests/simulator-auth-en.png`, `simulator-auth-ar.png`.
- `D:/DockerTests/simulator-brief-en.pdf`, `simulator-brief-ar.pdf`, corresponding screenshots/text and `simulator-brief-contact.png`.
- English PDF text lengths per page: 1158, 1285, 1438, 1684; Arabic: 1087, 1093, 1224, 1403.

The supported output reviewed is **browser Print decision brief / Save as PDF**, not a newly added server PDF endpoint. Baseline closing cash `64,000.00 EGP` and scenario/zero-change stress closing cash `48,000.00 EGP` are present, with monthly tables, source/run IDs, declared thresholds and limitations. Both PDFs were rendered and visually inspected across all four pages. Original synthetic source names remain in English in the Arabic report. No generic CSV/XLSX report-export capability is claimed; import source downloads are a different feature.

## 4. Google Cloud — خطوات الإعداد المستقلة

1. افتحي [Google Auth Platform](https://console.cloud.google.com/auth/overview) واختاري مشروع Google Cloud خاصًا بالمحاكي، منفصلًا عن FinPilot.
2. أكملي **Branding** باسم Financial Decision Simulator وبريد الدعم، ثم **Audience** وحسابات الاختبار عند استخدام Testing. بيانات الدخول الأساسية فقط: `openid`, `email`, `profile`.
3. **Clients → Create client → Web application**، باسم واضح للمحاكي.
4. في **Authorized JavaScript origins** أضيفي `http://localhost` و`http://localhost:4324` للاختبار المحلي على خادم المراجعة. اضبطي `APP_ORIGIN=http://localhost:4324` وافتحي نفس العنوان؛ قيمة `127.0.0.1` الحالية لا تطابق localhost في فحص CSRF.
5. لا حاجة إلى redirect URI أو Client Secret في تكامل GIS الحالي؛ الاعتماد يرجع إلى JavaScript callback ثم يتحقق منه الخادم.
6. في `.env` الخاص بهذا المشروع أو بيئة عملية الخادم أضيفي `GOOGLE_CLIENT_ID` الحقيقي، ثم `GOOGLE_AUTH_ENABLED=true`. لا تضعي أي سر في Angular. القالب `.env.example` يحتوي الأسماء فقط والقيم معطّلة.
7. مشغّل المراجعة `scripts/auth-browser-review.ts` يبني إعدادات معزولة ولا يقرأ `.env` الأصلي. عند اختبار Google عدّلي إعداداته المحلية ليقرأ القيم الحقيقية واضبطي `APP_ORIGIN` الموافق، مع الإبقاء على قاعدة البيانات التجريبية الجديدة. أعيدي التشغيل. لا تستخدمي اتصال البيانات الأصلية لمجرد تجربة الدخول.
8. شغّلي migration 010 في قاعدة اختبار أولًا باستخدام دور الترحيلات، ثم شغّلي التطبيق بدور `planner_app` غير الإداري. مشغّل المراجعة يفعل ذلك في قاعدة معزولة تلقائيًا.
9. اختبري الحساب الجديد، والحساب الموجود ثم الربط من Account بكلمة المرور، وإعادة تحميل الصفحة والخروج، وحالات رفض/إلغاء Google. الإعداد وحده لا يكفي لإعلان نجاح الدخول الحقيقي.
10. بعد تحديد النطاق النهائي أضيفي أصل HTTPS الحقيقي وإعدادات الخصوصية/Branding الموافقة. لا يوجد نطاق إنتاج مفترض أو نشر ضمن هذه المهمة.

Reference: [Google GIS setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [ID-token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [GIS JavaScript nonce reference](https://developers.google.com/identity/gsi/web/reference/js-reference).

## 5. Deployment review

- Node 24, Python 3.11+ (a working interpreter tested locally), PostgreSQL 18. Use a long-running Node service capable of spawning the trusted Python worker. Static-only frontend hosting cannot run this backend/forecast engine.
- Prefer the existing single HTTPS origin: Express serves `dist/web/browser`; relative `/api/v1` calls retain sessions and CSRF. No permissive cross-origin workaround was added.
- Build: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Runtime: `node dist/apps/api/src/server.js` from release root. Preserve the Python worker files and migrations.
- Set `NODE_ENV=production`, exact `APP_ORIGIN`, runtime `DATABASE_URL`, random `SESSION_SECRET`, correct `TRUST_PROXY_HOPS`, `FORECAST_PYTHON`, and Google settings. Keep migration/admin credentials separate. Production session cookie remains Secure/HttpOnly/SameSite=Lax and `__Host-` scoped.
- Run migration 010 through the approved release process only after backup. Runtime cannot be table owner, superuser or BYPASSRLS; startup enforces this. All original RLS/permission rules remain in place.
- `GET /api/v1/health` exists, but it is a basic liveness response rather than a full database/Python readiness probe. Include dependency checks in the deployment verification.
- Configure encrypted PostgreSQL backups and perform an isolated restore rehearsal. Neither a production backup nor restore drill was performed here.
- Optional `AI_ENABLED=false` keeps manual functionality. Enabling assistance requires a valid server-only Groq key and the existing privacy/evidence controls; no live provider result is claimed.
- Resource requirement depends on uploads, forecasts and concurrency. The forecast runner caps active executions at two; single-instance rate limiting remains. No guarantee of fitting three projects in 4 GB / one CPU was established by this task.
- Existing operational limitations in `docs/SECURITY.md` still apply, including no password recovery, email verification or MFA flow. Google-only users depend on their provider account; a recovery/unlink/password-setting feature was not invented here.

## 6. Outstanding release gates

1. Real Google credentials, consent/branding, authorized origins and end-to-end browser testing.
2. Dependency security review: after compatible fixes, production-only audit retains **one high-severity `@angular/router` finding** concerning SSR. This application is client-rendered, but the dependency advisory remains. Full audit retains 7 findings (6 high, 1 moderate), including build tooling; see `D:/DockerTests/simulator-auth-dependency-{final,all}.json`. Do not publish development servers; further toolchain updates need a compatible dependency resolution and revalidation.
3. Public HTTPS, host/proxy/session behavior, backups/restore, load limits and operational monitoring.
4. Safari, assistive-technology and real Google popup/FedCM tests remain outside completed validation.
5. The minor initial-bundle budget warning remains; the budget was not raised to conceal it.

**Conclusion:** independent local authentication implementation and full-stack review completed. Live provider acceptance and release readiness remain conditional; nothing has been deployed or pushed.

## Local Google configuration — 25 October 2026
User supplied a real public OAuth client for financial-decision-simulator. The isolated review launcher now accepts GOOGLE_AUTH_ENABLED and GOOGLE_CLIENT_ID from its process environment, uses http://localhost:4324 and a fresh synthetic PostgreSQL cluster on 55449. Original records were not accessed. Node runs with --use-system-ca; Google certificate retrieval succeeded. Browser verified enabled configuration and the official GIS button. Real account login remains pending user interaction. No deployment performed.
