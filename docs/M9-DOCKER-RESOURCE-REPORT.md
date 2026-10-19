# M9 Docker readiness and resource report

Date: 2026-10-19 (Africa/Cairo)
Status: **PACKAGING PREPARED — CONTAINER BUILD / RESOURCE PROFILING BLOCKED**

## Confirmed environment blocker

Read-only host inspection found no docker or podman command, no Docker executable at the standard Docker Desktop path, and no matching Docker service/install directory. `wsl --status` and `wsl --list --quiet` both report: Windows Subsystem for Linux is not installed.

No Linux container engine is available. No Docker build/run/restart, image inspection or cgroup measurement was possible. Native Windows measurements are not substituted for container measurements. Docker/WSL installation may require administrator interaction and restart; none was performed automatically.

## Preparation completed

Only `Dockerfile` and `.dockerignore` changed, plus this report.

- Docker builder now runs existing `npm run build` (Angular + Express), rather than API-only build.
- Build checks require both `dist/web/browser/index.html` and compiled API entry to exist.
- Existing final-stage dist copy includes frontend lazy chunks and public assets; Express already serves these and API/deep links under one origin.
- Runtime remains Node 24 Bookworm slim with system Python3 and CA certificates. Forecast worker uses standard library; no forecasting algorithms/dependencies were changed.
- Runtime binds 0.0.0.0 via existing supported configuration; PORT remains host-controlled.
- Existing non-root user, production dependency install and unchanged compiled-server CMD preserved.
- Added Docker liveness HEALTHCHECK: Node fetch to loopback `/api/v1/health`, dynamic PORT, bounded timeout. This does not certify DB/AI/forecast readiness.
- Docker context exclusions now also cover certificate bundles, database dumps and nested node_modules/Git/.local directories. Existing allowlist excludes root .env files, docs/evidence, local databases and experiments.

No financial formula, application logic, session/permission semantics, Neon data/schema, provider/model, deployment or billing changes.

## Verification actually performed

- Relevant deployment configuration tests: **9/9 passed**.
- The health probe executed against the existing local synthetic API on port 4345: **HTTP 200**. This proves the probe works with that host process only, not a container.
- Previous full production frontend/API builds passed in the preceding landing pass. They were not rerun because application source did not change; this does not prove Docker/Linux build compatibility.
- Dockerfile source contains no credential values or secret build arguments. Build/runtime COPY inputs and context exclusions inspected. **Final image/layer secret verification remains NOT PERFORMED**, because no image exists. Filename exclusion is not proof that arbitrary source files contain no secrets.

## Actual container measurements

| Workload | Aggregate memory | CPU | Result |
|---|---|---|---|
| Idle | Not measured | Not measured | No container engine |
| Login / secure session | Not measured | Not measured | No container engine |
| Dashboard | Not measured | Not measured | No container engine |
| Scenario calculation | Not measured | Not measured | No container engine |
| Python forecasting (including two concurrent children) | Not measured | Not measured | No container engine |
| PDF generation | Not measured | Not measured | Browser print; measure browser separately from server |
| AI explanation | Not measured | Not measured | No provider call made |
| Container restart / health recovery | Not measured | Not measured | No container engine |

No resource figures or timing measurements are invented. Prior static bundle bytes and Python address-space limits are not runtime memory measurements.

## RAM verdict

| Limit | Actual qualification | Verdict |
|---|---|---|
| 512 MB | None | NOT PROVEN sufficient |
| 1 GB | None | NOT PROVEN sufficient |
| 2 GB | None | NOT PROVEN sufficient |

The earlier 2 GB recommendation was a conservative starting tier, not an experimentally established requirement. This task cannot promote any tier to proven sufficiency without running the container.

## Exact continuation procedure

1. User installs/starts Docker Desktop with its Linux container backend and completes any WSL/admin/restart prompts. Confirm `docker version` includes a reachable Server and `docker info` reports Linux. Do not deploy or enable billing.
2. Build locally from app root: `docker build --pull -t planner-m9:local .`. Record build success, image digest, Node/Python versions, installed runtime dependency tree, and Angular assets. No runtime secrets in build args.
3. Use an isolated disposable PostgreSQL test database/volume and existing synthetic fixtures/limited role, NEVER the existing Neon connection or production .env. Keep test DB outside measured app cgroup. Reuse local test harness setup, adapted for Docker networking; any migrations/seed must target only this disposable DB.
4. Supply runtime secrets from a dedicated gitignored local file, never echoed. Use a loopback-only HTTPS test reverse proxy with a trusted local test certificate; do not disable production Secure cookies/CSRF. Publish app port on 127.0.0.1 only. Verify exact APP_ORIGIN/proxy settings.
5. Run application with each memory limit (512m, 1g, 2g) and no extra swap allowance, retaining all import and worker limits. Include CPU limits matching candidate host; CPU affects the fixed 10s forecasting timeout. Measure app cgroup memory.current/memory.peak, CPU usage deltas and OOM events, plus docker stats snapshots. Record interval, duration, concurrency, input sizes, p50/p95 latency, errors and whether warm/cold. Separate build resources from runtime.
6. Exercise idle (60s), repeated login/dashboard, all decision families, maximum-supported CSV/XLSX inputs, single/two concurrent forecasts and simultaneous import, brief retrieval/AR+EN browser PDF, and approved existing Groq assistance with synthetic evidence. Record AI response outcome separately from provider latency; do not substitute unavailable fallback for successful inference.
7. Measure browser PDF memory separately; current `window.print()` is client-side. Server memory includes data delivery, not PDF rendering.
8. Restart only the test app container. Confirm health transitions/recovery, stable-session-secret behavior, saved synthetic data/session persistence, and live manual fallback. No database reset on restart.
9. Scan all image layers and final filesystem with redacted secret scanner output; inspect only environment variable names, not values. Check absence of .env/private keys/dumps/local records. Runtime secrets necessarily exist in container environment when supplied; the test is that they are not baked into image/history/assets.
10. Accept a size only with no OOM/timeout/correctness regressions and sufficient measured headroom at declared concurrency. Do not change formulas/import limits to obtain a passing result.

## Render configuration (future approval only)

- One Docker Web Service; app root build context and `Dockerfile`.
- Existing CMD `node dist/apps/api/src/server.js`; WORKDIR /app.
- Render PORT; BIND_HOST=0.0.0.0; NODE_ENV=production.
- APP_ORIGIN=exact canonical HTTPS origin; TRUST_PROXY_HOPS verified against actual edge chain.
- DATABASE_URL=existing least-privileged Neon credential with verified TLS; SESSION_SECRET stable and strong, both runtime secrets only.
- FORECAST_PYTHON=/usr/bin/python3.
- Existing AI_ENABLED/GROQ_API_KEY/AI_MODEL/AI_TIMEOUT_MS configuration; do not change provider/model or enable paid AI.
- Render health-check path `/api/v1/health` configured separately from Docker HEALTHCHECK. Test authenticated/DB/forecast readiness separately.
- No persistent disk required by current architecture; database owns imports, records and sessions. No automatic production migrations/seed.
- Resource tier remains pending actual profiling. No Render service was created or changed.

**Next required action: install and start Docker Desktop's Linux backend. Until then, container resource claims would be unsupported.**
