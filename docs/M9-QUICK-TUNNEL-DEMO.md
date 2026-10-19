# Graduation demo — 18 October 2026, 19:00 Africa/Cairo

## Current update: home-network tunnel connected

Current URL: https://built-destiny-donna-automated.trycloudflare.com

See [M9-TLS-DIAGNOSIS.md](M9-TLS-DIAGNOSIS.md) for the confirmed Avast interception cause, safe QUIC/system-CA fixes, successful public sign-in page and real Arabic AI inference, and remaining verification limitations. Independent outside-network verification remains unverified.

## Historical initial result: BLOCKED

The complete compiled Angular + Express application is running locally on loopback port 4339 with a new, isolated synthetic PostgreSQL demo database. Existing fixtures/services prepared a baseline, two scenarios, risk comparison and Decision Brief. This is the real application, not a frontend mock. No production source changed in this pass.

Neon was checked separately using the existing runtime credential in a READ ONLY transaction; connection succeeded, role was non-superuser/non-BYPASSRLS and the client TLS socket was encrypted with an authorized certificate. No Neon data, migration or schema was changed. PostgreSQL initialization/migrations were confined to the newly created loopback synthetic database.

## Verified now

- Local API liveness: HTTP 200.
- Authentication through loopback API with simulated trusted HTTPS forwarding: HTTP 200; Secure/HttpOnly/SameSite=Lax cookie emitted. This is **not** public browser cookie verification.
- Foreign Origin mutation: HTTP 403.
- Saved scenario deterministic replay: `matches: true`.
- Real Python forecasting subprocess on synthetic history: `supported`, three output periods, selected model `holt`.
- AI capabilities accurately advertise Guided Input and disabled free-text extraction. One real Arabic result-explanation request returned HTTP 503 `AI_PROVIDER_UNAVAILABLE`; live AI inference is **not verified successful**. No model/provider change or billing activation occurred.
- Secret-containing local state/runtime files are covered by Git ignore. No secret was printed or uploaded. No Git push occurred.

## Exact tunnel blocker

Official Cloudflare GitHub release `2026.10.1` was downloaded. SHA256:
`4d2490e74082c5d48dbfedaf92576fa5bd1702379ab88eb7faa0cfbe8dc891b6`.

Quick Tunnel allocated addresses, but the connector failed to authenticate the Cloudflare edge certificate:

```text
TLS handshake with edge error: tls: failed to verify certificate:
x509: certificate signed by unknown authority
```

The first address returned HTTP 530. A bounded HTTP/2 attempt, with TLS verification still enabled, also failed against multiple edge addresses. Allocated addresses are **not usable demo URLs** and are not handed off as working links. Failed tunnel process was stopped; local application/database remain running.

The initial certificate failure was confirmed before its cause was established. The subsequent focused diagnosis identified Avast interception. Explicit QUIC with prechecks skipped connected successfully. No certificate checking was disabled and no unknown certificate was trusted.

## Fastest safe next action

Keep the existing home network. Use the verified process-local configuration in M9-TLS-DIAGNOSIS.md. Do not change networks or start another hosting investigation.

On successful tunnel creation, use its new HTTPS origin as APP_ORIGIN and restart only the API against the existing synthetic database. Do not rerun the initializer: it creates a fresh synthetic database. Private runtime configuration is in `.local/m9-demo/runtime.json`; current synthetic account details and record IDs are in `.local/m9-demo/state.json`. Do not paste those files into chat or publish them. A restart may require signing in again.

Before sharing any replacement URL, verify frontend assets/deep links, actual public browser login and reload, secure cookies, CSRF, scenario replay, risk/brief, and public EN/AR printing. Those checks, the complete public journey, and public secret-path checks remain blocked, not passed. AI provider availability must be checked again after connectivity is restored, without changing provider or bypassing validation.

## Keeping the demo running / recovery

Keep Windows awake, connected to power and stable Internet. The local API and database were launched in the background; closing a browser does not stop them. Do not end their processes or restart the computer during the demonstration.

When a working tunnel is eventually established, temporary network loss may reconnect automatically. If cloudflared exits, restart it; a new Quick Tunnel normally has a new hostname, requiring APP_ORIGIN update and API restart before login. If the computer restarts, resume the preserved synthetic database rather than resetting/reseeding it. Do not use Neon admin credentials as a recovery shortcut.

## Five-minute presentation

1. **0:00–0:40 — Problem and Overview.** Explain cash planning before committing to a decision. Identify synthetic demonstration data and the baseline ending/minimum cash.
2. **0:40–1:30 — Baseline and evidence.** Show reviewed assumptions, timing, source lineage; financial calculations are deterministic.
3. **1:30–2:30 — Guided Input and scenario.** Show sales or hiring inputs, review/confirmation, then a saved scenario result and baseline comparison.
4. **2:30–3:30 — Risk.** Show the saved risk comparison and explicit policy/threshold evidence. Explain that a missing value is not zero.
5. **3:30–4:20 — AI role.** Demonstrate evidence-grounded explanation only if the provider succeeds. Otherwise show the genuine unavailable state and explain the complete manual path; do not present a fabricated or prerecorded response as live inference.
6. **4:20–5:00 — Decision Brief.** Open saved brief, trace source/run identifiers, switch Arabic/English and demonstrate print/PDF if the final browser check passes.

This report does not replace the earlier 612-test acceptance or claim a new full regression run. Scope was urgent startup and bounded connectivity checks only.
