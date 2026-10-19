# Home-network TLS diagnosis — 18 October 2026

## Result

Connected on the existing home network:
https://built-destiny-donna-automated.trycloudflare.com

Public-hostname frontend and API health returned HTTP 200. Chrome rendered the sign-in page with no failed requests or JavaScript errors on the final check. Independent external web-fetch verification was unavailable: the tool reported the URL inaccessible. A complete authenticated public journey was not repeated in this focused, no-database-write diagnosis.

## Confirmed cause

- Windows time matched the authenticated Groq HTTPS Date response within seconds. Windows Time service was stopped, but observed clock skew did not explain this failure. Clock unchanged.
- WinHTTP was direct; user ProxyEnable=0, no configured proxy/PAC. This does not exclude all middleboxes.
- Avast and Windows Defender were registered. Avast's normal Web/Mail Shield root already existed in Windows trust.
- A strict TLS probe to 198.41.192.7:7844, SNI h2.cftunnel.com, received a CloudFlare Origin Certificate reissued by **Avast Web/Mail Shield Untrusted Root**. Verification rejected it. This proves Avast interception of the failing TCP edge connection. No untrusted root was imported.
- Groq and the Quick Tunnel allocation API presented certificates issued by the normal Avast root. Default Node trust failed with UNABLE_TO_VERIFY_LEAF_SIGNATURE; Node using the existing system CA store validated them.
- Official cloudflared 2026.10.1, SHA256 4d2490e74082c5d48dbfedaf92576fa5bd1702379ab88eb7faa0cfbe8dc891b6. No alternate binary or downgrade.

## Reversible fixes

1. Started the same official connector with `--protocol quic --no-prechecks`, targeting http://127.0.0.1:4339. Prechecks are connectivity diagnostics; TLS verification remains enabled. QUIC connected successfully.
2. Restarted only the demo API with Node `--use-system-ca`, the new APP_ORIGIN and preserved private runtime configuration. No application source or database changes. Removed inherited SSLKEYLOGFILE from this child process environment.
3. No changes to Windows certificates, antivirus settings, financial calculations, Neon, provider/model or billing.

Rollback is process-local: stop this connector and restart the API without the system-CA option using its prior origin. This restores the previous connectivity problem; no application rollback is necessary.

## AI verification

The earlier AI_PROVIDER_UNAVAILABLE was explained by Node's certificate-trust failure before reaching Groq. After the trust fix, one real Arabic result_explain inference used the unchanged production provider/model and a saved synthetic scenario. The existing context, schema, materialization and strict validation pipeline passed with outcome ready and evidence references.

The database transaction was READ ONLY and rolled back. Output was written only to `.local/m9-demo/ai-tls-verification.json`. This establishes one successful inference, not every AI task or authenticated public UI inference.

## Stability and recovery

One QUIC timeout interrupted a JS asset at 03:46:48 UTC. Automatic reconnection succeeded at 03:46:51. The asset subsequently returned 200 and a fresh Chrome load succeeded. Do not claim guaranteed stability. Reload once after reconnection if a page was interrupted.

Keep Windows awake, powered and connected to home Internet. The API, synthetic PostgreSQL supervisor and tunnel run in the background. Closing a browser does not stop them. Do not rerun the initializer or reset data. Restarting a Quick Tunnel normally changes its hostname: update APP_ORIGIN before restarting only the API against the preserved database.

## Evidence and limitations

Local evidence: `tls-diagnosis.cjs`, `StrictTlsProbe.cs`, `tunnel3.log`, `ai-tls-verification.json`, `public-browser.json`, `public-login.png` under `.local/m9-demo/`. Runtime/state files remain gitignored. No full regression was rerun; earlier 612 tests remain the established baseline.

Independent outside-network verification remains unverified. HTTPS access through the public hostname from this computer succeeded. No new financial/database records or production source changes were made in this diagnosis.

Official references:
- https://nodejs.org/api/cli.html#--use-system-ca
- https://github.com/cloudflare/cloudflared/blob/master/tlsconfig/origin_ca.go
- https://github.com/cloudflare/cloudflared/blob/master/tlsconfig/cloudflare_ca.go
- https://blog.avast.com/2015/05/25/explaining-avasts-https-scanning-feature/
