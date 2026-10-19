import { z } from 'zod';
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    BIND_HOST: z.union([z.ipv4(), z.ipv6()]).optional(),
    APP_ORIGIN: z.url(),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
    SESSION_SECRET: z
      .string()
      .min(32)
      .refine((v) => !v.startsWith('replace-with'), 'Replace example secret'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
    AI_ENABLED: z.enum(['true','false']).default('false').transform(v=>v==='true'),
    GROQ_API_KEY: z.string().optional(),
    AI_MODEL: z.literal('openai/gpt-oss-120b').default('openai/gpt-oss-120b'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(20000),
  })
  .superRefine((v, ctx) => {
    if (new URL(v.APP_ORIGIN).origin !== v.APP_ORIGIN)
      ctx.addIssue({ code: 'custom', message: 'APP_ORIGIN must be an origin without a path' });
    if (v.NODE_ENV === 'production' && !v.APP_ORIGIN.startsWith('https://'))
      ctx.addIssue({ code: 'custom', message: 'Production requires HTTPS' });
  });
export type Config = z.infer<typeof envSchema>;
export function readConfig(env: NodeJS.ProcessEnv): Config {
  return envSchema.parse(env);
}
