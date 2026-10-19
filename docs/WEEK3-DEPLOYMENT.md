# Week 3 deployment and instructor review

> Historical Week 3 record only. The Railway selection and M7 scope statements below are superseded. The separate Week 3 UI review is not a deployed full application. See M7-FINAL-ACCEPTANCE.md and M8-FIX-CLOSURE.md for current status. No hosting provider is selected by this document today.

## Historical status

Railway has been selected for same-origin application hosting and a separate PostgreSQL service. Authentication succeeded, but Railway rejected new project creation because the account has reached its Free plan resource provision limit. Deployment is pending available hosting capacity and production database provisioning. No public URL has been deployed or verified. Do not submit localhost:3100 or localhost:4200 as a public URL.

This is an instructional M1–M6 MVP, not a commercial production launch. M7/AI is out of scope. Use synthetic examples and avoid real private financial data. See SECURITY.md for operational limitations.

## Existing deployment architecture (reuse)

The Express app already serves `dist/web/browser` and the Angular entry point for `/`, `/workspaces`, `/workspaces/:workspaceId/:page`, `/account`, `/sign-in` and `/sign-up`. API requests use relative `/api/v1` URLs. Serve both from one HTTPS origin. No separate frontend API environment injection or permissive CORS layer is required. Keep the exact-origin CSRF check, secure HttpOnly production cookie, CSP and role checks enabled.

The Angular dev proxy points to localhost:3000 only for local `ng serve`; it is not part of production runtime. Never deploy `ng serve`, the local database launcher, or `scripts/saas-preview.ts` as a public service.

## Host requirements

- Node.js 24, Python 3.11+ (local baseline tested with 3.12), PostgreSQL 18.
- Long-running Node process with outbound database access and ability to spawn the trusted Python executable.
- HTTPS termination; platform environment/secret storage.
- Separate migration/admin and non-owner runtime database roles. Runtime must not be superuser, BYPASSRLS, or own business tables. Startup validates this.
- Single API instance for the existing in-process rate limiter and bounded forecast runner.
- Run from repository/release root. Retain `packages/forecasting/runtime/worker.py`, `migrations/`, production dependencies, and the entire `dist/` tree.

## Release commands

Build with dev dependencies available:

```sh
npm ci
npm run check
```

Provision database role login/password outside source control. Run migrations with `MIGRATION_DATABASE_URL` injected only into the migration process:

```sh
node dist/scripts/migrate.js
```

Run the application with runtime environment variables injected by the host:

```sh
node dist/apps/api/src/server.js
```

Do not attach migration/admin credentials or TEST_ADMIN_DATABASE_URL to the running web service. Do not copy local `.env` or `.local/` into a deployment bundle. Use host-managed database TLS with certificate verification; never disable TLS verification. Database backups and access rules are host responsibilities.

## Environment contract

| Variable               | Production value / responsibility                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| NODE_ENV               | `production`                                                                              |
| PORT                   | Host-provided listening port, default 3000                                                |
| APP_ORIGIN             | Exact public HTTPS origin, no trailing path; must match the browser origin                |
| DATABASE_URL           | Provisioned non-owner `planner_app` runtime connection; secret                            |
| SESSION_SECRET         | Cryptographically random secret of at least 32 characters, stored in host secret settings |
| TRUST_PROXY_HOPS       | Exact trusted proxy topology (0–2 supported); establish with the actual host, never guess |
| FORECAST_PYTHON        | Trusted Python executable available on the host                                           |
| MIGRATION_DATABASE_URL | Admin connection for release/migrations only; never client-visible                        |

`.env.example` contains local placeholders only. Do not put secrets into Angular files or variables compiled into browser assets.

## Instructor access

1. Open the eventual verified public root URL.
2. Register a personal review account and sign in; no shared private credentials are required.
3. Choose Enter demo for existing isolated synthetic baseline/scenario examples.
4. In Financial Baseline, choose an existing profile and calculate the synthetic baseline to obtain a populated view.
5. To review company-only pages, create a company workspace through the existing flow. Team & Access and Workspace Settings use the account's actual Owner permissions. Imports/forecast/risk/brief results require their normal data and review prerequisites; no fake records are supplied.
6. Switch EN/العربية and use the responsive navigation as needed.

## Public acceptance gate (not yet executed)

After hosting is available: open the HTTPS URL without a prior authenticated session; check assets, signup/sign-in, demo, workspace selection and all nine workspace areas including Team and Settings. Check same-origin API calls and exact-origin CSRF, EN/AR/RTL, representative mobile width, one populated deterministic demo, direct nested route navigation and refresh, and production console errors. Confirm no localhost dependency or private secret appears in browser configuration.

A local smoke check or successful build is not proof of a public deployment. Record the actual final URL and public results only after these checks pass.

## Railway packaging

`Dockerfile` builds the existing API and Angular app and runs them as the non-root `node` user. The runtime includes Python, the existing forecast worker, and migrations. `.dockerignore` is an allow-list excluding local secrets, databases, historical screenshots and test fixtures from the build context. `railway.json` selects Docker, the existing start command, and the existing health endpoint. No secrets or APP_ORIGIN are baked into the image.

The container has not yet been built on Railway; local Docker is unavailable. Provision migrations separately with the admin role, then inject only runtime credentials into the app service. Do not use a shared admin DATABASE_URL from the PostgreSQL template as the app's runtime URL. Keep PostgreSQL private. Do not upload the whole working directory without auditing the deployment archive; `.dockerignore` protects Docker context, not necessarily CLI uploads.

Vercel is not required for this deployment: the existing server already delivers both Angular routes and the API, preserving same-origin cookies and CSRF without changing application code.

References: [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles), [CLI authentication](https://docs.railway.com/cli/login), [PostgreSQL](https://docs.railway.com/databases/postgresql).
