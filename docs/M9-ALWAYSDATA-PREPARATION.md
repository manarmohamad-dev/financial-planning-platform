# M9 — alwaysdata Free deployment preparation

Date: 2026-10-16. Sources: `M9-HOSTING-DECISION.md`, `M9-DEPLOYMENT-READINESS.md`, current code and official documentation linked below.

## Verdict

**READY_FOR_ALWAYSDATA_TRIAL** — ready for a controlled qualification trial, **not** a claim that 256 MB supports the application or that public deployment has passed acceptance.

No confirmed incompatibility prevents trying the documented Node/Python website environment. Account eligibility, real aggregate memory/CPU, proxy headers, upload limits and sanitized Python execution remain mandatory gates. Do not upload application code until the account/runtime preflight checklist passes. No account was created, code uploaded, site started remotely, Git pushed, Neon accessed/changed, AI called or billing enabled during this preparation.

## 1. Verified hosting compatibility

| Area | Current official evidence | Consequence / remaining qualification |
|---|---|---|
| Free eligibility | Personal-use Free offer, no time limit and registration without a card. [Homepage](https://www.alwaysdata.com/en/). Account creation selects account name/location/product. [Account instructions](https://help.alwaysdata.com/en/docs/admin-billing/accounts/create-account/). | Choose Public Cloud **Free**, not Plus's 30-day trial. Actual account approval/verification was not attempted. Stop at any payment requirement. |
| Resources | Free: 256 MB RAM, 1/4 CPU, 1 GB SSD, three days of backups; provider subdomain for websites. [Offers](https://www.alwaysdata.com/en/offers/). | Personal graduation demo only; no custom domain purchase required. No assumption that storage quota implies sufficient RAM. |
| Node / Express | Node versions listed: 24, 22, 20, 18, 16, 14, 12, 10, 8, 6. Select **24**, matching this project's engine constraint. Website startup command and assigned IP/PORT supported. [Node configuration](https://help.alwaysdata.com/en/docs/web-hosting/languages/nodejs/configuration/). | One foreground Express process; no PM2 cluster, systemd, Docker or separate alwaysdata database needed. |
| Python | Python 3.11–3.14 among supported versions; provider instructs use of `python` / `/usr/bin/python`. [Python configuration](https://help.alwaysdata.com/en/docs/web-hosting/languages/python/configuration/). | Select 3.11+ as account default. Test using the worker's sanitized environment, not just an interactive shell. |
| Lifecycle | Website processes restart on demand after configured idle shutdown. Idle time can be configured, but even zero does not guarantee uninterrupted execution. [Idle behavior](https://help.alwaysdata.com/en/docs/web-hosting/sites/misc/). | Supports a conventional web process, not a guaranteed 24/7 background worker. Test restart and first request after idle. No fixed cold-start time measured. |
| HTTPS / routing | Provider reverse proxy terminates HTTPS and adds X-Forwarded-Proto and X-Real-IP. [HTTP stack](https://help.alwaysdata.com/en/docs/web-hosting/sites/http-stack/). | Whole origin routes to Express, which serves Angular and API. Do not split origins or add broad CORS. X-Forwarded-For behavior needs verification: Express does not automatically use X-Real-IP for rate limiting. |
| Environment | Website configuration supports command, working directory and environment variables. [Program configuration](https://help.alwaysdata.com/en/docs/web-hosting/sites/http-servers/user-program/). | Supply secrets privately through site environment. A dedicated masked/encrypted secret-vault guarantee was not established; restrict account access and do not screenshot/export the values. |
| Disk / temporary files | Provider recommends `/home/<account>/admin/tmp` instead of shared `/tmp`; documents site logs and retention. [Admin directory](https://help.alwaysdata.com/en/docs/web-hosting/remote-access/admin-directory/). | Keep npm cache, temporary staging and rollback releases within available quota. No separate unlimited temporary-storage allowance established. Never store secrets in shared temporary paths. |
| External database / AI | Outgoing ports are open, subject to abuse restrictions. [Network](https://help.alwaysdata.com/en/docs/technical-specifications/network/). | Neon TCP/TLS and Groq HTTPS are plausible without a proxy or driver replacement; no actual host-to-Neon connection tested. |

A separate paid background service is unnecessary for the current request-bound worker. Do not select one. Exact free-account reverse-proxy body/time limits were not established from the reviewed docs; a supported 5 MiB upload and existing forecasting/AI durations must be verified during trial.

## 2. Actual application inspection

### Build and artifact size

The existing `package.json` requires Node `>=24 <25`; Angular packages are 21.2.x and Express dependency is 5.x. `npm run build` runs API TypeScript compilation followed by Angular production build. `apps/api/src/app.ts:638–644` already serves `dist/web/browser` and SPA deep links, excluding API routes from static fallback.

Read-only measurement of the existing local output before this pass's API-only rebuild:

| Item | Measured bytes | Interpretation |
|---|---:|---|
| Angular `dist/web/browser` | 1,450,922 across 11 files | About 1.38 MiB uncompressed disk content, not browser transfer or runtime RAM. |
| Entire existing `dist` | 1,888,057 across 59 files | Pre-listener-change compiled output; a new release must rebuild and remeasure. |
| Installed files belonging to production lock entries | 43,411,294 | About 41.40 MiB file-content size; excludes nested dependency folders from each package traversal to avoid duplicate counting. Not a fresh Linux install or filesystem allocation measurement. |

The lockfile contains 134 non-dev package entries; none is marked `hasInstallScript`. No `.node` binaries were found in the measured production files. Production dependencies still include Angular packages; **do not rewrite dependencies or prune packages manually**. These measurements suggest disk capacity may be adequate, but do not prove the complete Linux release/cache/rollback footprint fits.

Build off-host on a trusted Node 24 builder. Do not attempt Angular compilation with the free runtime's 256 MB budget. No new frontend build was needed here because frontend sources did not change; a release build is required before upload.

### Runtime, storage and memory

- `apps/api/src/server.ts` checks database connectivity, creates the existing application, listens, and closes HTTP/pool on SIGTERM/SIGINT. No automatic migration or seed is run.
- `apps/api/src/db.ts`: native PostgreSQL pool max 10, connect timeout 5s, idle timeout 10s. Keep existing limited Neon role, TLS verification and transaction-local RLS context. Do not substitute owner credentials. Current Neon quotas, backups and wake latency were not inspected.
- `packages/imports/src/model.ts`: 5 MiB uploaded input, 32 MiB expanded XLSX, 8 MiB per archive part, 250 entries, 2,000 rows, 40 columns, 80,000 cells. Parser uses CSV parsing, ZIP buffers and XML objects; source bytes, decoded text, parsed rows and serialization can coexist. `migrations/006_imports.sql` stores originals in PostgreSQL. Local disk is not the authoritative import store.
- `apps/api/src/forecast-runtime.ts`: up to two concurrent Python children, 10s wall timeout, 1 MiB result-output bound; stdin/stdout protocol. Worker imports standard-library modules only. No numpy/pandas/pip installation is required.
- `packages/forecasting/runtime/worker.py`: Linux CPU limit 5s and virtual-address-space limit 268,435,456 bytes **per child**. This is not reserved memory, measured RSS, or an account-level guarantee. Node plus two children plus import parsing may exceed the host's total allocation even when each child obeys its limit. Quarter-CPU contention may also trigger the unchanged wall timeout.
- `apps/web/src/stress.ts:406–407`: PDF is browser print, not a headless-browser backend job. Preserve fonts, CSP and existing print CSS; no Chromium installation needed on alwaysdata.
- Existing authentication persists sessions in PostgreSQL. Secure/HttpOnly/SameSite=Lax `__Host-planner.sid`, Origin checks, CSRF, permissions and tenant isolation are unchanged.
- Existing Groq configuration and model are unchanged. No local AI calls were necessary; provider availability/quotas remain independent of web hosting.

**Expected peak RAM: unknown; no measured peak claimed.** The useful capacity model is Node total RSS + simultaneous Python RSS + parser/serialization/native buffers + hosting-account overhead. File size and V8 heap alone cannot substitute for this measurement. No RAM cap, import limit, concurrency limit or timeout was changed to force a fit.

## 3. Minimal changes prepared

1. `apps/api/src/config.ts`: optional `BIND_HOST`, validated as an IPv4/IPv6 literal. No default override; existing environments keep unspecified-host binding.
2. `apps/api/src/server.ts`: passes validated optional host alongside existing port to the listener. Financial, auth, session, RLS and API behavior unchanged.
3. `deploy/alwaysdata/start.sh`: foreground launcher, changes to release root, requires assigned IP/PORT and production mode, maps IP to BIND_HOST, then executes existing compiled server. No secret loading/printing, database maintenance or build at startup.
4. `tests/deployment-config.test.ts`: default preservation, IPv4/IPv6 acceptance, malformed-address rejection, and an actual loopback socket check without database access.
5. This preparation report.

Existing staged/unstaged M7/M8 work was preserved; `config.ts` already contained prior AI changes and was patched minimally. No commit, reset or staging action occurred. No Dockerfile, lockfile, financial module, frontend, migration or AI provider changed in this pass.

## 4. Exact deployment configuration — for the later approved trial

Site type: **Node.js**. Public address: the chosen account's provider HTTPS subdomain. Working directory: `/home/<account>/financial-planning-platform/releases/<release-id>`.

Startup command:

```sh
sh /home/<account>/financial-planning-platform/releases/<release-id>/deploy/alwaysdata/start.sh
```

Set environment through the private site settings; these are names/instructions, not credentials:

| Name | Value / requirement |
|---|---|
| NODE_ENV | `production` |
| NODEJS_VERSION | `24` (also select account Node default 24) |
| IP / PORT | Provider-assigned values; launcher requires them, never reuse localhost guesses. |
| BIND_HOST | Derived by launcher from IP; no separate setting needed. |
| APP_ORIGIN | Exact public HTTPS origin without path/trailing slash. |
| DATABASE_URL | Existing limited-role Neon URL with required TLS, provided privately. No admin/migration URL. |
| SESSION_SECRET | Existing stable secure secret or securely provisioned release secret, at least 32 characters. Never put in command arguments or repository. |
| TRUST_PROXY_HOPS | Verify actual topology (configuration supports 0–2); do not blindly copy a value. Gate below covers HTTPS and client-IP spoofing. |
| FORECAST_PYTHON | `/usr/bin/python` only after sanitized-environment version/resource test passes. |
| AI_ENABLED | Preserve intended accepted scope; enable only with existing authorized free Groq configuration. Disabled mode is a fallback test, not a substitute for AI acceptance. |
| GROQ_API_KEY | Existing server-only secret, supplied privately. |
| AI_MODEL | Unchanged `openai/gpt-oss-120b`. |
| AI_TIMEOUT_MS | Existing default `20000`, no tuning to conceal host failures. |

The Python child intentionally receives only PATH/SystemRoot/WINDIR. **Setting PYTHON_VERSION on the parent alone is insufficient.** Set the account Python default to a supported version and verify `/usr/bin/python` under the same stripped environment, or use an already available trusted interpreter path. Do not broaden inherited environment or remove Python isolation.

Do not add `MIGRATION_DATABASE_URL`, `TEST_ADMIN_DATABASE_URL`, test credentials, `.env` files or experimental AI outputs to this website. The compiled server does not automatically read a development `.env`.

## 5. Ordered safe deployment gate

All unchecked items below are future trial work, not claims of completion.

### A. Before uploading application code

- [ ] User approves trial and completes required account authentication. Confirm exact **Free / zero price / no card**; stop otherwise.
- [ ] Use current project `financial-planning-platform`; do not touch FinPilot or other existing projects.
- [ ] Confirm Node 24, Python 3.11+, website command/environment controls and assigned IP/PORT are available. Run version-only checks under sanitized Python environment and verify `resource.setrlimit` availability without app code, database access or secrets.
- [ ] Inspect available disk and free-plan quota accounting. Ask support only if necessary to resolve HTTP body/time limits or restrictions. Do not assume an administrator-only resource configuration feature is available on Free.
- [ ] Verify proxy topology/header sanitization. Docs establish X-Forwarded-Proto and X-Real-IP, **not correct Express req.ip**. Confirm X-Forwarded-For handling or other existing compatible host configuration before public approval; do not introduce unsafe X-Real-IP trust or weaken rate limits.
- [ ] Establish private environment-entry method and restricted account access. Never use `printenv`, `set -x`, environment screenshots or public diagnostic endpoints.

### B. Build, package and upload (after the above passes)

On a trusted builder/release workspace, not the small hosting account:

```sh
npm ci
npm run build
```

- [ ] Record exact source revision plus preserved working-tree changes in a release manifest; current tree is not a clean committed release. Obtain approval before commit/push; no push is required for SFTP upload.
- [ ] Stage **only** `dist/apps/api`, `dist/packages`, `dist/web/browser`, `packages/forecasting/runtime/worker.py`, `package.json`, `package-lock.json`, and `deploy/alwaysdata/start.sh`, preserving paths.
- [ ] Install locked runtime dependencies in the separate staged directory with `npm ci --omit=dev --no-audit --no-fund`. Prefer a compatible Linux builder so no install/build process competes with the 256 MB runtime. Do not copy development `node_modules`. If installation must run on-host, stop the site during it and monitor quota/OOM; do not assume success.
- [ ] Verify imports resolve in the staged runtime and scan the entire release for secrets/private evidence. Exclude `.env*`, `.local`, `.git`, tests, dumps, private keys and migration runners. No automatic migrations.
- [ ] Measure **finished** release and archive sizes, plus old/new releases and extraction/cache space; do not rely on current file-content estimates alone. Keep a rollback artifact off-host if two releases cannot fit.
- [ ] Upload allowlisted artifact over authenticated SFTP/SSH into a new release directory; no replacement of unrelated files. Preserve LF endings for the launcher; invoke with `sh`, so executable-bit transfer is unnecessary.

### C. Start and public end-to-end verification

- [ ] Enter existing secrets privately, configure site and start through launcher. Retain liveness `/api/v1/health`, but require authenticated functional checks too.
- [ ] Confirm PostgreSQL role safety/startup and existing migration compatibility without migration/reset. This report did not connect to Neon; any later read-only preflight must be explicitly within the approved deployment trial.
- [ ] Verify HTTPS redirect, secure session cookie, login/logout/reload, CSRF and hostile-Origin rejection, Owner/Manager/Analyst permissions and cross-workspace denial.
- [ ] Verify real client-IP attribution and resistance to spoofed forwarding headers with existing rate limiters. Wrong attribution is a deployment blocker, not permission to disable abuse controls.
- [ ] Keep provider HTTP cache disabled for authenticated content/API. Verify direct SPA routes, lazy assets, Arabic/English and RTL/mobile layout.
- [ ] Run authorized synthetic import → mapping → confirmation → lineage → forecast → baseline → four Guided Input decisions → comparison → risk → AI evidence explanation → Decision Brief. Test accepted errors/fallbacks. Preserve all existing financial values/formulas and AI model.
- [ ] Print actual EN/AR PDFs from public origin and inspect every page. Prior print acceptance is not proof of public font loading.

### D. Capacity and failures

- [ ] Sample account memory and per-process RSS, including both Python children, while exercising supported maximum CSV/XLSX and concurrent allowed forecasting. Record peak account memory, OOM/restart events and request durations. Sum RSS is an approximation because shared pages may double-count; prefer account accounting when available.
- [ ] Measure startup, warm/idle requests, Python CPU/wall time, Groq timeout fallback, Neon wake-up and connection failures. Do not run synthetic load that violates host policy; use bounded existing application operations.
- [ ] Keep results safely below the actual enforced account limit with repeatable headroom, not one successful request near exhaustion. Reject repeated OOM, unbounded growth, unsupported upload sizes, timeout failures at supported workloads or inability to observe capacity reliably.
- [ ] Use process counters and sanitized site logs. Avoid alwaysdata's syscall-trace analysis for routine monitoring: documentation warns it can capture passwords. [Process diagnostics](https://help.alwaysdata.com/en/docs/web-hosting/sites/customizing/analyze-processes/).
- [ ] Test application restart and session/data persistence; record idle configuration. Do not claim a no-sleep SLA or use artificial keepalive traffic to conceal lifecycle limitations.

### E. Rollback / rejection

- [ ] On capacity/security/runtime failure, disable **only this trial website**, stop its process and retain sanitized evidence. No Neon rollback, database reset or deletion is part of host rollback.
- [ ] If a previous known-good release exists, switch the website command/directory back to it with the same compatible configuration. Otherwise leave the failed trial offline; preserve the accepted local build and the documented supervised-demo fallback.
- [ ] Remove the trial site's secret configuration if abandoning that host; rotate credentials only if exposure occurred and with appropriate approval. Do not print keys while doing so.
- [ ] Do not upgrade, add cards, reduce supported features, change provider, weaken permissions or change financial formulas to pass qualification.

## 6. Verification performed in this preparation

| Check | Result |
|---|---|
| `vitest run tests/deployment-config.test.ts tests/contracts.test.ts` | **58 passed, 0 failed**, two files. Includes nine new listener tests. No database/provider calls. |
| `tsc --noEmit` | Passed. |
| ESLint on config/server/new test | Passed. |
| `tsc -p tsconfig.build.json` | API production compilation passed. |
| Launcher shell syntax | Passed using Git Bash shell parser locally. |
| Launcher missing-IP / non-production guards | Both refused startup as expected, without database connection. |
| Diff whitespace check for changed API files | Passed. |
| Full suite / frontend rebuild | Not rerun: no financial/frontend behavior changed. Prior M8 612-test result remains historical; **no new full-suite total claimed**. |
| Linux/alwaysdata execution, peak RAM, public HTTPS/proxy, Neon/Groq connectivity | Not run; mandatory trial gates. |

The launcher was not executed successfully against real credentials or a remote service. No secrets were opened/printed and no paid action occurred. **Readiness is for the bounded trial only; full hosting acceptance remains conditional on all gates above.**
