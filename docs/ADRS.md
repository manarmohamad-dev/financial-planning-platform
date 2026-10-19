# Foundational architecture decisions

Status: accepted implementation decisions for Milestone 1, following the user's final contract.

## ADR-001 — Workspace is the tenant

Company and demo use one workspace model. Company access comes from memberships; demo access comes from its creator, without a fake company role. Every persisted tenant business row includes `workspace_id`. Global identities and authentication sessions are deliberately not company-owned: one account can access several workspaces.

Application authorization is mandatory. PostgreSQL RLS adds defense in depth. Workspace discovery and narrowly scoped bootstrap/invitation functions are the only operations that resolve context before a workspace is selected. All business-record transactions require actor and workspace context and fail closed without it.

Cost: explicit context on queries and careful pooled-connection testing. Benefit: later files/jobs/AI artifacts can use the same boundary.

## ADR-002 — Central action policy

The final Owner/Manager/Analyst matrix supersedes the earlier planning proposal. Manager can edit and publish baselines; Analyst can edit but cannot publish baselines. Roles resolve to named permissions in one policy. Routes request permissions, never infer them from hidden buttons. Demo has a separate allow-list.

Policy availability does not mean the corresponding future feature is implemented. `/access/:permission` is a permission decision endpoint, not financial capability eligibility.

## ADR-003 — Session authentication

Passport Local and express-session handle first-party login sessions. Session records live in PostgreSQL via connect-pg-simple. Cookies are HttpOnly/SameSite=Lax, secure and host-prefixed in production. Every mutation requires a synchronizer token and exact Origin. No cross-origin API sharing is enabled.

Password hashing uses Node's maintained scrypt primitive and random per-password salt. Passwords and tokens are not logged. Session ID and CSRF token rotate at login. Logout destroys the server record. Sessions have an eight-hour expiry.

Email delivery/verification and password recovery are later production-readiness work. Invitation tokens are shared out of band by the owner and are email-bound, hashed at rest, one-use, and expire after 24 hours.

## ADR-004 — Precision and time

Base currencies initially supported: EGP, SAR, USD, AED (each has two minor-unit decimal places). Currency cannot change after workspace creation. Unknown/incompatible currencies are blocked. Monthly periods use YYYY-MM, dates use ISO calendar dates without converting through a timezone, operational timestamps use UTC ISO timestamps.

Opening cash is the available balance immediately before activity on the first day of projection start. Midmonth opening balances are outside the initial contract. This is monthly planning, not within-month liquidity assurance.

Money enters as strict decimal strings with at most 18 integer digits and 6 decimal places. decimal.js is hidden behind Money/Rate. Products retain precision until authoritative movement quantization; serializing a higher-precision intermediate requires explicit quantization. Rounding policy `minor-unit-half-up-v1` uses half-up, then sums rounded movements. Timing remainders are deterministic. M2 monetary columns must use NUMERIC(24,6) with the same explicit boundary.

No M1 table stores authoritative period results, so no pretend financial result table is created just to contain NUMERIC.

## ADR-005 — Versions and concurrency

Drafts have optimistic revisions. Confirmation creates a new immutable snapshot and leaves the editable draft separate. Confirmation of the same revision is idempotent. Confirmed versions are immutable immediately, even before their first run reference. Database privileges and triggers prevent in-place changes.

A minimal assumption draft/version API exercises these primitives without implementing M2's planner. Future datasets, baselines and scenarios use the documented version reference/manifests; their full tables are intentionally deferred.

## ADR-006 — Source semantics and capability

Category, formula behavior and commitment status are distinct properties. Source assignment keys include component, period, scope **and financial effect/basis** so recognized expense and its cash payment can coexist without being mistaken for duplicate representations. Duplicate assignments within the same effect are rejected. Source kind/provenance remains visible.

Capability readiness and evidence labels are separate. Required inputs declare permitted source types. AI cannot grant financial eligibility. No capability engine is implemented in M1: only its strict contract.

## ADR-007 — Engine/runtime separation

The future TypeScript financial engine receives validated snapshots and has no IO/framework dependency. Risk evaluation consumes its outputs separately. Python receives numeric time series and returns statistical evidence through versioned schemas; it has no database, file-storage or AI privileges.

M1 adds schemas only. It does not execute forecasts or financial scenarios.

## ADR-008 — Jobs and runs

Run identity, job identity and job-attempt identity are distinct. Immutable input references, actor/workspace, idempotency key and safe status are represented in contracts. No queue package or worker is introduced in M1. Retrying future jobs must publish one logical result atomically.

## ADR-009 — Membership consistency and audit

Membership administration locks the workspace row to serialize ownership changes. A database guard also prevents removing/demoting the last owner or creating demo memberships. Ownership transfer first promotes an existing member and then demotes the actor in the same transaction.

Important business changes and audit events commit together. Audit records are append-only and contain action/resource/revision metadata rather than copied financial inputs.

## ADR-010 — Local infrastructure and deferred features

Angular 21 LTS, Node 24 LTS, Express 5 and PostgreSQL are used in one repository. An embedded PostgreSQL launcher is development/test tooling, not a replacement database or production deployment. Production must use a managed or separately operated PostgreSQL instance.

Personal demo is an isolated, labeled context in M1. No synthetic forecasts or fake results are displayed before the real engines exist. Archive is supported; irreversible deletion/retention are deferred. There is no public hosting, email sending, Python runtime execution, AI integration, file storage or queue infrastructure in M1.
