# M9 deployment readiness handoff

Date: 2026-10-16. Scope: complete M1–M7 application, accepted revised M7 scope. **No deployment, push, billing, host selection or production Neon change performed.** M8 local acceptance is recorded in `M8-FIX-CLOSURE.md`.

## 1. Release topology and artifacts

The application is an Angular SPA plus Express API and a trusted Python subprocess, with PostgreSQL storing domain records, sessions and audit history. It is not a frontend-only application and is not compatible with an arbitrary Node-only/serverless host without verifying subprocess/runtime support.

### Smallest existing full-application path

Use a host capable of running Node 24 and Python 3.11+ (the local acceptance used the explicitly configured bundled Python). Build from the repository root:

```sh
npm ci
npm run build
node dist/apps/api/src/server.js
```

`npm run build` builds both API and Angular. There is no `npm start` script. Production environment variables must be supplied by the host; the compiled server does not automatically load the development `.env` file.

Required release files include:

- `dist/apps/api/`, `dist/packages/` and the rest of generated `dist/` JavaScript needed by the compiled imports.
- **`dist/web/browser/`**, the complete Angular output including lazy chunks/assets.
- `packages/forecasting/runtime/worker.py` at its existing relative path.
- `package.json`, the committed `package-lock.json`, production dependencies installed with `npm ci --omit=dev` in the final release runtime, and a trusted Python executable.

Run with repository/release root as the working directory. Existing `apps/api/src/app.ts` serves `dist/web/browser` and handles SPA deep links. `/api/v1` remains on the **same public origin** as the SPA. No application architecture change is needed for this topology.

### Current Dockerfile is backend-only

The existing `Dockerfile` intentionally builds only `build:api`, includes Python/worker, runs as `node`, and does **not** contain the Angular build. Building that Dockerfile alone does not produce a complete website. No new Docker infrastructure was added during M8, and no Linux image build is claimed.

If using that backend image, Angular must be built separately (`ng build web`, output `dist/web/browser`) and hosted behind a same-origin HTTPS routing layer that sends `/api/v1/*` to the API. SPA fallback must not swallow API errors. A frontend on a different public domain is **not ready merely by setting CORS**: current host-only cookies, SameSite and Origin/CSRF checks require a separately verified design. Prefer the existing single-origin complete build above when supported. Do not publish a disconnected frontend as the final product.

## 2. Configuration

| Variable | Production requirement |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Host-provided listening port; default 3000 |
| `APP_ORIGIN` | Exact public `https://` origin, no route/path; must match browser Origin |
| `DATABASE_URL` | Existing Neon database using the limited runtime login and provider-required TLS; never the owner/admin URL |
| `SESSION_SECRET` | Strong random secret of at least 32 characters, stable across restarts; store in host secrets |
| `TRUST_PROXY_HOPS` | Exact trusted proxy hop count, 0–2 as supported by current configuration; do not guess or trust arbitrary forwarded headers |
| `FORECAST_PYTHON` | Trusted executable path, e.g. `/usr/bin/python3`; worker uses Python standard library and isolated execution |
| `AI_ENABLED` | `false` until approved existing Groq key/privacy settings and free usage eligibility are confirmed for the release; manual paths remain complete |
| `GROQ_API_KEY` | Server secret only when AI enabled; never frontend/static assets/logs/repository |
| `AI_MODEL` | Preserve current `openai/gpt-oss-120b`; no model/provider substitution |
| `AI_TIMEOUT_MS` | Existing bounded setting, default 20000; supported range 1000–30000 |
| `MIGRATION_DATABASE_URL` | Administrative maintenance only, **not** needed in ordinary API runtime; do not expose it to the service |

Do not copy `.local`, local test databases, environment files, temporary TLS keys, synthetic acceptance accounts, or experimental AI outputs into the release. `.env.example` contains placeholders, not deployment credentials. `TEST_ADMIN_DATABASE_URL` must never point at Neon/shared production; tests can create databases and alter test runtime-role credentials.

## 3. Neon safety (external M9 gate)

Keep the existing database and migrations. No reset, automatic reseeding, or automatic production migration was performed or authorized by M8. Before deployment, an authorized read-only/preflight check must establish the intended database, current migration version, backup/recovery arrangements and runtime-role grants.

The runtime role must be non-superuser, non-BYPASSRLS and not the business-table owner. Application startup enforces these conditions; transactions set actor/workspace scope locally. Use the appropriate Neon TLS connection string privately, verify certificate handling against the actual host, and never disable TLS verification. Do not replace the limited credential with an admin credential to overcome a startup denial.

Pool maximum is 10, connection timeout 5 seconds, idle timeout 10 seconds. Check managed connection limits and concurrent instances before deployment. Neon connectivity/quotas/backup state were not reverified in this local closure pass.

## 4. HTTPS, sessions and CORS

Production sessions use a Secure, HttpOnly, SameSite=Lax `__Host-planner.sid` cookie, with PostgreSQL session persistence. The public reverse proxy must terminate trusted HTTPS, sanitize forwarded headers and forward the configured protocol correctly. Exact Origin plus CSRF token is required for state-changing requests. Do not loosen cookies, CSRF or tenancy to make hosting work.

Local compiled-production smoke used a temporary loopback TLS proxy with one trusted hop, and verified real sign-in, session reload, secure cookie attributes, SPA deep link, deterministic replay, unavailable-AI fallback and 403 rejection of an untrusted Origin. Browser certificate bypass was limited to the temporary local self-signed test certificate; it is not a deployment setting.

## 5. Operational checks

- `GET /api/v1/health` is a **liveness** response (`status: ok`, historical `milestone: 1` field); it is not a database/worker/AI readiness guarantee. Startup checks DB connectivity and runtime-role safety. Use a real authenticated smoke flow after deployment.
- Confirm static CSS/JS/lazy chunks load under the existing CSP, direct routes refresh correctly, and logout/login and workspace isolation work at the final HTTPS URL.
- Run one authorized synthetic import → forecast → baseline/scenario → risk → brief journey on the deployed runtime. Measure actual Node + Python peak memory, import maximums and forecast timeout behavior. Do not reduce financial/import capabilities to fit a host.
- Preserve global/auth/AI rate limits. The fast local automation hit the existing API limiter; paced runs passed. Do not disable abuse controls for demonstrations.
- Check restart/session persistence, provider/network failure, cold start and log redaction. Existing SIGTERM/SIGINT handling closes the server and pool. Do not log secrets or raw private AI context.
- Confirm actual EN/AR PDF printing from the final public origin; local eight-page PDF evidence remains valid for the unchanged print layout.

## 6. Free/no-card hosting constraints

**No currently account-verified eligible host has been selected.** A host must explicitly allow this complete Node + Python workload, HTTPS, outbound Neon/Groq access, appropriate runtime duration/memory, secret variables and the required artifact size without a card, billing or paid usage. Account-specific requirements and current free-tier rules must be checked before any provisioning. Do not infer eligibility from an old pricing page or a successful `/health` request.

Render requiring a card and excluded Back4app/Railway paths must not be revived without user direction. Do not touch `finpilot-backend` or the separate `ai-business-management-platform` project. Current project is `financial-planning-platform`.

## 7. M9 prerequisites / ordered handoff

1. Review the documented working-tree changes, create a release commit only with approval, and recheck the release tree for secrets; no push occurred in M8.
2. Obtain user approval/login for an eligible free/no-card complete host and exact public origin. If none meets the workload, report the external hosting constraint instead of weakening the product.
3. Privately provision existing limited Neon credentials, stable session secret and optional approved Groq configuration; verify production DB migration state without resetting or applying unapproved changes.
4. Build/run the complete artifact on that host. Verify HTTPS/session/proxy/CSP/SPA/worker/health, real workload capacity and free-quota/cold-start behavior.
5. Execute final deployed synthetic smoke, EN/AR/PDF and role/tenant checks. Record the final release revision, URLs, rollback artifact and operating instructions before instructor handoff.

**M8 readiness means the local application acceptance gate is closed; it does not mean a public deployment, Linux container, free-host capacity or production Neon connection has already been verified.**
