import { describe, it, expect, vi } from 'vitest';
import { createGroqProvider, AI_ENDPOINT, AI_MODEL } from '../apps/api/src/ai-provider.js';

const input = {
  schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  instruction: 'Return only the requested object.',
  context: 'Synthetic test.',
};
const success = () =>
  Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{}' } }] });
describe('M7 server-only provider transport', () => {
  it('does not call provider when disabled or without key', async () => {
    const transport = vi.fn();
    for (const options of [{ enabled: false, key: 'test' }, { enabled: true }])
      await expect(createGroqProvider({ ...options, transport })(input)).rejects.toMatchObject({
        code: 'AI_UNAVAILABLE',
      });
    expect(transport).not.toHaveBeenCalled();
  });
  it('uses the approved endpoint, strict schema, bounded nonstreaming output and no tools', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(success());
    expect(
      await createGroqProvider({ enabled: true, key: 'synthetic-test-key', transport })(input),
    ).toEqual({});
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe(AI_ENDPOINT);
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe(AI_MODEL);
    expect(body.stream).toBe(false);
    expect(body.max_completion_tokens).toBe(2000);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.tools).toBeUndefined();
  });
  it.each([
    [401, 'AI_PROVIDER_CONFIGURATION'],
    [403, 'AI_PROVIDER_CONFIGURATION'],
    [429, 'AI_RATE_LIMITED'],
    [500, 'AI_PROVIDER_UNAVAILABLE'],
  ])('sanitizes HTTP %s without retry', async (status, code) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('sensitive provider body', {
          status: Number(status),
          headers: { 'retry-after': '7' },
        }),
      );
    await expect(
      createGroqProvider({ enabled: true, key: 'test', transport })(input),
    ).rejects.toMatchObject({ code, message: code });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    'not json',
    JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }),
    JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'not json' } }] }),
    'x'.repeat(65537),
  ])('rejects malformed, truncated or oversized response', async (body) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    await expect(
      createGroqProvider({ enabled: true, key: 'test', transport })(input),
    ).rejects.toMatchObject({ code: 'AI_OUTPUT_INVALID' });
  });
  it('sanitizes network errors', async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error('secret details'));
    await expect(
      createGroqProvider({ enabled: true, key: 'test', transport })(input),
    ).rejects.toMatchObject({ message: 'AI_PROVIDER_UNAVAILABLE' });
  });
  it('propagates cancellation as a bounded failure', async () => {
    const transport: typeof fetch = async (_url, init) => {
      init?.signal?.throwIfAborted();
      return success();
    };
    await expect(
      createGroqProvider({ enabled: true, key: 'test', transport })({
        ...input,
        signal: AbortSignal.abort(),
      }),
    ).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
  });
});
