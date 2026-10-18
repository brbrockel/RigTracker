import { z } from 'zod';
import { readSecret } from './common/secrets.js';

/** The local development database (`pnpm dev:services`). */
export const DEV_DATABASE_URL = 'postgres://rigtracker:rigtracker@127.0.0.1:15433/rigtracker';

/** 32+ bytes of key material, as hex (64+ characters) or base64. */
function isStrongSecret(value: string): boolean {
  if (/^[0-9a-f]+$/i.test(value)) return value.length >= 64;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) return false;
  return Buffer.from(value, 'base64').length >= 32;
}

/**
 * Every setting the API reads, checked once at start-up so a bad deploy fails fast with a
 * clear message instead of misbehaving later. Secrets may come from Docker secrets (NAME_FILE).
 */
const Env = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL')
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
    /**
     * "Report a problem" files a GitHub issue with this token (GITHUB_TOKEN_FILE in production:
     * a fine-grained token limited to Issues on GITHUB_ISSUES_REPO). Without it, reports are
     * only kept in the app.
     */
    GITHUB_TOKEN: z.string().min(20).optional(),
    GITHUB_ISSUES_REPO: z
      .string()
      .regex(/^[\w.-]+\/[\w.-]+$/)
      .default('brbrockel/RigTracker'),
    /** The release and commit, set at image build time: 2.0.0-alpha.2+abc1234 */
    APP_VERSION: z.string().default('dev'),
    /**
     * Encrypts authenticator-app secrets at rest (AES-256-GCM): 32+ random bytes as hex or
     * base64, e.g. `openssl rand -hex 32`. A Docker secret in production (APP_SECRET_FILE).
     * Without it (development only), authenticator codes can't be turned on.
     */
    APP_SECRET: z
      .string()
      .refine(isStrongSecret, 'must be 32+ random bytes as hex or base64 (openssl rand -hex 32)')
      .optional(),
    /**
     * Outbound email guard (TeeMate's): 'off' (default) sends nothing; 'allowlist' sends only
     * to MAIL_ALLOWLIST; 'all' sends to anyone and needs the owner's consent.
     */
    MAIL_MODE: z.enum(['off', 'allowlist', 'all']).default('off'),
    /** Comma-separated addresses or *@domain patterns allowed in 'allowlist' mode. */
    MAIL_ALLOWLIST: z.string().default(''),
    MAIL_FROM: z.string().default('RigTracker <rigtracker@localhost>'),
    /** The SMTP server, once email is approved. Not set in the stack yet. */
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z
      .enum(['true', 'false', '1', '0'])
      .transform((v) => v === 'true' || v === '1')
      .default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.DATABASE_URL)
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'required in production (or DATABASE_URL_FILE)',
      });
    if (!env.APP_URL)
      ctx.addIssue({ code: 'custom', path: ['APP_URL'], message: 'required in production' });
    if (!env.APP_SECRET)
      ctx.addIssue({
        code: 'custom',
        path: ['APP_SECRET'],
        message: 'required in production (or APP_SECRET_FILE)',
      });
  })
  .transform((env) => ({ ...env, DATABASE_URL: env.DATABASE_URL ?? DEV_DATABASE_URL }));

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = Env.safeParse({
    ...env,
    DATABASE_URL: readSecret('DATABASE_URL', env),
    APP_SECRET: readSecret('APP_SECRET', env),
    SMTP_PASSWORD: readSecret('SMTP_PASSWORD', env),
    GITHUB_TOKEN: readSecret('GITHUB_TOKEN', env),
  });
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}

let cached: Config | undefined;
/** The configuration, read once (services use this; main.ts checks it at start-up). */
export function config(): Config {
  return (cached ??= loadConfig());
}
