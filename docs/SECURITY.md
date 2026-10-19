# Security boundaries and operating limitations

## Implemented

- Session authentication with PostgreSQL storage; secure HttpOnly production cookie; no browser token storage.
- CSRF synchronizer token and exact Origin verification for mutations, including authentication.
- Central default-deny permission policy, separate demo allow-list, tenant transactions and RLS.
- Runtime role is not table owner, superuser or BYPASSRLS. Migration credentials remain separate.
- Tenant-aware foreign keys for assumption versions; missing workspace context returns no business records.
- Membership/ownership locks, last-owner guard, membership revocation checked on each request.
- Invitation token hashes, account-email binding, expiry and single use.
- Strict request schemas, body limits, authentication/global rate limits, secure headers, safe errors.
- Financial inputs, passwords, cookies and invitation tokens excluded from routine request logs; logger redaction also tested directly.
- Append-only audit and immutable confirmed snapshots.

RLS definer functions have pinned search paths and restricted execution grants. They intentionally bootstrap the first owner or accept a valid invitation, without granting arbitrary financial access. Application authorization remains necessary: RLS is tenant isolation, not the full action permission matrix.

## Not a production launch

### Accepted M7 AI boundary

AI assistance is implemented for review of recorded assumptions, saved scenario evidence, actual risk findings and Decision Brief assistance. Financial calculations remain deterministic. Guided Input remains manual; new free-text extraction is rejected at API and service boundaries, while historical records retain authorized read access. No model output can create or confirm a financial scenario automatically.

The provider receives bounded approved context for the authorized workspace; evidence references and output are validated before presentation. Unknown information is not zero. Missing credentials, provider failures and invalid output preserve the manual workflow. Keep `GROQ_API_KEY` server-side in ignored local configuration or a deployment secret store; never place it in Angular assets. The accepted provider configuration requires the documented inference Zero Data Retention setting. This setting does not replace workspace authorization, output validation or local retention policy. Do not send real private data before deployment privacy review.

- No email verification, password recovery, MFA, account deletion or retention service yet.
- Invitation delivery is manual; no message is automatically sent.
- Rate limiting uses an in-process store suitable for the single API foundation; multiple API instances would need shared enforcement.
- Local database secrets live in ignored local files. Protect the workstation and apply suitable filesystem permissions; Windows permissions follow the user's profile ACLs.
- Local PostgreSQL is loopback-only development/test tooling. Production TLS, storage encryption, managed backups and restore drills are later deployment work.
- M4 imports retain bounded original files as private database blobs with tenant RLS, authenticated downloads and immutable provenance. The parser rejects formulas, active content, external relationships, unsafe archives and excessive expansion. File isolation and parser security tests are in the M4 suites; see `M4-CONTRACTS.md` for exact limits. Antivirus scanning and file-retention/deletion services remain out of scope. Accepted M7 AI boundaries are described above. M5 forecasting jobs are persisted and run by the bounded server-side Python runner; distributed background-job scheduling is not implemented.
- Archive preserves data but currently blocks business-route access. Irreversible deletion is deliberately absent until dependency/retention handling is implemented.

Do not substitute an administrative database URL for DATABASE_URL. Tests assert the runtime role cannot bypass RLS. Never point TEST_ADMIN_DATABASE_URL at production: the suite provisions databases and a runtime role in its disposable cluster.
