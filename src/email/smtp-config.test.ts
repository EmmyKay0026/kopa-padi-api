import { describe, expect, it } from 'vitest';
import { smtpFallbackConfig } from './smtp-config.js';

const configured = { SMTP_FALLBACK_ENABLED: 'true', SMTP_HOST: 'smtp.p2.invalid', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'synthetic', SMTP_PASSWORD: 'synthetic-only' };
describe('SMTP fallback configuration', () => {
  it('is off unless explicitly enabled', () => {
    expect(smtpFallbackConfig({})).toBeNull();
    expect(smtpFallbackConfig({ SMTP_FALLBACK_ENABLED: 'false' })).toBeNull();
  });
  it('requires explicit host, port, TLS mode and credentials', () => {
    for (const field of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD']) {
      expect(() => smtpFallbackConfig({ ...configured, [field]: '' })).toThrow('SMTP fallback configuration');
    }
    for (const host of ['smtp://smtp.p2.invalid', '127.0.0.1', 'user@smtp.p2.invalid', 'smtp.p2.invalid/path']) {
      expect(() => smtpFallbackConfig({ ...configured, SMTP_HOST: host })).toThrow();
    }
    expect(() => smtpFallbackConfig({ ...configured, SMTP_FALLBACK_ENABLED: 'yes' })).toThrow();
    expect(() => smtpFallbackConfig({ ...configured, SMTP_PORT: '65536' })).toThrow();
  });
  it('supports verified STARTTLS and implicit TLS modes', () => {
    expect(smtpFallbackConfig(configured)?.secure).toBe(false);
    expect(smtpFallbackConfig({ ...configured, SMTP_PORT: '465', SMTP_SECURE: 'true' })?.secure).toBe(true);
  });
});
