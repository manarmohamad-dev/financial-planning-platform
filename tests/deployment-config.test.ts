import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readConfig } from '../apps/api/src/config.js';

const env = {
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://example.invalid',
  DATABASE_URL: 'postgresql://localhost/unused',
  SESSION_SECRET: 'synthetic-deployment-test-only-'.repeat(2),
};

describe('optional deployment listener address', () => {
  it('preserves unspecified-host behavior and security defaults', () => {
    const config = readConfig(env);
    expect(config.BIND_HOST).toBeUndefined();
    expect(config.TRUST_PROXY_HOPS).toBe(0);
    expect(config.AI_ENABLED).toBe(false);
    expect(config.PORT).toBe(3000);
  });
  it.each(['127.0.0.1', '::1', '::'])('accepts assigned IP %s', (host) => {
    expect(readConfig({ ...env, BIND_HOST: host }).BIND_HOST).toBe(host);
  });
  it.each(['', 'localhost', 'https://example.invalid', '127.0.0.1:3000'])('rejects invalid address %s', (host) => {
    expect(() => readConfig({ ...env, BIND_HOST: host })).toThrow();
  });
  it('binds an actual socket to the configured address without a database', async () => {
    const config = readConfig({ ...env, BIND_HOST: '127.0.0.1' });
    const server = createServer();
    server.listen({ port: 0, host: config.BIND_HOST });
    try {
      await once(server, 'listening');
      expect(server.address()).toMatchObject({ address: '127.0.0.1' });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
