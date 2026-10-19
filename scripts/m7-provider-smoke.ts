/** Explicit opt-in SYNTHETIC smoke check, not a substitute for full M7 acceptance. */
import { readFileSync } from 'node:fs';
import { createGroqProvider, AiProviderError } from '../apps/api/src/ai-provider.js';
import { providerSchema } from '../packages/ai/src/model.js';
import { validateAiOutput, AiValidationError } from '../packages/ai/src/validation.js';
if (!process.argv.includes('--live-synthetic'))
  throw new Error('Explicit --live-synthetic required');
const line = readFileSync('.local/m7-provider.env', 'utf8')
  .split(/\r?\n/)
  .find((l) => /^\s*GROQ_API_KEY\s*=/.test(l));
const key = line
  ?.slice(line.indexOf('=') + 1)
  .trim()
  .replace(/^['"]|['"]$/g, '');
const provider = createGroqProvider({ enabled: true, key });
for (const locale of ['en', 'ar'] as const) {
  const text =
    locale === 'ar'
      ? 'عايزة أعين موظف جديد لكن لم أحدد الراتب أو الموعد.'
      : 'I want to hire someone but have not specified salary or start date.';
  try {
    const result = await provider({
      schema: providerSchema('scenario_extract', [], locale),
      instruction: `Return needs_clarification with questions in ${locale === 'ar' ? 'Arabic' : 'English'}. Never invent missing inputs. Do not propose changes yet; return empty changes and null unknown fields.`,
      context: text,
    });
    const value = validateAiOutput(
      'scenario_extract',
      result,
      { facts: {}, entries: {}, scopes: { company: { kind: 'company' } }, currency: 'EGP' },
      text,
      locale,
    );
    const passed = value.outcome === 'needs_clarification' && value.questions.length > 0;
    console.log(
      JSON.stringify({
        check: 'synthetic_scenario_clarification',
        locale,
        passed,
        questions: value.questions.map((q) => q.question),
      }),
    );
    if (!passed) process.exitCode = 1;
  } catch (error) {
    console.log(
      JSON.stringify({
        check: 'synthetic_scenario_clarification',
        locale,
        passed: false,
        code:
          error instanceof AiProviderError || error instanceof AiValidationError
            ? error.code
            : 'SANITIZED_FAILURE',
      }),
    );
    process.exitCode = 1;
  }
}
