import { describe, expect, it } from 'vitest';
import { vercelOutputConfig } from '../scripts/vercel-config.js';

describe('Vercel same-origin deployment boundary', () => {
  it.each([undefined, '', 'http://backend.example.com', 'https://user:secret@backend.example.com',
    'https://backend.example.com/api', 'https://backend.example.com?key=secret',
    'https://backend.example.com#secret', 'https://localhost', 'https://127.0.0.1',
    'https://service.local', 'https://[::1]'])('rejects unsafe or incomplete backend origin %#', (value) => {
    expect(() => vercelOutputConfig(value)).toThrow('BACKEND_ORIGIN');
  });
  const config = vercelOutputConfig('https://backend.example.com/');
  const proxy = config.routes[1];
  it('proxies API including bare /api before filesystem/SPA without a method restriction', () => {
    for (const path of ['/api', '/api/v1/auth/csrf', '/api/v1/workspaces/w/imports']) {
      expect(path.replace(new RegExp(proxy.src!), proxy.dest!)).toBe(`https://backend.example.com${path}`);
    }
    expect(proxy).not.toHaveProperty('methods');
    expect(config.routes[0].headers?.['Cache-Control']).toBe('no-store');
  });
  it('serves files before SPA and retains all existing deep-link families', () => {
    expect(config.routes[3]).toEqual({ handle: 'filesystem' });
    const route = new RegExp(config.routes[4].src!);
    for (const path of ['/', '/sign-in', '/sign-up', '/account', '/workspaces',
      ...['overview', 'planning', 'imports', 'forecasts', 'decisions', 'stress', 'briefs', 'members', 'settings', 'account', 'setup'].map(p => `/workspaces/w/${p}`)]) expect(route.test(path)).toBe(true);
    for (const path of ['/api/v1/missing', '/missing.js', '/.env']) expect(route.test(path)).toBe(false);
    expect(config.routes.at(-1)?.status).toBe(404);
  });
  it('does not serialize other environment variables or add cross-site credentials', () => {
    expect(JSON.stringify(config)).not.toMatch(/DATABASE_URL|GROQ_API_KEY|SESSION_SECRET|Access-Control-Allow-Origin/);
    expect(config.routes[2].headers?.['Content-Security-Policy']).toContain("script-src 'self'");
  });
});
