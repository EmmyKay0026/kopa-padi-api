import { isIP } from 'node:net';

export function smtpFallbackConfig(env = process.env) {
  if (env.SMTP_FALLBACK_ENABLED === undefined || env.SMTP_FALLBACK_ENABLED === 'false') return null;
  if (env.SMTP_FALLBACK_ENABLED !== 'true') throw new Error('SMTP_FALLBACK_ENABLED must be true or false');
  const host = env.SMTP_HOST?.trim();
  const port = Number(env.SMTP_PORT);
  const secure = env.SMTP_SECURE;
  if (!host || host.includes('://') || /[\s/@?#]/.test(host) || isIP(host)
    || !Number.isInteger(port) || port < 1 || port > 65535
    || !['true', 'false'].includes(secure ?? '') || !env.SMTP_USER?.trim() || !env.SMTP_PASSWORD) {
    throw new Error('SMTP fallback configuration is incomplete or invalid');
  }
  // Use a DNS hostname for normal TLS certificate identity verification.
  return { host, port, secure: secure === 'true', user: env.SMTP_USER, password: env.SMTP_PASSWORD };
}
