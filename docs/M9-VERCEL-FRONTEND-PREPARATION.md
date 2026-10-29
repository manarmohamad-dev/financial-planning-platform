# M9 — Vercel frontend preparation

Date: 2026-10-19. Prepared locally; NOT deployed, pushed, or committed.

## Exact settings

| Setting | Value |
| --- | --- |
| Root directory | Repository root containing package.json and angular.json. For the current release repository: `.`. Only if importing the parent workspace repository: `outputs/planning-platform`. NOT `apps/web`. |
| Framework preset | Other (`framework: null`) |
| Node | 24.x (matches package engines) |
| Install | `npm ci` (include development dependencies for Angular/tsx) |
| Build | `npm run build:vercel` |
| Output | Build Output API v3: `.vercel/output`; public files: `.vercel/output/static` |
| Dashboard Output Directory override | Leave unset; the build produces Build Output API output directly. Do not set it to dist, apps/web or .vercel/output. |
| Required build environment | `BACKEND_ORIGIN=https://<approved-public-backend-host>` (origin only; no /api, credentials, query or fragment) |

Normal Angular production output remains `dist/web/browser`; normal Docker/API builds are unchanged. Vercel build uses a separate output location so it does not overwrite a running local demo. No Vercel Function, Python runtime or backend bundle is deployed by this configuration.

`vercel.json` selects the build command. `scripts/build-vercel.ts` validates BACKEND_ORIGIN before invoking Angular and writes `.vercel/output/config.json`. Only that one environment value is consumed; no dotenv files are read or environment objects serialized. Changing the backend requires rebuilding. The URL is configuration, not a secret.

## API and SPA routing

Keep all existing browser requests and download links at `/api/v1/...`. The generated routing manifest proxies `/api` and every `/api/...` path to BACKEND_ORIGIN before filesystem/SPA handling, with no-store responses. API failures must not turn into HTML success responses. Existing public assets are served before the Angular shell; root, sign-in, sign-up, account and workspace deep links receive index.html. Unknown assets return 404. Record query parameters are not hardcoded or rewritten by application code.

The static frontend receives CSP/security headers; no inline scripts are enabled. Arabic, English, language switching and RTL are unchanged, as are all frontend components. No new cross-origin fetch mode or authentication semantics were introduced.

## Authentication boundary and blockers

Verified source: `apps/api/src/app.ts` uses host-only `__Host-planner.sid` in production, Secure + HttpOnly + SameSite=Lax + Path=/, PostgreSQL session storage, exact APP_ORIGIN and CSRF token validation. Existing browser fetches use same-origin credentials (explicitly or by default). API currently does not provide a cross-origin credentialed CORS integration.

Therefore a direct browser API URL on another hosting domain is NOT ready and would require authentication/CORS changes outside this task. This preparation instead uses Vercel external rewrites to maintain a single browser origin. It does not prove live proxy behavior.

Before deployment:

1. Provision and validate the separate complete Express/Python backend; this remains unresolved. Keep Neon and Groq secrets there ONLY.
2. Set backend APP_ORIGIN to the exact stable HTTPS frontend origin, without trailing slash. Do not broadly permit arbitrary Vercel preview origins. Preview deployments must use an isolated test backend or remain non-operational for authenticated workflows.
3. Verify the actual proxy chain and set existing TRUST_PROXY_HOPS appropriately (supported range 0–2). Do not blindly increase trust. Confirm secure request recognition and real client-IP/rate-limit behavior. If topology cannot be represented safely by current configuration, stop and review it.
4. On a real Vercel deployment, verify Cookie/Set-Cookie forwarding, CSRF success and rejection, login/logout/session persistence, workspace isolation and cache isolation. Maintain the current cookie flags; do not change SameSite to None as a shortcut.
5. Verify original-file downloads, 5 MiB CSV/XLSX upload through the proxy, forecasting latency/cold starts, AI timeouts/fallback and browser PDF export. No server PDF renderer is required.
6. Verify direct links with run/brief/comparison IDs in AR/EN and inspect CSP, console/network errors and third-party cookie independence.

No live Vercel verification was performed. Neither resource sufficiency nor proxy limits are established by the successful Angular build. This is frontend preparation, not approval to publish a broken frontend-only application.

## Local verification

- Angular 21.2.24 production build using `npm run build:vercel`: PASS. Synthetic origin `https://backend.example.invalid` used only in generated routing metadata, never contacted. Replace with real approved backend at build time.
- Initial JS/CSS: 735.25 kB; estimated transfer 145.17 kB. No budget warning.
- Focused Vitest: 42/42 across vercel-config, deployment-config, navigation, ui-presentation and workbench-navigation suites.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- Gitleaks 8.30.1 scan of complete generated `.vercel/output`, redacted: no leaks found (approximately 1.54 MB scanned).
- Additional JS/HTML/CSS/JSON scan: zero matches for database URLs, secret environment names, localhost/loopback or synthetic backend origin in public files.
- `.vercel/output/config.json` confirmed gitignored; `git diff --check` passed.
- No new live authentication, financial, AR/EN browser or Neon test claimed. Application source and financial behavior were not modified; prior acceptance remains established rather than redundantly rerun.

## Files changed

- `vercel.json`: Vercel-only build configuration.
- `scripts/build-vercel.ts`: isolated Angular output and routing-manifest generation.
- `scripts/vercel-config.ts`: validated build-time backend origin, API proxy, SPA/static routing and headers.
- `tests/vercel-config.test.ts`: invalid-origin, API routing, route families and configuration-boundary tests.
- `package.json`: adds build:vercel only; no dependency change or lockfile change required.
- `.gitignore`: excludes .vercel local/generated metadata.
- `eslint.config.js`: excludes generated .vercel output.
- This document.

## Verdict

Frontend build/configuration prepared. Full deployment remains BLOCKED on an approved working backend and live proxy/authentication/upload verification. No deployment, push, billing, database access, financial logic changes, authentication changes or AI changes occurred.

## Official references

- https://vercel.com/docs/build-output-api
- https://vercel.com/docs/build-output-api/configuration
- https://vercel.com/docs/routing/rewrites
- https://vercel.com/docs/project-configuration/vercel-json
