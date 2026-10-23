import { describe, expect, it } from 'vitest';
import { EmailFallbackError, EmailHttpError, SmtpDeliveryError, emailDeliveryDiagnostic, transportCode } from './email-errors.js';

describe('private email delivery diagnostics', () => {
  const sentinel = 'PRIVATE_PASSWORD_TOKEN_RECIPIENT_EMAIL_BODY';
  it('retains primary HTTP status and SMTP authentication failure without private data', () => {
    const raw = Object.assign(new Error(sentinel, { cause: new Error(sentinel) }), { code: 'EAUTH', responseCode: 535, response: sentinel, command: sentinel });
    const error = new EmailFallbackError(new EmailHttpError(401), new SmtpDeliveryError(raw, 'authenticate'));
    const diagnostic = emailDeliveryDiagnostic(error);
    expect(diagnostic.delivery).toEqual({ primary: { provider: 'zeptomail', http_status: 401 }, fallback: { provider: 'smtp', stage: 'authenticate', transport_code: 'EAUTH', smtp_status: 535 } });
    expect(JSON.stringify({ error, diagnostic })).not.toContain(sentinel);
    expect(error).not.toHaveProperty('cause');
  });
  it('extracts only approved nested network codes', () => {
    const raw = new Error(sentinel, { cause: Object.assign(new Error(sentinel), { code: 'ENOTFOUND', address: sentinel }) });
    expect(emailDeliveryDiagnostic(raw).delivery).toEqual({ transport_code: 'ENOTFOUND' });
    expect(JSON.stringify(emailDeliveryDiagnostic(raw))).not.toContain(sentinel);
  });
  it('keeps deadline failures diagnostic without an original SMTP error', () => {
    expect(emailDeliveryDiagnostic(new SmtpDeliveryError(new Error(sentinel), 'connect', true)).delivery).toEqual({ provider: 'smtp', stage: 'connect', transport_code: 'ETIMEDOUT' });
  });
  it('does not invoke getters or serialize arbitrary codes and server replies', () => {
    const error = { get code() { throw new Error(sentinel); }, get cause() { throw new Error(sentinel); }, responseCode: sentinel };
    expect(transportCode(error)).toBe('UNKNOWN');
    expect(JSON.stringify(emailDeliveryDiagnostic(new SmtpDeliveryError(error, 'send')))).not.toContain(sentinel);
    expect(transportCode({ code: sentinel })).toBe('UNKNOWN');
  });
  it('bounds cyclic error traversal', () => {
    const error: any = { code: sentinel }; error.cause = error;
    expect(transportCode(error)).toBe('UNKNOWN');
  });
});
