import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ smtp: vi.fn() }));
vi.mock('../db/database.js', () => ({ db: {} }));
vi.mock('./smtp.transport.js', () => ({ sendSmtpFallback: mocks.smtp }));
import { sendEmail } from './email.service.js';
const message = { to: 'sink@p2.invalid', intent: 'ACCOUNT_VERIFICATION' as const, subject: 'Synthetic', text: 'Synthetic' };
beforeEach(() => {
  vi.stubEnv('ZEPTO_MAIL_API_KEY', 'synthetic-only'); vi.stubEnv('SMTP_FALLBACK_ENABLED', 'true');
  vi.stubEnv('SMTP_HOST', 'smtp.p2.invalid'); vi.stubEnv('SMTP_PORT', '587');
  vi.stubEnv('SMTP_SECURE', 'false'); vi.stubEnv('SMTP_USER', 'synthetic'); vi.stubEnv('SMTP_PASSWORD', 'synthetic-only');
  mocks.smtp.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('Zepto-first email fallback', () => {
  it('never sends a second email after primary acceptance', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await sendEmail(message); expect(mocks.smtp).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500, 502, 503])('falls back once on explicit HTTP %s rejection', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('PRIVATE_PROVIDER_REPLY', { status })));
    await sendEmail(message);
    expect(mocks.smtp).toHaveBeenCalledTimes(1);
    expect(mocks.smtp).toHaveBeenCalledWith(message, expect.any(Number));
    expect(mocks.smtp.mock.calls[0][1]).toBeGreaterThan(0);
    expect(mocks.smtp.mock.calls[0][1]).toBeLessThanOrEqual(10000);
  });
  it('is disabled by default even if SMTP credentials happen to exist', async () => {
    vi.stubEnv('SMTP_FALLBACK_ENABLED', undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(sendEmail(message)).rejects.toThrow('Email provider did not accept the request');
    expect(mocks.smtp).not.toHaveBeenCalled();
  });
  it.each([408, 504])('does not duplicate on ambiguous HTTP %s timeout', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })));
    await expect(sendEmail(message)).rejects.toThrow(); expect(mocks.smtp).not.toHaveBeenCalled();
  });
  it('does not immediately duplicate after network/abort failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('SENTINEL_AMBIGUOUS_TIMEOUT'); }));
    await expect(sendEmail(message)).rejects.toThrow(); expect(mocks.smtp).not.toHaveBeenCalled();
  });
  it('retains failure when the fallback rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    mocks.smtp.mockRejectedValue(new Error('SMTP fallback did not accept the request'));
    await expect(sendEmail(message)).rejects.toThrow('SMTP fallback did not accept the request');
  });
  it('does not begin fallback when the shared time budget is exhausted', async () => {
    vi.stubEnv('ZEPTO_MAIL_TIMEOUT_MS', '100');
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(101);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    try { await expect(sendEmail(message)).rejects.toThrow(); expect(mocks.smtp).not.toHaveBeenCalled(); }
    finally { vi.restoreAllMocks(); }
  });
});
