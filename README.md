# Explainable Financial Decision Simulator for SMEs

Implemented M1–M6: isolated workspaces, deterministic financial planning, versioned decision scenarios, reviewed XLSX/CSV imports, and evidence-based statistical forecasts with approved hybrid baselines. M6 adds deterministic stress/risk/decision evidence. Statistical forecasting is optional. No AI/LLM functionality is implemented; M7–M9 have not started.

For the current page-composition verification, see [the density report](docs/DENSITY-COMPOSITION-REPORT.md). Earlier milestone and UI reports are historical evidence, not a claim that every later revision repeated their checks. See [Week 3 deployment and review](docs/WEEK3-DEPLOYMENT.md) for production requirements and instructor access.

## Requirements

- Node.js 24 LTS and npm (tested with Node 24.21.0).
- Python 3.12 (tested with 3.12.14), standard library only. Set `FORECAST_PYTHON` to a trusted executable path if `python` is not on PATH.
- Windows x64 for the tested embedded local PostgreSQL launcher. A standard PostgreSQL 18 instance can be used on other platforms.
- Network access for the initial dependency installation.

## Clean local setup

From the repository directory:

1. Run `npm ci`.
2. In terminal A, run `npm run db:local` and leave it running.
3. In terminal B, run `npm run dev`.
4. In terminal C, run `npm run web`.
5. Open <http://localhost:4200>.

The local database launcher binds to `127.0.0.1:55432`, creates the development database, applies migrations, generates random local credentials, and writes an ignored `.env` only if one does not exist. It never overwrites an existing `.env`. Keep terminal A open; Ctrl+C stops PostgreSQL while preserving `.local/postgres`. This is development tooling, not the production database strategy.

If your organization installs a trusted system certificate and npm reports a certificate-chain error, use Node's `--use-system-ca` option. Do not disable TLS certificate verification.

Register your own account with a password of 12–128 characters. There are no seeded production credentials. The local browser-verification account is synthetic test data, not a user account to rely on.

## Standard PostgreSQL instead

Copy `.env.example` to `.env`, replace placeholders, and point `MIGRATION_DATABASE_URL` at a database owner/admin connection. Point `DATABASE_URL` at the separate `planner_app` runtime role. Run `npm run db:migrate` with administrative credentials. Migrations create `planner_app` as NOLOGIN if absent; your database administrator must provision its login credential outside source control. Never run the API with the migration owner or a superuser.

Use PostgreSQL 18 for the documented setup. The administrative migration connection needs permission to create the role on first installation. A managed-host administrator can provision the role first.

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run check` runs the four checks in sequence.

Tests start a real, isolated PostgreSQL cluster on port 55439 when `TEST_ADMIN_DATABASE_URL` is absent. Test clusters persist under ignored `.local/test-pg-*` for diagnosis and stop at suite completion. The development cluster on port 55432 is separate.

For CI or external PostgreSQL, set `TEST_ADMIN_DATABASE_URL` to a **disposable test cluster**. Tests create a uniquely named database and set the cluster-level `planner_app` password; never point this setting at a shared or production cluster. The workflow uses an isolated PostgreSQL service.

## Implemented workflows

- Registration, sign-in, session restoration, sign-out and CSRF protection.
- Create a company workspace; enter a private personal demo context.
- List/switch authorized workspaces; company currency fixed at creation.
- Invite a teammate with an expiring, one-use token bound to their account email.
- Accept an invitation; change a non-owner's role; remove membership; explicitly transfer ownership.
- Rename with optimistic concurrency; archive a workspace.
- Inspect safe workspace audit history.
- API-level assumption draft/confirmation fixture proving revision conflicts, currency checks and immutable snapshots. This is a small foundational persistence exercise, not M2's planning editor or engine.

### Planning and decisions (M2 / M3)

- Enter manual planning data, review readiness, confirm a version and publish a baseline.
- Evaluate sales, hiring, spending, simplified expansion and combined decisions.
- Review explicit assumptions, confirm immutable scenario versions and execute the same M2 Financial Engine.
- Inspect monthly baseline/scenario/difference, risk, timing, commitments and calculation evidence.
- Save compatible A/B/C comparisons; reopen historical results and verify deterministic replay.
- Try isolated synthetic baseline and decision examples in Personal Demo.

See [M3 contract and API](docs/M3-CONTRACTS.md) and [M3 completion report](docs/M3-REPORT.md).

## Repository map

- `apps/web`: Angular standalone application, financial workbenches, account/workspace flows, and EN/AR/RTL presentation.
- `apps/api/src`: Express composition, Passport/session authentication, centralized policy, tenant transactions, logging/configuration and password hashing.
- `packages/contracts/src`: versioned Zod schemas, Money/Rate, periods, source resolution, scenario/engine/capability/forecast/job contracts.
- `packages/planning/src`: authoritative M2 financial model and deterministic Financial Engine.
- `packages/scenarios/src`: M3 typed changes, transformation/readiness, comparison, synthetic fixtures.
- `packages/imports/src`: bounded file parsing, deterministic suggestions, reviewed financial mapping and normalization into M2.
- `packages/forecasting`: eligibility, hybrid composition and constrained Python forecasting.
- `packages/stress`: M6 deterministic stress transformations, explicit risk rules and decision evidence.
- `migrations`: identity/tenant foundation and immutable M2–M6 planning, import, forecast and stress history.
- `scripts`: migration runner, local PostgreSQL launcher, and isolated synthetic acceptance preview.
- `tests`: domain tests and real API/PostgreSQL acceptance tests.
- `docs`: ADRs, APIs, security boundaries, contract details and verification report.

## Scope and release status

See `docs/DENSITY-COMPOSITION-REPORT.md` for the latest pre-submission verification and `docs/M4-CONTRACTS.md` for import limits, API and financial interpretation. Earlier milestone reports are historical. This remains a development MVP. Email verification, password recovery, production deployment, retention/deletion, distributed background job scheduling and LLM integration are not implemented. Creating a company never copies demo data.

For M4: enter a company workspace as Owner or Analyst → **Data & Imports**. Upload a values-only XLSX or UTF-8 CSV, review every source column and financial meaning, validate and explicitly confirm. Use the resulting confirmed planning version in the existing baseline workflow, then select that published baseline in Decisions. Managers can inspect/use confirmed imported data but cannot upload or confirm mappings. Synthetic acceptance files are under `tests/fixtures/imports`.

Review `docs/SECURITY.md` before using real private data. Do not deploy this local-development setup as a finished public service.

## Statistical forecasting (M5)

Use **Forecasting** in a company workspace. Select confirmed, non-overlapping monthly Actual versions and a series, choose 3/6/12 months, review eligibility, then compare the four bounded candidate methods. Review the evaluation and limitations before approving a supported forecast. Choose a matching confirmed future template and explicitly review replaced entries to create a **new** hybrid baseline. Weak history remains usable through explicit monthly assumptions. Open Financial Baseline to calculate or publish it.

Jobs and immutable evidence can be reopened. Failed jobs can retry; interrupted running jobs can resume after 30 seconds. Run the API from the repository root and retain `packages/forecasting/runtime/worker.py` with production build files. No statistical prediction intervals are claimed by the initial point-forecast methods.

See [M5 architecture and contracts](docs/M5-CONTRACTS.md) and [M5 completion report](docs/M5-REPORT.md).

## Stress testing and decision evidence (M6)

Use **Risk Center** in a company workspace. Choose a published baseline run or a completed scenario, use an explicitly confirmed risk policy, review supported revenue/cost/collection-delay modifications and confirm immutable versions. Prepare and run a batch, inspect individual failures and successful evidence, compare compatible results, then generate a deterministic decision brief. Historical briefs can be reopened and verified. Only an Owner with `risk.edit` can create workspace policy versions.

See [M6 contracts](docs/M6-CONTRACTS.md) and [M6 verification report](docs/M6-REPORT.md). That report records the M6 acceptance results at the time. The current pre-submission baseline is 489 passing automated tests. M7 has not started and is outside Week 3 scope.

## Instructor walkthrough

Register and sign in with your own account. Choose **Enter demo** for the existing private synthetic examples, then **Financial Baseline → Calculate synthetic baseline**. Scenario Builder offers the existing deterministic decision examples. Company-only import, forecasting, team and risk workflows require a company workspace and their stated prerequisites; Personal Demo does not bypass them. An empty downstream result is not a calculated zero.

For company screens, create your own company workspace using the existing flow. Do not upload real private data to an instructional deployment. Forecasting is optional: reviewed assumptions and known schedules can support a baseline without historical forecast evidence.

## Documentation and artifacts

- Start with this README, [security boundaries](docs/SECURITY.md), and [deployment requirements](docs/WEEK3-DEPLOYMENT.md).
- `docs/M*-CONTRACTS.md` and architecture documents describe the implemented contracts.
- Milestone/UI reports and `docs/evidence/` are dated verification evidence; keep them for traceability.
- `output/pdf/` contains final historical PDF evidence. `tmp/` and `.local/` are ignored scratch/runtime artifacts, not submission source.
- `scripts/saas-preview.ts` is local-only synthetic acceptance tooling, not a public production entry point. It writes synthetic access details under ignored `.local/`.
