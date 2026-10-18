import { z } from 'zod';
import { readSecret } from './common/secrets';

/**
 * Every setting the API reads, checked once at start-up so a bad deploy fails fast with a
 * clear message instead of misbehaving later. Secrets may come from Docker secrets (NAME_FILE).
 */
const Env = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    MONGO_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// URL')
      .optional(),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    /** Base URL of sign-in links, e.g. https://rigtracker.bhbslp.org */
    APP_URL: z.url().optional(),
    /** The built web app to serve from the same origin (the container sets it). */
    WEB_DIST: z.string().optional(),
    UPLOADS_DIR: z.string().optional(),
    RIGTRACKER_CORS_ORIGIN: z.string().optional(),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).optional(),
    /** The release and commit, set at image build time: 2.0.0-alpha.2+abc1234 */
    APP_VERSION: z.string().default('dev'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.MONGO_URI)
      ctx.addIssue({
        code: 'custom',
        path: ['MONGO_URI'],
        message: 'required in production (or MONGO_URI_FILE)',
      });
    if (!env.APP_URL)
      ctx.addIssue({ code: 'custom', path: ['APP_URL'], message: 'required in production' });
  });

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = Env.safeParse({ ...env, MONGO_URI: readSecret('MONGO_URI') });
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
