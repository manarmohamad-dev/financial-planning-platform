/** Build-time routing only. Never serialize process.env into frontend assets. */
export function vercelOutputConfig(value: string | undefined) {
  const message = 'BACKEND_ORIGIN must be a public HTTPS origin without credentials, path, query or fragment';
  let url: URL;
  try { url = new URL(value ?? ''); } catch { throw new Error(message); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !url.hostname.includes('.') || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local') ||
      /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) throw new Error(message);
  return {
    version: 3,
    routes: [
      // API errors must never fall through to the Angular shell. No CDN cache for sessions/data.
      { src: '^/api(?:/.*)?$', headers: { 'Cache-Control': 'no-store' }, continue: true },
      { src: '^/api(/.*)?$', dest: `${url.origin}/api$1` },
      { src: '/.*', headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'no-referrer',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'; base-uri 'self'; font-src 'self' https: data:; form-action 'self'; frame-ancestors 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' https: 'unsafe-inline'; upgrade-insecure-requests",
      }, continue: true },
      { handle: 'filesystem' },
      { src: '^/(?:|sign-in|sign-up|account|workspaces(?:/.*)?)$', dest: '/index.html', headers: { 'Cache-Control': 'no-cache' } },
      { src: '/.*', status: 404 },
    ],
  };
}
