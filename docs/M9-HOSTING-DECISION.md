# M9 — Hosting decision

Date: 2026-10-16. **Planning only; no deployment authorized by this report.**

Source of project requirements: `M9-DEPLOYMENT-READINESS.md` and the runtime files identified below. M8's recorded 612 passing tests and build/security results remain prior evidence, not tests rerun for this report.

## 1. Decision

**Recommended architecture: alwaysdata Free hosting the complete Angular + Express application on one HTTPS origin, with the existing Neon database and existing Groq integration. Conditional on runtime qualification, especially memory.**

**One fallback: the complete application on the existing development computer, exposed through a Cloudflare Quick Tunnel for a scheduled, supervised graduation demonstration.** This is a temporary demo fallback, not permanent hosting or a stable submission URL.

There is **no fully verified, reliable, permanently available no-card deployment established by this audit**. alwaysdata publishes a genuinely no-card free offer and compatible runtimes, but its 256 MB RAM must not be mistaken for proven capacity. If it cannot support the unchanged application, reject it rather than reducing import limits, disabling forecasting, weakening security or buying an upgrade.

The single-origin architecture minimizes changes because Express already serves the production Angular build. Separating the frontend adds proxy/session verification without solving the backend resource problem.

## 2. Actual application requirements

Paths below are relative to the repository root.

| Requirement | Repository evidence | Hosting consequence |
|---|---|---|
| Angular SPA and deep links | `apps/api/src/app.ts:638–644`; `angular.json`; `package.json` | Serve `dist/web/browser`, including lazy chunks; route application paths to index while preserving API errors. No Angular SSR server required. |
| Express / Node | `package.json`; `apps/api/src/server.ts:9` | Node 24 production process; current listener takes PORT, not an explicit host/IP. |
| PostgreSQL and isolation | `apps/api/src/db.ts`; `apps/api/src/app.ts` | Native `pg` TCP connection, pool max 10, connection timeout 5s; preserve restricted runtime role, transaction-scoped identity/workspace settings and RLS. |
| Authentication | `apps/api/src/app.ts:120,145–157`; `apps/api/src/config.ts` | Postgres sessions; production Secure/HttpOnly/SameSite=Lax host-only cookie; exact APP_ORIGIN and CSRF checks. HTTPS plus correctly bounded proxy trust are mandatory. |
| Imports | `packages/imports/src/model.ts:11–21`; `migrations/006_imports.sql:3` | 5 MiB input; 32 MiB uncompressed archive limit; 2,000 rows, 40 columns, 80,000 cells. Original upload bytes persist in PostgreSQL, not a required local upload volume. |
| Forecasting | `apps/api/src/forecast-runtime.ts:13–42`; `apps/api/src/forecast-routes.ts:105` | Awaited OS Python subprocess, isolated flags `-I -S`, stdin/stdout JSON, 10s timeout, at most two active workers per process. Not a separately deployed persistent queue worker. |
| AI | `apps/api/src/config.ts:13–16`; `apps/api/src/ai-provider.ts` | Outbound HTTPS to current Groq endpoint; server-only key; existing model and safe unavailable behavior unchanged. No new provider or paid plan. |
| PDF | `apps/web/src/stress.ts:406–407` | Browser `window.print()`: server-side Chromium/Puppeteer installation is not required. Arabic fonts/assets must remain available. |
| Packaging | `Dockerfile`; `M9-DEPLOYMENT-READINESS.md` | Current Dockerfile packages backend only. Full website requires Angular output too. No Docker infrastructure is needed for the recommended native host. |

Public hosting does not itself validate any of these flows. In particular, a successful health response proves neither Python compatibility nor session/RLS/import correctness.

## 3. Options and current official restrictions

### A. Cloudflare Pages + an external compatible backend

**Frontend fit: good. Complete application by itself: no.** Pages Free supports 500 builds/month, 20,000 files and 25 MiB per asset. SPA fallback is provided when there is no top-level `404.html`. Static hosting does not have the sleeping web-process behavior of Render. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [routing](https://developers.cloudflare.com/pages/configuration/serving-pages/).

Cloudflare advertises free signup without a card. Pages Functions share the Workers Free limit of 100,000 requests/day. These functions are not the existing OS Node + Python deployment; Workers' supported Node API list does not supply the required Python subprocess runtime. Do not equate Node compatibility or Python Workers with running this worker unchanged. [Free signup](https://www.cloudflare.com/plans/), [Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/).

Build frontend with `npm ci` then `npx ng build web`; publish `dist/web/browser`. A complete split deployment would additionally need an external Node/Python host and a verified same-origin `/api/v1/*` proxy. Preserve Origin, cookies, body size, security headers and non-cacheable authenticated responses; never send API failures into SPA fallback. Simply enabling CORS across unrelated domains is insufficient for current sessions.

**Changes: moderate infrastructure/configuration work**, plus all backend qualification. Pages + alwaysdata is technically a candidate but adds a proxy without improving its backend RAM. Not the selected architecture.

### B. Vercel Hobby

Hobby is free for personal, non-commercial projects, with usage caps rather than purchased overages. A graduation demonstration is a reasonable personal-use interpretation, not authorization for commercial SaaS operation. The reviewed current plan documentation places card entry in the paid upgrade flow; account-specific signup eligibility was not tested. [Hobby policy](https://vercel.com/docs/plans/hobby), [pricing](https://vercel.com/pricing).

Angular static hosting is suitable. Node functions are supported, but **4.5 MB maximum function request/response payload conflicts with this project's 5 MiB upload support**, before multipart overhead. Current Fluid Compute documentation lists Hobby 2 GB and up to 300s execution; older non-Fluid tables differ. More memory does not remove the payload incompatibility. [Function limits](https://vercel.com/docs/functions/limitations), [payload error](https://vercel.com/docs/errors/function_payload_too_large).

Python as a separate Vercel function does not establish availability of the existing Python executable inside the Node function. Cross-runtime subprocess packaging, cold-start behavior, invocation lifecycle and per-instance concurrency protection remain unverified. Persistent domain data can remain in Neon; local function storage must not become authoritative.

**Changes: more than a safe configuration-only move** to preserve full upload support and prove mixed runtime behavior. Reject for the complete current application; frontend-only hosting would still need the same external backend/proxy.

### C. Render Free

Free web compute is 512 MB RAM / 0.1 CPU. It can accommodate a conventional Node/Python container in principle. Free instances sleep after 15 minutes without traffic; wake-up is approximately a minute. The workspace receives 750 free instance-hours/month. Local filesystem changes are ephemeral; free services have no persistent disk. Existing Neon avoids dependence on Render's expiring free database. [Compute plans](https://render.com/docs/compute-plans), [free restrictions](https://render.com/docs/free).

**Card status for this project: rejected.** The user already encountered a card request on Render. Generic free documentation does not override that account-specific evidence. No further signup, card verification or upgrade is proposed.

Were account eligibility different, changes would be small packaging/configuration changes: include Angular in the image, configure origin/proxy/secrets and test actual resource usage. Cold start and 512 MB capacity would still require qualification. Render does not become suitable for this user merely because its plan price is zero.

### D. alwaysdata Free — selected conditional candidate

Official offer: **free without a credit card, no time limit, personal use**. Current Free resources: **256 MB RAM, 1/4 CPU and 1 GB SSD**, with an `alwaysdata.net` site address. Do not select the separate paid-offer trial. SSL support is included. [No-card offer](https://www.alwaysdata.com/en/), [resource/pricing table](https://www.alwaysdata.com/en/offers/).

Node 24 and Python 3.11+ are listed. Node websites have a configurable startup command and must bind the assigned IP and PORT. Outbound ports are open, permitting Neon TCP and Groq HTTPS in principle. [Node configuration](https://help.alwaysdata.com/en/docs/web-hosting/languages/nodejs/configuration/), [Python configuration](https://help.alwaysdata.com/en/docs/web-hosting/languages/python/configuration/), [network](https://help.alwaysdata.com/en/docs/technical-specifications/network/).

Generic background services are paid-only; use the **Node.js website** facility. The current request-bound Python child is not a permanent background daemon, but its execution under the free account still needs a real check. [Services restrictions](https://help.alwaysdata.com/en/docs/web-hosting/services/).

**Unverified:** account eligibility in practice; complete application's aggregate RSS under imports plus two Python workers; HTTP upload/timeout limits; idle-process recycling and first-request latency; available package/disk space; reverse-proxy behavior. No fixed free-plan sleep interval or measured cold-start latency was established from reviewed documentation. Do not label it guaranteed always-on on that basis.

**Changes: small deployment work, potentially one narrowly scoped listener adjustment**, detailed below. This is a better architecture fit than serverless conversion, not proof that 256 MB is enough. The same memory concern that affected Back4app applies here.

### E. Other considered options

| Option | Official evidence / outcome |
|---|---|
| Northflank Sandbox | Current billing docs require a payment method for **all users regardless of plan**. This takes precedence over older no-card marketing. Although free sandbox resources exist, it fails the stated no-payment-method condition. [Billing policy](https://northflank.com/docs/v1/application/billing/pricing-on-northflank). |
| Koyeb Free | Pricing FAQ requires credit-card verification. Excluded without an implementation trial; compatible containers cannot override this condition. [Official FAQ](https://www.koyeb.com/docs/faqs/pricing). |
| Back4app / Railway | Previously excluded by the user's explicit constraints/account experience. No existing services were touched and no renewed experiment is proposed. |

No claim is made that this exhausts every hosting provider. It identifies a documented no-card candidate without disguising resource or account uncertainty.

## 4. Exact recommended architecture and future changes

```text
Browser: https://<account>.alwaysdata.net
  -> provider HTTPS reverse proxy
  -> one Express 5 / Node 24 website process
       -> / : existing built Angular SPA
       -> /api/v1 : existing API, sessions, validation and permissions
       -> bounded existing Python forecasting subprocess
       -> existing Neon PostgreSQL via restricted runtime role + TLS
       -> existing Groq HTTPS integration, with existing fallback
```

Only the public origin is shared with the examiner. No new database, queue, financial logic, AI provider, extraction scope or frontend mock is introduced.

Future implementation, only after approval:

1. Confirm Free selection without payment/card/trial activation. Stop if any payment is required.
2. Prepare an immutable release off-host: Node 24, `npm ci`, `npm run build`; carry complete `dist/`, Python worker and locked production dependencies. Verify Linux-compatible dependencies. Avoid building Angular within the 256 MB runtime account. Check the finished release, dependencies and log allowance fit the 1 GB disk quota.
3. Configure a Node.js website, release-root working directory and `node dist/apps/api/src/server.js` startup. The existing server binds only PORT: validate provider behavior and, if required, add optional validated HOST/IP binding in `server.ts`/`config.ts`, preserving current defaults elsewhere. No listener change made now.
4. Configure the account's Python version and trusted `FORECAST_PYTHON` executable. **Important:** the worker deliberately passes only PATH/SystemRoot/WINDIR to the child. Setting a parent `PYTHON_VERSION` alone may not select the child's version. Verify the executable under that same sanitized environment; use an existing trusted interpreter path/account default rather than forwarding secrets or broadening the environment.
5. Supply server-only `NODE_ENV=production`, assigned `PORT`, exact HTTPS `APP_ORIGIN`, existing restricted-role `DATABASE_URL`, stable random `SESSION_SECRET`, verified `TRUST_PROXY_HOPS`, trusted `FORECAST_PYTHON`, and current AI configuration (`AI_ENABLED`, `GROQ_API_KEY`, unchanged `AI_MODEL`, existing timeout). No key belongs in Angular, Git, a public artifact or build logs. No database migration/reset is part of this plan.
6. Preserve same-origin cookies/CSRF; no cross-origin CORS expansion. Verify forwarded protocol and client IP before selecting trust hops. Do not trust arbitrary incoming forwarding headers.
7. Run the qualification gate below before declaring the public application ready.

## 5. Mandatory qualification gate

- HTTPS and deep links: reload authenticated routes; verify Secure host-only cookie, CSRF rejection, logout, roles and cross-workspace denial.
- Real imports: CSV and XLSX up to existing supported limits, mapping, validation, confirmation and persisted lineage. Measure total memory including parser buffers and Python children, not Node heap alone.
- Forecast: real confirmed dataset, successful subprocess, timeout/busy fallback, and allowed concurrency. Measure CPU/timeouts on the host; do not relax limits to conceal incompatibility.
- Complete financial journey: baseline, all Guided Input families, comparison, stress/risk, saved brief; confirm data survives process restart.
- AI: current evidence-grounded assistance and unavailable path; no extraction enablement or provider change. Public-host AI quota remains independent of hosting quota.
- Print: real EN/AR brief output, fonts, all pages and controls on public assets.
- Reliability: repeat journey after idle and restart, inspect safe logs, disk usage and resource peaks with operational headroom. Reject on OOM/repeated timeout or unsupported upload sizes. `/api/v1/health` alone is insufficient.
- Neon: preserve verified restricted runtime role and RLS; account capacity/compute availability and wake-up latency are external prerequisites. A 5s pool connection timeout may surface cold wake-up errors; measure, do not assume or change it speculatively.

No host memory measurement, account signup or public journey was performed in this audit. There is no evidence to promise that the whole gate will pass.

## 6. One fallback: supervised local application + Quick Tunnel

Run the full built application on the existing computer and expose only its HTTP port using Cloudflare Quick Tunnel. The application still performs real authentication, imports, forecasting, financial calculations and saved-data operations; this is not the Week 3 review build. Retain the existing database configuration and secrets privately.

Quick Tunnels require no Cloudflare account or domain, produce a temporary HTTPS address, stop when the process stops, and change hostname on restart. They have no uptime guarantee, support 200 in-flight requests and do not support SSE. [Official Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Future setup needs `cloudflared`, the production build, exact generated public APP_ORIGIN, and verified proxy/cookie behavior. Bind/expose only the intended application, never development tools or database ports. Keep the computer awake on stable power/network and rehearse the complete flow. No application architecture change is expected, but external-origin security testing is still required.

**Suitable for a scheduled examination, unsuitable as a permanently available stable submission link.** If alwaysdata fails qualification and a stable unattended URL is mandatory, that requirement remains unresolved under the current constraints; do not silently substitute this temporary URL as permanent hosting.

## 7. Scope and handoff

Only this planning report was created. No application/configuration/dependency files changed; no deployment, push, provider call, payment, Neon connection/change or secret disclosure was performed. Prior accepted M1–M7 behavior remains untouched. No repeat test/build run was necessary for a documentation-only decision.

**Final verdict: proceed only to a separately approved alwaysdata Free qualification attempt; do not declare deployment-ready hosting proven. Keep the supervised Quick Tunnel as the single demo fallback.**
