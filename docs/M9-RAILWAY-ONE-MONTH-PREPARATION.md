# Railway: two-project, one-month preparation

Date: 2026-10-20. LOCAL PREPARATION ONLY. Payment gate remains CLOSED.
No subscription, card, deployment, push, production database access or migrations.

## Service configuration prepared

| Setting | Financial simulator | Luma |
| --- | --- | --- |
| Source | This repository; existing release plus reviewed local preparation changes | Separate local clone outputs/luma-railway-preparation |
| Root | / | /backend |
| Builder | Existing Dockerfile | New backend/Dockerfile |
| Start | Image CMD: node dist/apps/api/src/server.js | Image CMD: node server.js |
| Health | /api/v1/health | /api/health |
| Runtime | Node 24, Python3, CA certificates | Node 24 |
| Persistence | Existing Neon, no new volume | Existing MongoDB; README identifies Atlas, live URI not revealed/verified |

For the simulator, the existing full-stack image can serve Angular and API under
one Railway HTTPS origin, avoiding a Vercel API proxy for that application.
Use APP_ORIGIN equal to that exact canonical origin. Preserve the prepared Vercel
option but do not deploy both paths or assume its cookie/proxy checks have passed.
Luma's existing Vercel frontend remains separate.

Runtime secrets only:
- Simulator: DATABASE_URL (existing restricted TLS role), SESSION_SECRET,
  GROQ_API_KEY. Other settings: NODE_ENV=production, BIND_HOST=0.0.0.0,
  FORECAST_PYTHON=/usr/bin/python3, AI_ENABLED, existing
  AI_MODEL=openai/gpt-oss-120b, AI_TIMEOUT_MS=20000.
  TRUST_PROXY_HOPS must match the observed trusted ingress chain (not guessed).
- Luma: preserve MONGO_URI, JWT_SECRET, JWT_EXPIRES_IN, CLIENT_URL, NODE_ENV.
- Both consume Railway PORT. No secrets in build args or frontend.
- Never seed Luma, reset databases or run production migrations as a start command.

## Blocking local proof

Docker, Podman and WSL are unavailable. Container builds, Linux startup,
resource measurements, restart tests and image-layer secret scans are NOT VERIFIED.
The earlier 621 application tests and 6 Python tests are historical passing
evidence, not container proof. No financial/authentication implementation was changed.
Luma has a historical Railway build failure; a fresh container build must succeed
before spending money. Do not infer a root cause from its FAILED label.

Next technical step: install/start a Linux Docker engine (user may need to complete
Windows administrator/WSL/reboot steps), then build both images locally and use
disposable PostgreSQL/MongoDB synthetic data for authenticated acceptance.
Do not use production .env or databases. Measure both workloads together.

## Financial gate: requested guarantee is NOT established

Sources checked on 2026-10-20:
- https://docs.railway.com/pricing/plans
- https://docs.railway.com/pricing/cost-control
- https://docs.railway.com/pricing/faqs

Hobby is recurring, minimum $5 with $5 included resource usage. A compute hard
limit shuts workloads down; it does not cap card conversion fees, taxes or
independent Railway Agent usage. Do not use Railway Agent; it is unrelated to Groq.
No verified prepaid, fixed-$10, one-month-only product has been established.

The cancellation FAQ states that cancelling stops deployments while the plan
remains active until cycle end. Thus do NOT promise that cancelling immediately
after subscribing preserves a month of service. Previous advice suggesting a
guaranteed month with immediate nonrenewal is not established.
Final usage invoices may arrive after cancellation. Card removal requires a
cancelled subscription and no pending invoices.

Before payment, the cardholder/user must see the exact checkout tax-inclusive
amount, billing period/end timestamp, cancellation behavior and minimum hard
limit. Resolve whether scheduled cancellation is supported without stopping
services. A reminder is not a nonrenewal guarantee. No dates or reminders have
been scheduled because no subscription exists.

If the strict requirement is <= $10 total including all fees AND no renewal
without relying on a later manual cancellation, do not subscribe until Railway
explicitly confirms a supported mechanism satisfying both requirements.
Do not treat a declined card as cancellation or elimination of accrued debt.

## End-of-month procedure (future approval, not executed)

1. Save demo video/screenshots and code before service shutdown.
2. Cancel the correct workspace plan BEFORE the actual renewal timestamp;
   allow for stopping both applications. Obtain cancellation confirmation.
3. Inspect and settle the final legitimate usage invoice within the agreed
   total budget; do not assume cancellation erases prior usage.
4. Verify no active paid subscription/add-ons or pending invoices remain.
5. Cardholder removes the saved payment method if desired.
6. Keep external Atlas/Neon and source repositories; do not delete data.

## Verdict

Verification this pass: simulator `npm run build` passed (API TypeScript and
Angular production build; initial bundle 735.25 kB). `git diff --check` passed.
Luma: Node 24 syntax checks passed for all 18 backend JavaScript files;
`git diff --check` passed. Dependency installation did not complete, so no Luma
startup or database-connected acceptance is claimed. Original pnpm lock retained.

Configuration preparation is possible without payment. Purchase and deployment
remain NO-GO until container acceptance and the strict billing gate are resolved.
