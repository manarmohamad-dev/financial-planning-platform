import { afterEach, describe, expect, it, vi } from 'vitest';
import { OAuth2Client } from 'google-auth-library';
import { createGoogleVerifier } from '../apps/api/src/google-auth.js';
describe('Google ID-token verification contract', () => {
  afterEach(() => vi.restoreAllMocks());
  it('delegates signature, audience, issuer and expiry validation to the supported library', async () => {
    const verify = vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({ getPayload: () => ({ sub: 'stable-sub', email: 'Owner@Example.test', email_verified: true, nonce: 'bound-nonce' }) } as never);
    expect(await createGoogleVerifier('test-only-client')('credential', 'bound-nonce')).toMatchObject({ subject: 'stable-sub', email: 'owner@example.test' });
    expect(verify).toHaveBeenCalledWith({ idToken: 'credential', audience: 'test-only-client' });
  });
  it.each([
    { sub: 's', email: 'e@example.test', email_verified: true, nonce: 'wrong' },
    { sub: 's', email: 'e@example.test', email_verified: false, nonce: 'nonce' },
    { email: 'e@example.test', email_verified: true, nonce: 'nonce' },
  ])('rejects missing identity or mismatched browser nonce', async payload => {
    vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({ getPayload: () => payload } as never);
    await expect(createGoogleVerifier('test-only-client')('credential', 'nonce')).rejects.toMatchObject({ code: 'INVALID_GOOGLE_CREDENTIAL' });
  });
  it('fails closed on library verification errors', async () => {
    vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockRejectedValue(new Error('invalid signature/expired/audience'));
    await expect(createGoogleVerifier('test-only-client')('credential', 'nonce')).rejects.toMatchObject({ code: 'INVALID_GOOGLE_CREDENTIAL' });
  });
});
