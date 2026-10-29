# Independent Express + Python backend — deployment requirements

Reviewed 2026-10-19. Documentation only. No deployment, push, billing, database connection/migration or application changes.

## Conclusion

The current backend can run independently without changing financial or authentication logic. Use one persistent Linux service/container containing Node 24 and Python, with HTTPS ingress and outbound Neon PostgreSQL/Groq access. A separately deployed Python web service is NOT needed: Node starts the existing bounded Python subprocess.

No permanent host has yet been proven to satisfy this project's runtime, the no-card preference and a hard $5/month ceiling. Railway Free is a conditional no-card evaluation candidate, not an accepted permanent solution. Do not interpret a $5 Hobby minimum as a maximum bill.

## Exact commands and artifact contract

Run from the repository root (the worker path is resolved relative to the working directory):

```sh
npm ci
npm run build:api
npm prune --omit=dev
node dist/apps/api/src/server.js
```

These are preparation/build/start stages, not a command to run against production now. Do not run prune in the developer working tree; use a disposable build/release directory or container. Build needs devDependencies/TypeScript; runtime does not. There is no npm start script. Do not use npm run dev/tsx as a production start command.

Runtime artifacts: package.json, package-lock.json, production node_modules, compiled dist/apps/api and dist/packages, and the **uncompiled** `packages/forecasting/runtime/worker.py`. Migrations are versioned release material but must not run automatically. No .env, local test databases, credentials, screenshots or private experiments in upload/build context.

The existing root Dockerfile already installs Node 24 + Python3 + CA certificates and runs as user node. It also builds/copies Angular; retaining those assets is compatible with a Vercel frontend and does not require another Dockerfile. For a native backend-only release, omit dist/web; app.ts serves Angular only when its index exists. No packaging changes are necessary before hosting eligibility is established.

## Runtime evidence

| Requirement | Verified source / consequence |
| --- | --- |
| Node | package.json engines >=24 <25; Docker node:24-bookworm-slim |
| Python | Standard library only (json, decimal, platform, resource on Linux); Bookworm system Python3 (3.11 family). No pandas/numpy/pip dependency needed. A universal minimum Python version is not declared; validate the actual host executable rather than assuming all Python3 versions. |
| Process | apps/api/src/server.ts starts long-running Express; SIGINT/SIGTERM close listener and pool |
| Port | config.ts accepts provider PORT 1–65535, defaults 3000; BIND_HOST=0.0.0.0 for public container ingress |
| Health | GET /api/v1/health returns status ok; liveness only. Startup SELECT 1 and role checks gate listening, but health does not recheck DB/AI/Python. |
| Forecast | forecast-runtime.ts: Python -I -S, stdin/stdout JSON, max two active workers, 10-second wall timeout, 1MiB output cap; no inherited DB/AI secrets |
| Linux resource limits | worker.py: 5 CPU seconds, 256MiB virtual address space per worker, no file output. The 256MiB cap is NOT a measured resident-memory requirement. |
| Database | db.ts: max 10 connections, connection timeout 5s, idle 10s; transaction-local user/workspace context |
| Least privilege | app.ts rejects superuser, BYPASSRLS and business-table owner runtime roles |
| Storage | migrations/006_imports.sql stores originals as bytea and parsed input as JSONB; sessions and financial/audit records in PostgreSQL. No app persistent volume required. |
| Uploads | import-routes.ts receives raw application/octet-stream; imports/model.ts allows 5MiB input, 32MiB expanded archive, 8MiB part, 250 entries, 2000 rows, 40 columns, 80000 cells. Memory can exceed compressed file size. |
| PDF | apps/web/src/stress.ts calls window.print(); no server Chromium/PDF process or persistent PDF files required |

## Environment variables (names only for secrets)

| Variable | Production value / purpose |
| --- | --- |
| NODE_ENV | production |
| PORT | host-assigned port; do not hardcode over provider assignment |
| BIND_HOST | 0.0.0.0 |
| APP_ORIGIN | exact stable HTTPS Vercel frontend origin, no path or trailing slash |
| DATABASE_URL | existing restricted Neon connection, TLS certificate verification enabled; backend runtime secret only |
| SESSION_SECRET | stable random secret >=32 characters, backend runtime only; retain across restarts |
| TRUST_PROXY_HOPS | existing supported 0–2, chosen only after inspecting actual ingress/Vercel proxy chain |
| FORECAST_PYTHON | absolute installed Python3 path, /usr/bin/python3 in current Dockerfile |
| AI_ENABLED | true only with authorized working Groq setup; false retains manual fallback |
| GROQ_API_KEY | backend runtime secret only, never frontend/build args/logs |
| AI_MODEL | unchanged openai/gpt-oss-120b |
| AI_TIMEOUT_MS | existing default 20000; supported 1000–30000 |

Vercel gets BACKEND_ORIGIN only, not DATABASE_URL/SESSION_SECRET/GROQ_API_KEY. Do not supply migration/admin credentials to the service. Preserve existing Neon role, RLS and schema. Outbound DNS, verified TLS/HTTPS and TCP access to Neon (normally 5432), plus Groq HTTPS 443, are necessary. Worker itself does not access the network.

## Vercel API rewrite compatibility

The prepared frontend routes /api/* to a fixed backend origin. This is architecture-compatible but not live-verified. All browser calls stay same-origin, avoiding new cross-site cookie semantics and credentialed CORS configuration.

Keep existing __Host-planner.sid, Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain. Keep exact APP_ORIGIN + X-CSRF-Token validation. Require a stable frontend hostname; arbitrary preview origins are not authorized. Validate preservation of Origin, Cookie, Set-Cookie, request body, query strings, status codes and downloads through actual ingress. Validate trusted protocol/client IP and rate limiting; a numeric hop count must not blindly trust spoofable headers or a shorter direct-origin path.

API no-store must survive the proxy. Test 5MiB raw uploads and long-running forecasts/AI including a cold backend. Do not assume Vercel Function limits apply to external rewrites or assume rewrites have no limits. No live provider limit/behavior acceptance was performed. If proxy behavior cannot preserve the existing security contract, stop; do not change cookie flags or disable CSRF.

## Resource assessment

No Docker/Podman command is available on this machine (rechecked); previous container profiling remains blocked. No new measurement is claimed.

- 512MiB: plausible **trial size only**, not accepted. Node heap, parsing buffers, PostgreSQL client state, native overhead and up to two Python children share it. Bursty uploads and parallel forecasts require measurement.
- 1GiB and roughly 1 vCPU: reasonable initial profiling target (engineering estimate, NOT a proven minimum). A 0.1-vCPU service can hit the unchanged 10s wall timeout even if memory fits.
- 2GiB: more headroom, still not proof and not an established requirement. Build resources differ from runtime resources.
- Qualification: max supported synthetic imports, two forecasts, concurrent scenario/AI requests, restart/session persistence, peak container memory, OOM events and latency. Preserve all limits/features; never shrink inputs to pass hosting tests.

## Current hosting options — official sources reviewed

| Option | Compatibility / budget / card conclusion |
| --- | --- |
| Railway Free | Docker supported. Pricing advertises no card, 0.5GB RAM/up to 1vCPU per service and $1 monthly credit after initial trial. Existing account entitlement must be inspected, not assumed renewed. Full trial has network access; limited trial restricts outbound connectivity, which can block Neon. Candidate for eligibility check and bounded trial only, not continuous uptime guarantee. |
| Railway Hobby | $5 minimum including $5 usage, not fixed $5 total; additional usage charged and subscriptions require card. Not approved under strict no-card/hard-budget constraints. |
| Render Free | Technically compatible Docker service, 512MB/0.1CPU, idle sleep after 15min and about one-minute wake. User previously encountered card requirement: do not retry payment or promise eligibility. Alternative only if provider resolves this without payment and resource tests pass. |
| Koyeb Free | Technically compatible container offering, but current pricing FAQ explicitly requires a credit card and describes a $29 authorization hold. Excluded for this task. |
| PythonAnywhere Free | Free outbound internet is restricted. Ability to install Node in a console does not establish supported persistent Express ingress; not a verified fit for this architecture. No rewrite of Node/Python into a new platform model proposed. |
| DockHosting / alwaysdata | Prior unresolved OAuth/installer concerns for DockHosting and account card requirement for alwaysdata remain. Neither re-approved or changed in this pass. |

Railway's published service RAM rate is $0.00000386/GB/second: continuous 0.5GB for 30 days is approximately $5 in RAM alone, before CPU/egress. This is an illustrative calculation from published pricing, not this application's measured consumption. Even continuous 0.1GB is approximately $1 before CPU, explaining why $1 credit is not a permanent always-on promise.

## Exact next action

Read the **existing Railway account** plan/usage/verification screen only: confirm Free eligibility, remaining credit, memory limit and unrestricted outbound connectivity without adding a card. Do not create a new account to reset trial credits; do not alter existing projects or enable Hobby. If unavailable or payment is required, stop: there is no proven permanent option within all constraints in this review.

If eligible, obtain approval for a bounded trial, upload only the reviewed release or use a specifically approved repository access method (no push authorized now), configure runtime secrets securely and verify backend first. Then configure Vercel BACKEND_ORIGIN and run full public same-origin acceptance with synthetic demo data. Container profiling remains a gate, whether performed locally after Docker setup or in the approved trial; /health alone is insufficient.

## Changes and verification limits

Only this report added in this pass. Previous Vercel preparation changes remain untouched and uncommitted. No code/tests changed, so no redundant regression run. Established prior full results remain 621 TypeScript tests + 6 Python tests; preceding Vercel preparation passed 42 focused tests, lint, typecheck and Angular build. These are not new hosting verification results. No Neon calls, provider API calls, keys read, billing actions or deployment occurred.

## Sources

- https://railway.com/pricing
- https://docs.railway.com/pricing/free-trial
- https://docs.railway.com/builds/dockerfiles
- https://render.com/docs/free
- https://render.com/docs/compute-plans
- https://www.koyeb.com/docs/faqs/pricing
- https://www.pythonanywhere.com/pricing/
- https://help.pythonanywhere.com/pages/Node/
- https://vercel.com/docs/routing/rewrites
