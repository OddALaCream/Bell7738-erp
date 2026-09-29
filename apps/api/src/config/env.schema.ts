import { z } from 'zod';
import { EXTENSION_MIME_MAP } from '../storage/file-signatures.js';
import { durationToMs } from '../common/duration.js';

const DEFAULT_ALLOWED_EXTENSIONS = Object.keys(EXTENSION_MIME_MAP).join(',');
const tokenTtl = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    const milliseconds = durationToMs(value);
    return Number.isFinite(milliseconds) && milliseconds >= 1000;
  }, 'Token TTL must be a valid duration of at least one second.');

const booleanFromString = z
  .union([z.literal('true'), z.literal('false')])
  .transform((value) => value === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    APP_BASE_URL: z.url(),
    WEB_ORIGIN: z.url(),
    APP_TIME_ZONE: z.string().min(1).default('UTC'),

    DATABASE_URL: z.url(),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    REFRESH_TOKEN_HASH_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL: tokenTtl.default('15m'),
    REFRESH_TOKEN_TTL: tokenTtl.default('7d'),
    COOKIE_SECURE: booleanFromString.optional(),
    INVITATION_TTL_HOURS: z.coerce.number().int().positive().default(72),
    PROJECTS_ENDING_SOON_DAYS: z.coerce.number().int().positive().default(7),

    OWNER_EMAIL: z.email().optional(),
    OWNER_PASSWORD: z.string().min(12).optional(),
    OWNER_FIRST_NAME: z.string().min(1).optional(),
    OWNER_LAST_NAME: z.string().min(1).optional(),

    STORAGE_ROOT: z.string().min(1),
    MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(25 * 1024 * 1024),
    // docs/DEPLOYMENT.md "Storage": allowlist de tipos/extensiones en una
    // configuración validada. Comma-separated extensions (no leading dots).
    DOCUMENT_ALLOWED_EXTENSIONS: z
      .string()
      .min(1)
      .default(DEFAULT_ALLOWED_EXTENSIONS)
      .transform((value) =>
        value
          .split(',')
          .map((extension) => extension.trim().toLowerCase())
          .filter((extension) => extension.length > 0),
      )
      .pipe(
        z
          .array(
            z.enum(Object.keys(EXTENSION_MIME_MAP) as [string, ...string[]]),
          )
          .min(1),
      ),

    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_SECURE: booleanFromString.optional(),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.string().min(1).optional(),

    VAPID_PUBLIC_KEY: z.string().min(1).optional(),
    VAPID_PRIVATE_KEY: z.string().min(1).optional(),
    VAPID_SUBJECT: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    if (!env.APP_BASE_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_BASE_URL'],
        message: 'APP_BASE_URL must use https:// in production',
      });
    }
    if (!env.WEB_ORIGIN.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEB_ORIGIN'],
        message: 'WEB_ORIGIN must use https:// in production',
      });
    }
    if (env.COOKIE_SECURE === false) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE cannot be false in production',
      });
    }
    const secrets = [
      env.JWT_ACCESS_SECRET,
      env.JWT_REFRESH_SECRET,
      env.REFRESH_TOKEN_HASH_SECRET,
    ];
    if (new Set(secrets).size !== secrets.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message:
          'JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, and REFRESH_TOKEN_HASH_SECRET must all be distinct in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  // Empty strings in a .env file (e.g. `SMTP_HOST=`) mean "unset", not "set
  // to an empty value" — treat them as undefined so optional fields validate.
  const normalized = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      value === '' ? undefined : value,
    ]),
  );

  const result = envSchema.safeParse(normalized);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
