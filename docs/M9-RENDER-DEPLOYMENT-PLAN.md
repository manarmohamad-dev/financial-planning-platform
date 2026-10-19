# M9 — Render deployment plan

Date: 2026-10-19 (Africa/Cairo). Investigation only. This document is the only file created in this task. No code/configuration change, deployment, push, billing action, provider call or Neon connection was performed.

## 1. Recommendation and verdict

**Architecture GO; deployment NO-GO until the gates below are closed.**

Recommend **one Render Docker Web Service, initially 1 CPU / 2 GB (`1c-2g`, formerly Standard), on a Hobby workspace, plus the existing Neon database and existing Groq provider**. One HTTPS origin serves Angular static assets, direct routes and `/api/v1`. Node launches the existing Python subprocess. No separate frontend, proxy service, Redis, new database or persistent disk is required for the current architecture.

This is a resource recommendation, NOT measured proof or authorization to spend. The exact minimum has not been established. A 512 MB paid service is only a possible later cost optimization after worst-case Linux testing; Free is not recommended for dependable permanent availability.

Correction to the supplied architecture description: `package.json` currently pins Angular **21.2.24** (build/CLI tooling has separate patch versions), not Angular 22. Node requirement is >=24 <25; Express is ^5.1.0. Preserve the lockfile and current versions; no Angular upgrade is needed for hosting.

## 2. Repository evidence / compatibility

| Area | Evidence | Conclusion / remaining gate |
|---|---|---|
| Full-stack start | `package.json` scripts; `apps/api/src/server.ts` | `npm ci` then `npm run build`; runtime `node dist/apps/api/src/server.js`. No npm start script. Runtime env is host-supplied, not automatically loaded from .env. |
| SPA / same origin | `apps/api/src/app.ts:637` | Serves `dist/web/browser` if present and handles `/`, sign-in/up, account, workspaces and workspace/page deep links. API paths are excluded from static middleware. Query IDs remain browser-side. |
| Python | `apps/api/src/forecast-runtime.ts:18–42`; `packages/forecasting/runtime/worker.py` | Two concurrent children maximum; `python -I -S`, stdin JSON, 10s wall timeout; Linux worker limits CPU to 5s and address space to 256 MiB per child. Standard-library imports only: no pandas/numpy installation needed. Node+Python in the same Docker image is compatible in principle. Linux/Render execution remains to be tested. |
| Neon / RLS | `apps/api/src/db.ts:3`; `apps/api/src/app.ts:60–85` | Pool max 10, connection timeout 5s, idle timeout 10s. Startup SELECT 1 and unsafe-role checks. Transaction-local actor/workspace settings. Preserve limited non-owner/non-superuser/non-BYPASSRLS runtime role; sessions table must already exist. |
| Authentication | `apps/api/src/app.ts:143–175` | PostgreSQL session store, production `__Host-planner.sid`, Secure, HttpOnly, SameSite=Lax, path `/`, 8h cookie. CSRF validates exact APP_ORIGIN. Single origin avoids cross-site cookie/CORS changes. Verify proxy hop count and HTTPS headers rather than weakening cookies. |
| Uploads | `apps/api/src/import-routes.ts:106`; `packages/imports/src/model.ts:11–21`; parser.ts | Binary octet-stream route allows 5 MiB (5,242,880 bytes), independently of the 64kb JSON limit. XLSX expansion bounded to 32 MiB, 8 MiB/part, 250 archive entries, 80,000 cells. Parsing creates buffers/objects: upload size is not peak RAM. Render edge acceptance of boundary-size uploads must be tested; not claimed here. |
| Persistence | `migrations/006_imports.sql:3` | Original bytes stored in PostgreSQL bytea, parsed/lineage structures in JSONB. No filesystem upload volume required. No schema/data change proposed. |
| AI | config.ts; ai-provider.ts; ai-routes.ts | Existing server-side Groq HTTPS integration; preserve model, strict evidence validation, consent, permissions and fallback. No calls or key inspection during audit. Actual deployed egress/quota/ZDR verification remains. |
| PDFs | `apps/web/src/stress.ts:406–407` | Browser `window.print()`: no server Chromium/Puppeteer or PDF renderer needed. Verify AR/EN fonts and all pages from deployed origin. |
| Health | app.ts:180; server.ts | `/api/v1/health` is liveness only; startup checks DB, but health does not continuously prove DB, Python or AI readiness. Do not treat health 200 as full acceptance. |
| Frontend size | existing isolated production artifact `tmp/p0-release/dist/web/browser` | 15 files / 1,857,417 bytes measured on disk. Prior successful build: initial 735.25 kB, estimated transfer 145.17 kB. This is not server RAM usage. |

Render supports Dockerfile builds and prebuilt images, including custom runtimes; an image containing Node 24 and Python avoids depending on a native runtime's incidental Python installation. [Docker documentation](https://render.com/docs/docker).

## 3. Existing Dockerfile: smallest required changes (NOT applied)

Current Dockerfile explicitly builds **only API** with `RUN npm run build:api`. It already:
- Uses Node 24 Debian Bookworm slim for build/runtime.
- Installs python3 and CA certificates in runtime.
- Installs locked dependencies, copies compiled packages and worker at the expected path, runs as non-root `node`.
- Starts compiled Express; does not run migrations automatically.

Required packaging change: replace API-only build step with the existing **`npm run build`**. Existing `COPY --from=build /app/dist ./dist` will then include `dist/web/browser` alongside API/packages. Existing apps copy and .dockerignore allowlist include Angular source/public assets, so no new build tool or server is needed. Correct the backend-only comment. Confirm output paths, lazy chunks, screenshot assets and worker in a clean Linux image. Keep `/app` as WORKDIR.

No change to CMD needed. `EXPOSE 3000` is documentation, not the listening configuration; Render injects PORT (normally 10000). Set BIND_HOST=0.0.0.0. Docker service uses Dockerfile build/CMD, not a separate dashboard npm build/start command. [Web services](https://render.com/docs/web-services).

Optional later reproducibility hardening: pin tested base-image digest and record Python version; do not add packages or algorithms unnecessarily. Do not use migration/admin credentials as build args. No automatic pre-deploy migration for existing Neon.

## 4. Free vs paid / current official facts

| Compute | CPU / RAM | Base monthly USD | 12-month equivalent | Suitability |
|---|---|---:|---:|---|
| Free | 0.1 CPU / 512 MB | 0 | 0 | Preview only; unreliable for this objective |
| `0.5c-512mb` (Starter) | 0.5 CPU / 512 MB | 7 | 84 | Cheapest paid candidate, memory/latency unproven |
| `1c-2g` (Standard) | 1 CPU / 2 GB | 25 | 300 | Recommended initial resource envelope, still requires measurement |

Prices from Render's official pricing search-index table, corroborated by compute-plan documentation; the plain pricing-page reader omits JS-rendered cards. Reconfirm the exact account checkout price before approval. Annual figures are arithmetic **12 x monthly**, not a verified annual subscription discount or commitment. [Pricing](https://render.com/pricing), [compute specs and renamed plans](https://render.com/docs/compute-plans).

Free: idles after 15 minutes, approximately one minute to wake, 750 shared instance-hours/month; ephemeral filesystem; possible restart/suspension; no persistent disk/shell/one-off jobs. Excess externally initiated traffic to databases/APIs can trigger suspension. These are particularly relevant to Neon/Groq. Paid compute removes Free idle restrictions but is not a zero-downtime guarantee. [Free service limitations](https://render.com/docs/free).

Workspace fees are separate: Hobby $0; no paid workspace is needed for this solo project. Current Hobby includes 5 GB outbound and 500 build minutes/month, two custom domains. Pro is optional $25/month extra, not the recommended compute subscription. [Workspace plans](https://render.com/docs/new-workspace-plans).

Budget: **$25/month base Render compute**, or $300/12 months, plus applicable tax, overages and any existing Neon/Groq costs. No assumption that their accounts remain permanently free. Hobby public egress beyond 5 GB is $0.15/GB; traffic to Neon/Groq as well as browsers counts. Domain registration is separate. No Render database/disk purchase is needed. [Bandwidth](https://render.com/docs/outbound-bandwidth).

### Payment requirement

Paid services require a valid payment method; Render accepts major credit/debit cards and may perform verification authorizations. Do not add one without user approval. Official Free documentation contemplates accounts without payment methods, but does not guarantee this account can bypass verification. The user previously encountered a card prompt on Render; treat that as an unresolved account gate, not disproved by Free pricing. [Terms, payment requirements](https://render.com/terms), [pricing/payment FAQ](https://render.com/pricing).

HTTPS/onrender.com URL is included. Custom domains receive managed renewing TLS; no custom domain purchase is required. Pick one canonical public origin; if using another domain, update APP_ORIGIN and redirect alternate entry points rather than loosening CSRF. [Custom domains](https://render.com/docs/custom-domains).

## 5. Resource estimate and qualification gate

**No measured production/Linux peak RAM exists in this audit.** Two workers each have a 256 MiB *virtual-address-space cap*, not a measured RSS allocation. Node, parser objects, password hashing, result serialization and concurrent requests add memory. Therefore neither 256 MB nor 512 MB can be certified from source inspection. CPU throttling also matters with the fixed 10s forecast wall timeout.

Engineering estimate: target >=1 GB aggregate RAM and roughly 1 CPU for an initial low-concurrency qualification; the available conservative Render tier is 2 GB/1 CPU. This is not a load-tested lower bound, and even 2 GB is not guaranteed for arbitrary concurrency. Do not reduce imports, worker count or safeguards to fit a cheaper host.

Before selecting a final tier, build the full Linux image and measure aggregate container memory/CPU (not Node heap alone): idle/login, boundary 5 MiB CSV/XLSX within supported parser limits, two simultaneous forecasts plus import, scenario/stress/brief requests, and recovery after restart. Require no OOM, acceptable latency, no foreground fallback caused by resource starvation, and operational headroom (proposed target peak below ~75% RAM at agreed demo concurrency). Build-memory consumption is separate from runtime; verify Render's actual builder succeeds. Docker executable was not available in this shell; no image build was attempted/claimed.

## 6. Environment variables — names only / safe settings

| Variable | Requirement |
|---|---|
| NODE_ENV | production |
| PORT | Render-provided port; do not force local port |
| BIND_HOST | 0.0.0.0 |
| APP_ORIGIN | Exact canonical https origin, no trailing path |
| DATABASE_URL | Secret: existing Neon limited runtime credential, required TLS, correct DB/branch; never admin |
| SESSION_SECRET | Secret: stable random >=32 characters; rotate deliberately, not per deployment |
| TRUST_PROXY_HOPS | Verify Render route/header chain; likely one edge hop, but must prove before accepting Secure cookies and client-IP rate limiting |
| FORECAST_PYTHON | /usr/bin/python3 (already in image) |
| AI_ENABLED | true only after existing approved Groq configuration is verified; false supports manual fallback |
| GROQ_API_KEY | Server-only secret, never Angular/build/logs |
| AI_MODEL | Existing fixed openai/gpt-oss-120b; do not change |
| AI_TIMEOUT_MS | Existing default 20000; allowed 1000–30000 |

MIGRATION_DATABASE_URL is maintenance-only, not runtime. Do not supply TEST_ADMIN_DATABASE_URL, local synthetic test credentials or laptop TLS keys. Production .env is not copied. Maintain verified TLS for Neon/Groq; never disable certificate validation. Neon suspended-compute wake latency must fit the current connection timeout; measure without modifying connection behavior speculatively.

## 7. GitHub and publication safety

GitHub is **not mandatory**: Render accepts linked Git providers (private repositories supported), public Git URLs, or prebuilt registry images. Prefer a private release repository and narrowly scoped Render authorization. [Deployment sources](https://render.com/docs/web-services).

**Current repository is not certified safe/complete to publish.** Inspection found 157 status entries, including pre-existing work. Landing source files, translations and public images are currently untracked. A Git deployment from the present committed state would omit new work. `git ls-files` for .env/.env.*, private-key extensions and .local returned only `.env.example`, which is encouraging but not a complete secret audit. No secret values were read or printed. Public evidence/docs/history can contain information outside those filename patterns.

Before any push: review intended diff, include all accepted source/assets/lockfile, exclude .local/tmp/output databases, keys, raw provider outputs and session artifacts; scan staged content AND full history with redacted output; review screenshots/docs for private data and third-party asset licenses. If a real credential is discovered, rotate through approved procedure before publication. Preserve unrelated work; do not blindly `git add .`, reset or clean. A reviewed release commit/archive is required even with a private repo. No push performed.

## 8. Planned deployment sequence (requires separate approval)

1. Approve budget/payment or accept that Free cannot meet dependable always-on objective. Confirm account access; do not enable billing during planning.
2. Create/review a release checkpoint including landing changes; secret/history and license review; user-approved push or private image publication later.
3. Apply only the Docker full-build change, run clean npm install/typecheck/lint/tests/build and Linux container resource gate using synthetic local data.
4. Secure read-only Neon preflight: intended branch/schema present, limited role/RLS/session table and backup/recovery arrangements. Do not migrate/reset/seed. Use region near Neon; exact Neon region not inspected here.
5. Create one Docker Web Service, set Dockerfile path/build context to the actual app root, manually controlled deploys initially; 1c-2g only after approval. No new Render Postgres or persistent disk.
6. Set runtime secrets/config privately, canonical origin, bind/PORT and verified proxy setting. Health path `/api/v1/health`. Keep session secret stable.
7. Public acceptance using designated synthetic workspace: HTTPS; root and direct links; AR/EN/RTL; login/logout/reload and cookie flags; CSRF denial; Owner/Manager/Analyst and workspace isolation; import at supported limits/lineage; optional forecasts; all four decisions; comparisons/risk; real evidence-grounded Groq assistance and unavailable fallback; AR/EN PDF every page. Do not send real financial data in tests or treat health-only as success.
8. Verify persistence and sessions through controlled restart; monitor memory/CPU, latency, status/error logs, DB connections and usage/egress. Logs must not expose bodies, tokens or credentials. Database backup ownership and session/audit retention remain operational responsibilities.
9. Record exact URL, image/commit, settings, measured limits and rollback steps. Roll back previous application image/commit with the same compatible DB; no DB rollback/reset. If resource gate fails, stop and request approved sizing instead of silently upgrading.

## 9. Blockers / fallback

| Gate | Status | Minimum resolution |
|---|---|---|
| Complete Docker artifact | Confirmed backend-only | Full existing npm build, verify SPA assets in final image |
| Release completeness/safety | Dirty tree and untracked source confirmed | Reviewed complete checkpoint + redacted secret/history scan |
| Billing/account | Not authorized; prior card requirement | Explicit user approval and account verification before paid service |
| Linux resource fit | Unmeasured | Synthetic container/host qualification; no formula/algorithm changes |
| Render proxy/Neon/Groq public integration | Not verified live | Secure env and deployed acceptance after approval |

Fallback: same single-service image on $7/512 MB **only if** measured qualification proves headroom and latency; not an automatic downgrade. Free can be a temporary preview with sleep/suspension explicitly accepted, not the recommended permanent result. Separate frontend/backend is not currently necessary and would introduce same-origin routing/cookie/CSRF work; do not split merely to display a landing page while backend sleeps. Keep the existing local/tunnel demo only as temporary contingency, not as fulfillment of laptop-independent hosting.

**Final: GO for the proposed single-Docker architecture and preparation after approval. NO-GO for deployment now, and NO-GO for claiming Render Free is sufficient.** No confirmed financial/business-logic change is required.
