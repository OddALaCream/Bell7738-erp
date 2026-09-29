import { validateEnv } from './env.schema.js';

const baseEnv = {
  APP_BASE_URL: 'http://localhost:3000',
  WEB_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  REFRESH_TOKEN_HASH_SECRET: 'c'.repeat(32),
  STORAGE_ROOT: './uploads',
};

describe('validateEnv', () => {
  it.each(['forever', '-1s', '0s', '1ms'])(
    'rejects unusable token TTL %s at startup',
    (ttl) => {
      expect(() => validateEnv({ ...baseEnv, ACCESS_TOKEN_TTL: ttl })).toThrow(
        /ACCESS_TOKEN_TTL/,
      );
    },
  );
  it('accepts the minimal required set and applies defaults', () => {
    const env = validateEnv(baseEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.SMTP_HOST).toBeUndefined();
  });

  it('treats empty-string optional fields as unset instead of failing validation', () => {
    const env = validateEnv({
      ...baseEnv,
      SMTP_HOST: '',
      SMTP_PORT: '',
      SMTP_FROM: '',
      VAPID_PUBLIC_KEY: '',
    });
    expect(env.SMTP_HOST).toBeUndefined();
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined();
  });

  it('rejects a missing required field with a descriptive error', () => {
    const withoutDatabaseUrl = { ...baseEnv, DATABASE_URL: undefined };
    expect(() => validateEnv(withoutDatabaseUrl)).toThrow(/DATABASE_URL/);
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    expect(() =>
      validateEnv({ ...baseEnv, JWT_ACCESS_SECRET: 'too-short' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  describe('production invariants', () => {
    const prodEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      APP_BASE_URL: 'https://erp.example.com',
      WEB_ORIGIN: 'https://erp.example.com',
      COOKIE_SECURE: 'true',
    };

    it('accepts a fully compliant production config', () => {
      expect(() => validateEnv(prodEnv)).not.toThrow();
    });

    it('rejects an http:// APP_BASE_URL in production', () => {
      expect(() =>
        validateEnv({ ...prodEnv, APP_BASE_URL: 'http://erp.example.com' }),
      ).toThrow(/APP_BASE_URL/);
    });

    it('rejects COOKIE_SECURE=false in production', () => {
      expect(() => validateEnv({ ...prodEnv, COOKIE_SECURE: 'false' })).toThrow(
        /COOKIE_SECURE/,
      );
    });

    it('rejects reused secrets in production', () => {
      expect(() =>
        validateEnv({
          ...prodEnv,
          JWT_REFRESH_SECRET: prodEnv.JWT_ACCESS_SECRET,
        }),
      ).toThrow(/distinct/);
    });

    it('allows http:// and reused secrets outside production', () => {
      expect(() =>
        validateEnv({
          ...baseEnv,
          JWT_REFRESH_SECRET: baseEnv.JWT_ACCESS_SECRET,
        }),
      ).not.toThrow();
    });
  });
});
