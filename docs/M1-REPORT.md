# Milestone 1 completion report

## Outcome

Milestone 1 is implemented and locally verified. No blocking contradiction was found in the final contract. The repository is ready for Milestone 2 development after the user's review. Milestone 2 has **not** begun.

This is a tested development foundation, not the complete financial product or a public production release.

## Implemented

- Angular application shell: registration/login, workspace chooser, personal demo context, company creation, overview, membership administration, settings and audit display.
- Express/TypeScript API with Passport Local and PostgreSQL-backed server sessions, CSRF/Origin checks, request IDs, strict request validation, secure headers, rate limiting and redacted logs.
- User, Workspace and Membership model; independent personal demo ownership; multiple company memberships supported.
- Approved centralized Owner/Manager/Analyst permission matrix. Manager baseline publication is allowed; Analyst publication is denied. Future feature permission decisions are distinct from operational feature availability.
- One-use, email-bound, expiring invitation tokens; join, role changes, revocation and explicit ownership transfer.
- Tenant-scoped query transactions, PostgreSQL RLS, least-privilege runtime role and startup refusal for unsafe database roles.
- Workspace locking and database-level last-owner protection; no company roles on demo workspaces.
- Minimal persisted assumption draft/confirmation fixture demonstrating optimistic concurrency, currency checks and immutable versions without introducing a financial engine.
- Atomic audit records for implemented workspace, membership and assumption actions.
- Versioned schemas for money, rates, periods, currencies, scopes, observations, source assignments, capabilities, scenarios, engine inputs/outputs, run manifests, forecasts and jobs/attempts.
- Clean-database migrations, development PostgreSQL launcher, package lock, lint/typecheck/test/build commands and GitHub Actions workflow.
- README, API guide, security limitations, contract guide and ten ADRs.

## Files and modules

| Location                        | Responsibility                                                    |
| ------------------------------- | ----------------------------------------------------------------- |
| apps/api/src/app.ts             | HTTP composition and implemented identity/workspace/draft routes  |
| apps/api/src/policy.ts          | Workspace resolution and centralized authorization                |
| apps/api/src/db.ts              | Tenant transactions and atomic audit writes                       |
| apps/api/src/password.ts        | Salted scrypt hashing and constant-time verification              |
| apps/api/src/config.ts          | Validated configuration and production HTTPS origin requirement   |
| apps/api/src/logging.ts         | Safe structured request logging and redaction                     |
| apps/api/src/errors.ts          | Stable application error type                                     |
| apps/api/src/server.ts          | Startup, runtime connection and shutdown                          |
| apps/web/src/main.ts            | Angular state and API interactions                                |
| apps/web/src/app.html           | Authentication/workspace administration shell                     |
| apps/web/src/styles.css         | Responsive application styling                                    |
| packages/contracts/src/index.ts | Framework-independent financial/domain schemas and primitives     |
| scripts/migrate.ts              | Ordered transactional migration runner with lock                  |
| scripts/local-db.ts             | Loopback-only local PostgreSQL development launcher               |
| tests/contracts.test.ts         | Domain/configuration/logging tests                                |
| tests/api.test.ts               | Real API, session, authorization and PostgreSQL integration tests |
| .github/workflows/ci.yml        | Linux/PostgreSQL lint/typecheck/test/build/audit workflow         |

## Database and migrations

1. `001_foundation.sql`: users, sessions, workspaces, memberships, planning drafts, immutable assumption versions, audit events, tenant policies, bootstrap helper, grants and indexes.
2. `002_invitations.sql`: invitation table and constrained invitation-acceptance function.
3. `003_membership_guards.sql`: database enforcement of last-owner protection, immutable membership identity and no demo memberships.

`schema_migrations` records applied migrations. The test suite applies migrations twice to a new database to verify clean installation and no-op reapplication. The local development database also has all three migrations applied.

Future financial observations/results tables are not created in M1. NUMERIC(24,6) is the documented monetary storage boundary; current immutable assumption snapshots retain strict decimal strings inside bounded validated JSONB.

## Architecture choices and implementation assumptions

- Angular 21 LTS / Node 24 LTS; no microservices or job infrastructure added.
- PostgreSQL runtime role is separate from the migration role and cannot bypass RLS.
- Initial currencies: EGP, SAR, USD, AED; base currency fixed after creation.
- Calendar-month periods; opening cash is immediately before activity on the first projection day.
- Half-up rounding policy, precision retained through internal multiplication, explicit final movement quantization.
- For pathological tiny timing allocations, earlier allocations are capped by remaining magnitude so rounding cannot create an opposite-sign final cash movement; the final bucket receives the remainder. This safety refinement is covered by conservation tests.
- Confirmed snapshots immutable immediately, not only after their first analytical reference.
- Evidence labels may be combined; they are not a confidence score.
- Financial effect/basis is included in the source uniqueness key so recognized activity and cash can coexist.
- Invitation delivery is manual; no external messages were sent.

## Exact local verification results

Final `npm run check` completed with exit code 0:

| Check                                                          | Result                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ESLint                                                         | Passed; no lint errors                                                    |
| TypeScript API/contracts and Angular strict template typecheck | Passed                                                                    |
| Vitest                                                         | **120 tests passed, 2 test files passed, 0 failures**                     |
| Final test duration                                            | 7.58 seconds on this workstation; not a performance guarantee             |
| API TypeScript build                                           | Passed                                                                    |
| Angular production build                                       | Passed                                                                    |
| Angular initial bundle                                         | 189.92 kB raw; 52.12 kB estimated transfer                                |
| Clean source-only `npm ci`                                     | Passed, exit 0                                                            |
| Build from that clean installation                             | Passed, exit 0; same bundle sizes                                         |
| Runtime dependency audit (`npm audit --omit=dev`)              | 0 reported vulnerabilities at verification time                           |
| Generated credential scan                                      | No generated local credentials found in unignored repository source files |
| Ignore checks                                                  | .env, .local/db-secret, node_modules and dist excluded                    |

Build verification timestamp: 2026-09-15 21:53 UTC (2026-09-16 in Africa/Cairo).

Versions observed: Node 24.21.0, Angular 21.2.23, Express 5.2.1, pg 8.23.0, decimal.js 10.6.0, Passport 0.7.0, express-session 1.19.0, TypeScript 5.9.3, Vitest 4.1.11. Local test launcher: embedded-postgres 18.0.0-beta.15. The beta label belongs to the development wrapper package; production is planned around separately operated PostgreSQL.

The dependency installer emitted lifecycle-script allow-list notices and an ESLint 9 support/deprecation notice. These did not prevent clean installation or checks. Runtime audit is not a complete supply-chain or production-security certification.

The GitHub Actions workflow is created. It has **not** run on GitHub because no remote repository was configured or pushed. Equivalent check commands passed locally. Git was initialized on branch main; no commit or remote was created.

## Security/isolation evidence

- A different workspace cannot retrieve the source workspace, its drafts or its audit history through the real API.
- Substituting a draft ID under another authorized workspace returns no source data.
- Direct runtime-role queries without workspace context return no tenant business rows.
- Runtime role verified as non-superuser and not BYPASSRLS.
- API startup explicitly rejects an administrative connection.
- All 57 company role/permission combinations are checked through the real authorization endpoint against an independently written acceptance matrix.
- All demo permissions are checked, along with real rejection of imports and financial-input drafts.
- Demo workspaces have no Membership rows and do not copy records into new company workspaces.
- Revoked membership stops access in the existing session.
- Last-owner removal is rejected by both API and database guard; explicit transfer preserves one owner.
- Concurrent draft updates produce one success and one VERSION_CONFLICT; a previously confirmed version stays unchanged.
- Confirmed versions reject database mutation. Audit output excludes the tested financial assumption amount.
- Logout invalidates the session; expired server sessions cannot authenticate; missing/wrong CSRF and Origin are rejected.
- Invitation email mismatch, expiry and reuse are rejected.
- Logging redaction is tested against password, cookie, token and request-body contents.

## Browser verification

Performed against the local Angular/API/PostgreSQL stack using a synthetic test account:

1. Registration and authenticated workspace chooser.
2. Personal demo entry with explicit synthetic-only label and unavailable analysis controls.
3. Company creation and Owner context.
4. Reopening persisted workspaces after reload.
5. Owner membership administration screen.
6. Desktop visual inspection of authentication and company overview screens.

These were browser smoke checks, not a committed automated browser E2E suite. Responsive CSS is included; a full device/accessibility audit is deferred.

## Scope deviations and limitations

No approved product/architecture constraint was replaced.

The persisted assumption draft/version endpoint is the permitted small contract-level exercise needed to verify real concurrency, immutable state and audit behavior. It does not calculate financial outputs or constitute M2 implementation.

Deferred by design:

- Real synthetic analytical datasets/results in Demo: the engines do not yet exist.
- Financial calculations, baselines, scenario execution, imports, files, forecasting and AI.
- Baseline publication workflows; their policy is defined/tested only.
- Queue execution, run persistence and Python execution; their contracts exist only.
- Irreversible deletion, retention and unarchive/history browsing for archived workspaces.
- Email verification, account recovery and MFA before public production use.
- Shared rate-limit storage for a multi-instance API.
- Production hosting, backups/restore drills and remote CI execution.

## M2 readiness

**Ready for M2 development, subject to user review.** The workspace/security, money, period, versioning and inter-module contract foundations are implemented and tested. M2 should implement snapshot completeness and the scheduled/assumption-based financial engine against these contracts, with independent golden financial cases. No M2 work was started.
