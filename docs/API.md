# API v1

All routes begin `/api/v1`. JSON request schemas are strict. Every mutation requires an authenticated session where applicable, `Origin` equal to configured APP_ORIGIN, and `X-CSRF-Token` from the same session. Registration and login also require CSRF protection.

Errors have `{ error: { code, message, requestId } }`. Codes are stable; messages never echo financial input. Unauthenticated is 401, forbidden is 403, inaccessible resources are 404, revision conflicts are 409, currency mismatch is 422, request-size limit is 413. A resource outside the caller's workspace never returns its contents.

## Identity/context

| Method/path              | Behavior                                                 |
| ------------------------ | -------------------------------------------------------- |
| GET /health              | Basic liveness, milestone identifier                     |
| GET /auth/csrf           | Issue/read synchronizer token                            |
| POST /auth/register      | email, displayName, password; create account and session |
| POST /auth/login         | email, password; rotate session and CSRF token           |
| POST /auth/logout        | Destroy current server session                           |
| GET /auth/me             | Current account                                          |
| GET /workspaces          | Discover only accessible workspaces                      |
| POST /workspaces         | name, currency; atomically create company and Owner      |
| POST /demo               | Idempotently create/enter own demo                       |
| POST /invitations/accept | token; consume one-use matching invitation               |

## Workspace routes

Prefix `/workspaces/:workspaceId`.

| Method/path                   | Required permission  | Behavior                                                                           |
| ----------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| GET /                         | data.view            | Workspace, role and permission list                                                |
| GET /access/:permission       | Requested permission | 204 allowed / 403 denied; policy only                                              |
| PATCH /                       | workspace.edit       | name + expected revision                                                           |
| POST /archive                 | workspace.archive    | Archive; preserve history                                                          |
| GET /members                  | members.manage       | Memberships and member identity                                                    |
| POST /invitations             | members.manage       | email, MANAGER/ANALYST; returns token once                                         |
| PATCH /members/:userId        | members.manage       | Set MANAGER/ANALYST; no implicit ownership changes                                 |
| DELETE /members/:userId       | members.manage       | Remove non-owner access                                                            |
| POST /ownership-transfer      | ownership.transfer   | targetUserId; existing member becomes Owner, actor becomes Manager                 |
| GET /audit                    | data.view            | Latest 100 safe audit events                                                       |
| GET /drafts                   | data.view            | Foundation assumption drafts                                                       |
| POST /drafts                  | baseline.edit        | Strict title and assumption array                                                  |
| GET /drafts/:draftId          | data.view            | Tenant-scoped draft                                                                |
| PATCH /drafts/:draftId        | baseline.edit        | revision + payload; stale revision gives 409                                       |
| POST /drafts/:draftId/confirm | baseline.edit        | revision; creates/reuses immutable assumption version                              |
| GET /versions/:versionId      | data.view            | Immutable confirmed assumption snapshot                                            |
| POST /imports                 | data.import          | M4 XLSX/CSV upload; see M4-CONTRACTS.md for the full import API |

Confirmation of foundation assumptions is preparation, **not publication of a shared baseline**. The subsequent M2 planning API implements baseline publication, and M3 adds scenario execution. See `M3-CONTRACTS.md` for those established contracts and `M4-CONTRACTS.md` for import endpoints that feed ordinary M2 planning versions.

Draft payload: title plus an array of { key, value, currency, explanation }; value is a decimal string. Limits: title 120 characters, 50 assumptions, 64 KiB JSON request body. This limited fixture proves persistence contracts; it is not the general financial data-entry model.

Archived workspaces remain listed but the current release blocks their business routes. Full historical archive browsing and unarchive/deletion workflows are deferred.

## Concurrency/idempotency

Workspace renames and draft edits require an expected revision. Draft confirmation takes a row lock and is unique by workspace/draft/revision. Ownership and membership operations lock the workspace. Demo creation serializes per user. M2/M3 runs enforce idempotency; M4 dataset confirmation is idempotent per immutable mapping version. Background job execution remains deferred.
