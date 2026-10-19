# M9 GitHub release verification

Date: 2026-10-19 (Africa/Cairo). Local release only; no push, deployment, billing or Neon connection/data change.

## Release decision

GO for pushing the reviewed release to the intended **private** financial-planning-platform repository after explicit push approval. This is not Render capacity/deployment acceptance. The commit identifier is available from `git log -1`; exact staged changes and the complete release inventory are in `M9-RELEASE-FILES.txt`.

## Inventory and preparation

Inventoried all 789 tracked/unignored working-tree files before cleanup, including staged, modified and untracked files. Existing staged work was preserved except raw `docs/evidence/` additions were removed from the index only; their files remain on disk. No legitimate project file was deleted. Root historical Git contained two commits, including all refs/reflogs available locally; remote-only/deleted unreachable history is not available for certification.

Release includes Angular pages/routes/styles/locales and actual synthetic public screenshots, Express/API and security services, Python worker, all domain packages, nine migrations, Docker/context config, dependency lockfile, CI, development/test scripts and fixtures, and text documentation. Optional older hosting configuration is retained as historical tooling, not activated. Required runtime screenshots remain in `apps/web/public/assets/product/`.

Raw provider experiment outputs, PDFs/browser captures, local databases, build output, caches, environment files, private keys and the laptop-only Demo.cmd stay local/ignored. README explains local evidence links and corrects its stale M7-not-started/489-tests statement. ESLint ignores generated tmp/out/output artifacts so the normal lint command works without source exclusions.

## Security evidence

Gitleaks 8.30.1 downloaded from the official gitleaks/gitleaks GitHub release; archive SHA-256 checked against the release checksums. All raw scan artifacts retained only in ignored `.local/release-security/` and redacted 100%.

- Full locally available history: 2 commits scanned via `--all --full-history` (all/reflog count also 2). Two generic-api-key alerts in historic `tests/api.test.ts:664` and `:707`.
- Working-tree snapshot: all 789 tracked/unignored files supplied to scanner; same two alerts at current lines 665/708. Classification: static **idempotencyKey** test inputs for stress comparisons, not authentication/provider credentials; non-secret identifiers sent to local synthetic test APIs. No production credential or exposed key was confirmed. No blanket suppression added.
- Final staged index exported and scanned independently: only the same two classified idempotency test identifiers; no additional findings. No unstaged tracked changes remained before commit.
- Production Angular assets: zero findings.
- Additional text checks for token-bearing OAuth URLs, credentialed Neon/Render URLs, and personal email patterns: no confirmed sensitive matches. UI email matches are the `you@company.com` placeholder.
- Tracked sensitive filename checks: `.env.example` only; its credentials are local placeholders and AI key is blank. Production secrets are not staged.
- npm audit, all installed dependency categories: **0 known vulnerabilities**. Initial certificate-chain failure was resolved using Node's system CA trust, not by disabling TLS verification.

Limits: scanners do not prove mathematical absence of secrets. Binary screenshots/PDFs are not OCR-scanned by Gitleaks; raw evidence is therefore excluded rather than certified public. The two included product screenshots were visually reviewed in P0 and are synthetic. Ignored private runtime/credential/database directories are deliberately not published or copied into the release; their contents are not included in the 789-file secret-scan coverage. Full remote history and external services were not inspected. This report makes no claim that `.gitignore` can detect credentials embedded arbitrarily in code: content scanning/review remains required.

## Environment and localhost verification

- Production API requires APP_ORIGIN, DATABASE_URL and SESSION_SECRET from environment; HTTPS enforced in production. PORT is host supplied; BIND_HOST and bounded proxy trust are configurable.
- Python executable uses FORECAST_PYTHON; Groq key/enable/model/timeout are server configuration. No secret browser environment bundle.
- Source search across apps/api/src, apps/web/src and packages found no hardcoded localhost/127.0.0.1 network endpoints. Groq's public API endpoint is intentional and contains no key.
- Docker's loopback health probe is intentionally internal, not a public backend address. `.env.example`, dev proxy, disposable CI/test DB and local tooling contain localhost deliberately; they are not production URL configuration.
- Secure session cookies, CSRF, permissions, tenant isolation and financial calculations were not changed.

## Verification on release working tree

- `npm run lint`: PASS, normal command.
- `npm run typecheck`: PASS.
- `npm test`: **621/621 PASS**, 19 files; 24.47 seconds. TEST_ADMIN_DATABASE_URL removed from process environment to force disposable local test storage.
- `python tests/forecast_worker_test.py`: **6/6 PASS** using bundled Python.
- `npm run build:api -- --outDir .local/github-release-build/dist`: PASS.
- `ng build web --output-path .local/github-release-build/dist/web`: PASS, initial 735.25 kB / estimated transfer 145.17 kB, no budget warning.
- Production builds isolated to avoid replacing the running demo build. No fresh dependency install or Docker execution claimed.

## Remaining deployment blockers

1. Docker/Linux image build and 512 MB/0.1 CPU resource fit unverified because Docker/WSL are unavailable locally.
2. Render Free account/card eligibility and budget gates: stop on payment request; $7 paid tier exceeds approved $5 ceiling.
3. Deployed-origin session/proxy/cookie, Neon least-privileged connectivity, forecasting, Groq and complete public E2E acceptance remain pending.
4. GitHub push requires separate approval and correct repository selection. A local commit does not publish anything.

No financial formula, Python algorithm, authentication/permission semantics or database behavior changed. Raw local files were preserved. Security review found no confirmed credential exposure requiring rotation or a commit stop.

