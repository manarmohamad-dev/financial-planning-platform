# M9 Render Free — first-attempt readiness

2026-10-19, Africa/Cairo. Budget: $0 preferred, absolute $5/month ceiling. No deployment, billing, Git push or Neon access/data change performed.

## Verdict

**CONDITIONALLY READY FOR A FIRST FREE TRIAL, NOT A VERIFIED 512 MB RELEASE.**

Application build/tests and single-origin packaging are ready for a controlled first host build. Release-source completeness/security review and account Free eligibility remain gates before clicking deploy. Docker is still unavailable locally: the Dockerfile has not been built or executed. Render's first build may be the first Linux/container test only if the user explicitly accepts that uncertainty. Do not advertise dependable production readiness before public acceptance and resource measurements.

If Render asks for payment verification, stop. Do not add a card, purchase credits or choose a paid instance. Smallest paid web compute is $7/month, exceeding the $5 ceiling; it is not an authorized fallback. If Free fails with OOM/forecast timeouts, stop rather than shrink functionality or upgrade.

## Changes in this pass

Only Dockerfile and this report changed.

- Kept full `npm run build`, static/API artifact assertions, Node 24 slim multi-stage build, Python3 standard library, CA certificates, non-root runtime, production dependencies and cache cleanup.
- Added npm `--no-audit --no-fund` during image installation to avoid incidental build-time network/reporting work. This does NOT substitute for security audit.
- Replaced Docker health probe's fetch client with built-in `node:http`, avoiding unnecessary fetch-client initialization in each transient probe process. Bounded timeout, dynamic PORT and failure exit preserved. Memory benefit has not been measured.
- Existing `.dockerignore` allowlist/key/database exclusions retained.

No arbitrary NODE_OPTIONS heap ceiling, worker-concurrency change, lower import limits, pool resize, password-hashing reduction or removed runtime dependency. Such changes could break accepted behavior without measured justification. Angular executes in the browser and Python workers are on-demand; neither Angular dev server nor TypeScript compiler runs in the production container. Image bytes are not RAM measurements. Removing unneeded browser package disk files is not justification for modifying the shared dependency contract in this pass.

## Verification this pass

| Check | Result |
|---|---|
| Full Vitest suite | **621 passed**, 19 files, 0 failed; 26.35s |
| Independent Python numerical tests | **6 passed**, 0 failed |
| TypeScript + Angular template typecheck | Passed |
| ESLint | Passed; generated `tmp/p0-release/**` output excluded, all source retained |
| API production build | Passed, isolated `.local/render-free-build/dist` |
| Angular production build | Passed, isolated `.local/render-free-build/dist/web`; initial 735.25 kB / estimated transfer 145.17 kB, no budget warning |
| Actual revised health command against local API | HTTP 200 using PORT=4345; not a Docker test |
| SPA routes against local synthetic production server | `/`, `/sign-in`, `/account`, `/workspaces`, workspace overview and decisions with query: HTML 200 |
| API fallback isolation | `/api/v1/does-not-exist`: JSON 404, not Angular HTML |
| Known secret signatures in tracked working-tree files | 244 files checked, zero flagged files; no matched values printed |
| Tracked sensitive filenames | Only `.env.example`; no tracked .env/private key/.local files in checked patterns |
| Docker build/run, image-layer scan, Linux memory/CPU | NOT AVAILABLE / NOT MEASURED |

Tests use local disposable fixtures; TEST_ADMIN_DATABASE_URL removed from test process environment. No external Neon database involved. Existing public-demo dist directory not replaced. Prior P0 browser proof covers secure-cookie/session reload and AR/EN routes; this pass does not claim a new Render browser test.

Secret scan is limited to known Groq/Google/OpenRouter/private-key signatures in tracked current content; it is not a full history/untracked release audit and does not establish publication safety. Current accepted landing source/assets are still untracked. Preserve all unrelated dirty changes.

## Runtime / security settings

`server.ts` reads PORT and optional BIND_HOST from validated config. Docker sets BIND_HOST=0.0.0.0. Render supplies PORT; do not hard-code 3000 from EXPOSE. Existing Express app serves Angular and `/api/v1` on one origin.

Production session remains PostgreSQL-backed, Secure/HttpOnly/SameSite=Lax, __Host cookie with path `/`, stable secret and exact origin/CSRF checks. No permission/authentication changes. Set canonical APP_ORIGIN to exact HTTPS URL. TRUST_PROXY_HOPS=1 is a candidate for one Render ingress proxy, not a verified fact; confirm actual chain, Secure cookie issuance and distinct-client rate limiting before acceptance. Never set unrestricted trust or disable Secure cookies to fix login.

Health path is liveness only. It does not verify continued DB access, Python or Groq. Existing startup checks DB and refuses privileged runtime DB roles. Keep existing limited Neon role and verified TLS; never use an owner/admin URL. No migration/seed hook.

## Render Free risk gates

Official Free compute: 512 MB / 0.1 CPU. Sleeps after 15 idle minutes, wake approximately one minute, 750 shared instance-hours/month. Filesystem ephemeral; no persistent disk/shell. Outbound database/API traffic and usage limits can lead to suspension. The existing PostgreSQL persistence design avoids local upload storage, but does not remove these platform limitations. [Compute](https://render.com/docs/compute-plans), [Free limitations](https://render.com/docs/free).

512 MB is **not proven enough**: two Python processes are allowed, each with a 256 MiB virtual-address-space limit (not actual RSS). Node, password hashing, XLSX expansion (32 MiB plus objects/buffers), concurrent requests and health probes add memory. Fixed 10s forecast wall timeout is also sensitive to 0.1 CPU. No OOM or forecast failure has been observed on Render because no deployment occurred.

If a trial is approved, measure aggregate container/host memory and CPU during idle, login, supported maximum uploads, scenario/stress, one and two forecasts, AI and browser print. PDF rendering itself runs in the user's browser. Check concurrent work, restart and wake behavior. Reject Free if complete workloads cannot run safely; never hide failures behind health 200 or lower limits.

## Exact release / GitHub steps — future, not executed

1. Use the correct financial-planning-platform repository; never finpilot or ai-business-management-platform. Keep repository private initially. Confirm repository root with `git rev-parse --show-toplevel` and current status/diff.
2. Review ALL release changes and include accepted Angular assets/translations, API/packages, migrations (for completeness, not auto-run), package.json/lockfile, TypeScript/Angular configs, Dockerfile and .dockerignore. Do not stage all folders blindly: .local/tmp/output/evidence may contain private artifacts.
3. Run a redacted secret scanner over intended staged files and history, review .env.example for placeholders, and inspect added assets/docs for private data. No API keys or connection strings in source/build arguments.
4. Stage only reviewed paths (`git add -- <reviewed-paths>`), inspect `git diff --cached --stat` and the staged diff locally, then create a release commit after approval. Reproduce the build from this exact commit. A private repo does not make committing secrets safe.
5. In GitHub, create/select a PRIVATE financial-planning-platform repository. Inspect configured remotes privately; do not replace an unrelated remote. Only after explicit push authorization, push the reviewed release branch to the confirmed repository. No push or commit was performed by this task.

## Exact Render steps — future, not executed

1. Sign in -> New -> Web Service -> Git Provider. Authorize only the correct repository. Select the reviewed release branch.
2. Language: Docker. Root Directory: app directory containing package.json/Dockerfile (repository root if app itself is the repo; otherwise its actual relative path). Dockerfile Path: `./Dockerfile` relative to selected root. Use default Docker build context at app root.
3. Select **Free**, not Starter/paid compute. Keep Hobby workspace, no paid workspace upgrade, no persistent disk, no Render database. If payment/card dialog occurs, stop. Do not assume a Free label guarantees no overages if a payment method already exists. [Billing behavior](https://render.com/docs/faq).
4. Disable automatic deployment initially. No custom Docker command: retain CMD. No separate build/start commands needed for Docker. Set health check `/api/v1/health`.
5. Set runtime configuration privately:
   - NODE_ENV=production; BIND_HOST=0.0.0.0; leave PORT to Render.
   - APP_ORIGIN=assigned canonical `https://<service>.onrender.com` without a path/trailing slash. Verify actual URL, do not guess.
   - DATABASE_URL=existing restricted Neon runtime connection with verified TLS; SESSION_SECRET=stable random >=32 characters.
   - TRUST_PROXY_HOPS=verified bounded value; start from the one-hop candidate only for qualification.
   - FORECAST_PYTHON=/usr/bin/python3.
   - AI_ENABLED and GROQ_API_KEY from existing approved free configuration; AI_MODEL=openai/gpt-oss-120b; AI_TIMEOUT_MS=20000. No billing or provider change. AI disabled is valid fallback, not proof that full AI acceptance passed.
   - Do NOT provide migration/admin/test database variables or copy development .env wholesale.
6. Check account usage/billing: stay within free allowances and do not add payment. If an existing payment method permits chargeable overages, resolve a verified zero-cost constraint before proceeding. Pipeline spend limit alone is not a universal billing cap.
7. Only after explicit deployment approval, click Create Web Service. Inspect build and startup logs without printing secret env. If Docker build fails, stop and fix packaging only; do not change financial logic.
8. Qualification: HTTPS landing + direct routes, login/reload/logout and session security, restricted-role/RLS checks, max CSV/XLSX workflow, forecasts, guided decisions/comparison/risk, actual Groq evidence explanation and fallback, AR/EN PDF, restart/persistence/cold wake. Use synthetic data only; no production financial data mutation. Record actual resources and failures.
9. Accept only if full behavior works within Free limits. Otherwise report the exact failure and suspend/delete only the newly created trial after user approval; do not alter Neon or upgrade. $7 paid fallback is over budget. [Pricing](https://render.com/pricing).

## Final answer

The code/build package is prepared for a **conditional first Render Free attempt**, but release completeness/secret review and account eligibility must be cleared first. Docker and 512 MB capacity are unverified. This is not a permanently reliable hosting certification. No deployed URL exists from this task.
