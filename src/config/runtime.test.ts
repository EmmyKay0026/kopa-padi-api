import { afterEach, describe, expect, it } from 'vitest';
import { enabled, validateEnvironment } from './runtime.js';

const validProduction = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:private@db.internal/kopa_padi',
  DATABASE_SSL: 'true',
  BETTER_AUTH_SECRET: 'a-production-secret-with-at-least-32-characters',
  BETTER_AUTH_URL: 'https://api.kopapadi.test',
  WEB_URL: 'https://kopapadi.test',
  ZEPTO_MAIL_API_KEY: 'provider-key',
  ZEPTO_MAIL_FROM_ADDRESS: 'hello@kopapadi.test',
  PRIVATE_UPLOAD_ROOT: '/srv/kopa-padi-private',
};

describe('production environment validation', () => {
  it('accepts a complete secure production configuration', () => {
    expect(validateEnvironment(validProduction)).toEqual({ production: true });
  });

  it('fails fast when critical values are absent', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      /Missing required production configuration/,
    );
  });

  it('rejects weak secrets, HTTP origins, and non-TLS database configuration', () => {
    expect(() => validateEnvironment({ ...validProduction, BETTER_AUTH_SECRET: 'changeme' })).toThrow(/insecure/);
    expect(() => validateEnvironment({ ...validProduction, WEB_URL: 'http://kopapadi.test' })).toThrow(/HTTPS/);
    expect(() => validateEnvironment({ ...validProduction, DATABASE_SSL: 'false' })).toThrow(/DATABASE_SSL/);
  });
});

describe('feature flags', () => {
  afterEach(() => delete process.env.PHASE9_TEST_FLAG);

  it('uses the supplied default and only enables an explicit true value', () => {
    expect(enabled('PHASE9_TEST_FLAG', false)).toBe(false);
    process.env.PHASE9_TEST_FLAG = 'TRUE';
    expect(enabled('PHASE9_TEST_FLAG', false)).toBe(true);
    process.env.PHASE9_TEST_FLAG = 'false';
    expect(enabled('PHASE9_TEST_FLAG')).toBe(false);
  });
});
