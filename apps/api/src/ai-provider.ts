/** Server-only Groq transport. Never log request bodies, credentials or provider errors. */
export const AI_MODEL = 'openai/gpt-oss-120b';
export const AI_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export type AiDiagnostic = {
  stage:
    | 'provider_schema'
    | 'http'
    | 'network'
    | 'timeout'
    | 'envelope_json'
    | 'content_json'
    | 'finish'
    | 'response_limit'
    | 'missing_body';
  status?: number;
  finish?: 'length' | 'stop' | 'other';
};
export class AiProviderError extends Error {
  constructor(
    readonly code:
      | 'AI_UNAVAILABLE'
      | 'AI_RATE_LIMITED'
      | 'AI_TIMEOUT'
      | 'AI_PROVIDER_CONFIGURATION'
      | 'AI_PROVIDER_UNAVAILABLE'
      | 'AI_OUTPUT_INVALID',
    readonly retryAfter: number | null = null,
    readonly diagnostic?: AiDiagnostic,
  ) {
    super(code);
  }
}
export type AiProviderInput = {
  schema: Record<string, unknown>;
  instruction: string;
  context: string;
  signal?: AbortSignal;
};
export type AiProvider = (input: AiProviderInput) => Promise<unknown>;
export function createGroqProvider(options: {
  enabled: boolean;
  key?: string;
  timeoutMs?: number;
  transport?: typeof fetch;
  onDiagnostic?: (diagnostic: AiDiagnostic) => void;
}): AiProvider {
  return async ({ schema, instruction, context, signal }) => {
    if (!options.enabled || !options.key?.trim()) throw new AiProviderError('AI_UNAVAILABLE');
    if (context.length > 12000 || instruction.length > 8000)
      throw new AiProviderError('AI_OUTPUT_INVALID');
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 20000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let parseStage: 'envelope_json' | 'content_json' = 'envelope_json';
    try {
      const response = await (options.transport ?? fetch)(AI_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.key}`, 'Content-Type': 'application/json' },
        signal: combined,
        body: JSON.stringify({
          model: AI_MODEL,
          stream: false,
          temperature: 0,
          reasoning_effort: 'low',
          max_completion_tokens: 2000,
          messages: [
            { role: 'system', content: instruction },
            { role: 'user', content: context },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'm7_output', strict: true, schema },
          },
        }),
      });
      if (!response.ok) {
        let schemaFailure = false;
        if (response.status === 400 && response.body) {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = []; let bytes = 0;
          try {
            while (true) { const item = await reader.read(); if (item.done) break;
              bytes += item.value.byteLength;
              if (bytes > 16384) { await reader.cancel(); break; }
              chunks.push(item.value);
            }
            if (bytes <= 16384) {
              try { schemaFailure = JSON.parse(Buffer.concat(chunks).toString('utf8'))?.error?.code === 'json_validate_failed'; } catch { /* Bounded, sanitized classification only. */ }
            }
          } finally { reader.releaseLock(); }
        } else await response.body?.cancel();
        if (schemaFailure) throw new AiProviderError('AI_OUTPUT_INVALID', null, {stage:'provider_schema',status:400});
        if (response.status === 400) throw new AiProviderError('AI_PROVIDER_CONFIGURATION', null, {stage:'http',status:400});
        if (response.status === 429) {
          const raw = response.headers.get('retry-after');
          const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : null;
          throw new AiProviderError(
            'AI_RATE_LIMITED',
            seconds === null ? null : Math.min(seconds, 86400),
            { stage: 'http', status: response.status },
          );
        }
        if ([401, 403].includes(response.status))
          throw new AiProviderError('AI_PROVIDER_CONFIGURATION', null, {
            stage: 'http',
            status: response.status,
          });
        throw new AiProviderError('AI_PROVIDER_UNAVAILABLE', null, {
          stage: 'http',
          status: response.status,
        });
      }
      const reader = response.body?.getReader();
      if (!reader) throw new AiProviderError('AI_OUTPUT_INVALID', null, { stage: 'missing_body' });
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          length += next.value.byteLength;
          if (length > 65536) {
            await reader.cancel();
            throw new AiProviderError('AI_OUTPUT_INVALID', null, { stage: 'response_limit' });
          }
          chunks.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        choices?: { finish_reason?: string; message?: { content?: unknown; refusal?: unknown } }[];
      };
      const choice = envelope.choices?.[0];
      if (
        envelope.choices?.length !== 1 ||
        choice?.finish_reason !== 'stop' ||
        choice.message?.refusal ||
        typeof choice.message?.content !== 'string'
      )
        throw new AiProviderError('AI_OUTPUT_INVALID', null, {
          stage: 'finish',
          finish:
            choice?.finish_reason === 'length'
              ? 'length'
              : choice?.finish_reason === 'stop'
                ? 'stop'
                : 'other',
        });
      parseStage = 'content_json';
      return JSON.parse(choice.message.content) as unknown;
    } catch (error) {
      const failure =
        error instanceof AiProviderError
          ? error
          : combined.aborted
            ? new AiProviderError('AI_TIMEOUT', null, { stage: 'timeout' })
            : error instanceof SyntaxError
              ? new AiProviderError('AI_OUTPUT_INVALID', null, { stage: parseStage })
              : new AiProviderError('AI_PROVIDER_UNAVAILABLE', null, { stage: 'network' });
      if (failure.diagnostic) options.onDiagnostic?.(failure.diagnostic);
      throw failure;
    }
  };
}
