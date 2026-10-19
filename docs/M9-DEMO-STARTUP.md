# Graduation demo: one-command local startup

From the project directory, in PowerShell:

```powershell
.\Demo.cmd start
```

From any directory, invoke Demo.cmd by its full path. No administrator privileges are required. This is a machine-local launcher, depending on preserved gitignored files under `.local/m9-demo/`; do not publish those files or upload them to a host.

## Behavior

- Reuses the existing synthetic database directory recorded in state.json. Requires PG_VERSION; refuses to initialize, migrate or seed a database.
- Resumes PostgreSQL on loopback port 55461 only when stopped, using its installed pg_ctl. Financial records are not changed by the checks. Normal database startup/shutdown can update PostgreSQL's own operational files.
- Starts the verified official cloudflared binary with QUIC and TLS verification intact. Reuses an already running demo connector. Waits at most 45 seconds for a new connection; no unbounded tunnel experimentation.
- Captures the current HTTPS hostname. Restarts only the demo API when necessary with matching APP_ORIGIN, secure production cookies, the preserved local database and Node --use-system-ca.
- Angular's existing production build is served by Express on port 4339; no separate Angular development server is needed. Python is invoked on demand by the existing forecasting service.
- Checks the database with a READ ONLY transaction, public API health, Angular HTML and public entry-script hashes against the local build.
- Performs one real Arabic AI explanation using saved synthetic evidence and the unchanged provider, with strict validation and no database save. Reports unavailable/unverified honestly if the check fails; the manual app remains usable. No billing is enabled.
- Prints the public URL. Private runtime values and account passwords are not printed.

## Shutdown — prepared, NOT executed during verification

```powershell
.\Demo.cmd stop
```

Stops only PID-identified demo connector/API, stops the preserved PostgreSQL instance with pg_ctl fast shutdown, then ends the old demo initializer supervisor if still present. Validates process command lines before stopping them. Wait for the successful shutdown message before powering off. No database folder is deleted and no Windows-wide Node/PostgreSQL processes are killed.

You do not need to keep the laptop running all day. Stop cleanly when finished preparing; start again around 18:30–18:40 Cairo to allow time for verification before the 19:00 discussion. Keep the laptop awake, powered and online throughout the live discussion. Closing the browser is safe. Stopping/restarting the tunnel usually changes the URL: share only the URL printed by the latest successful start.

## Verification performed

- PowerShell parser and both Node helper syntax checks passed.
- `Demo.cmd start` ran successfully against the currently running services, without stopping them.
- Public API and Angular assets passed; existing database read-only check passed.
- Actual Arabic Groq inference and strict evidence validation passed.
- No application source, financial calculations, Neon data or migrations changed.
- Cold restart after shutdown/reboot and the shutdown branch were NOT executed, as requested. Their commands and preserved-path checks were reviewed; this is not a claim of a completed cold-start test.
- Independent access from another network is not established by these checks.

## Recovery

On a brief network interruption, allow automatic QUIC reconnection and reload the page once. If a process exits, run `Demo.cmd start` again. If it reports an ownership mismatch, missing database or failed public health, stop and retain logs; do not run start.ts, reset the database, disable TLS or change networks. If a tunnel reconnect fails within the bounded wait, the script stops checking rather than creating additional tunnels.

Local helpers: `.local/m9-demo/demo.ps1`, `restart-api.cjs`, `startup-check.cjs`, `ai-readonly.mjs`. Current URL: `.local/m9-demo/url.txt`. Account details remain privately in state.json; never share runtime.json.
