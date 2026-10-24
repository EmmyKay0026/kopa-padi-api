import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ connection: vi.fn(), compose: vi.fn(), connect: vi.fn(), login: vi.fn(), send: vi.fn(), close: vi.fn(), on: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.compose } }));
vi.mock('nodemailer/lib/smtp-connection', () => ({ default: mocks.connection }));
import { sendSmtpFallback } from './smtp.transport.js';
import type { EmailMessage } from './email.service.js';
const message: EmailMessage = { to: 'sink@p2.invalid', intent: 'PASSWORD_RESET', subject: 'Synthetic', text: 'Synthetic' };
beforeEach(() => {
  vi.stubEnv('SMTP_FALLBACK_ENABLED', 'true'); vi.stubEnv('SMTP_HOST', 'smtp.p2.invalid');
  vi.stubEnv('SMTP_PORT', '587'); vi.stubEnv('SMTP_SECURE', 'false');
  vi.stubEnv('SMTP_USER', 'SENTINEL_SMTP_USER'); vi.stubEnv('SMTP_PASSWORD', 'SENTINEL_SMTP_PASSWORD');
  vi.stubEnv('ZEPTO_MAIL_FROM_ADDRESS', 'sender@p2.invalid');
  mocks.connection.mockImplementation(function () { return { connect: mocks.connect, login: mocks.login, send: mocks.send, close: mocks.close, on: mocks.on }; });
  mocks.compose.mockReturnValue({ sendMail: vi.fn(async () => ({ message: Buffer.from('Synthetic MIME') })) });
  mocks.connect.mockImplementation(cb => cb(null)); mocks.login.mockImplementation((_auth, cb) => cb(null));
  mocks.send.mockImplementation((_envelope, _message, cb) => cb(null, { accepted: [message.to], rejected: [] }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); vi.useRealTimers(); mocks.close.mockReset(); });
describe('private bounded SMTP transport', () => {
  it('requires verified STARTTLS and disables wire logging and content access', async () => {
    await sendSmtpFallback(message, 250);
    expect(mocks.connection).toHaveBeenCalledWith(expect.objectContaining({
      requireTLS: true, ignoreTLS: false, secure: false, logger: false, debug: false, transactionLog: false,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: 'smtp.p2.invalid' },
      connectionTimeout: 250, greetingTimeout: 250, socketTimeout: 250, dnsTimeout: 250,
    }));
    expect(mocks.compose).toHaveBeenCalledWith(expect.objectContaining({ streamTransport: true, buffer: true, disableFileAccess: true, disableUrlAccess: true }));
    expect(mocks.send).toHaveBeenCalledWith({ from: 'sender@p2.invalid', to: [message.to] }, expect.any(Buffer), expect.any(Function));
    expect(mocks.close).toHaveBeenCalled();
  });
  it('supports implicit TLS without certificate bypass', async () => {
    vi.stubEnv('SMTP_SECURE', 'true'); vi.stubEnv('SMTP_PORT', '465');
    await sendSmtpFallback(message, 250);
    expect(mocks.connection).toHaveBeenCalledWith(expect.objectContaining({ secure: true, tls: expect.objectContaining({ rejectUnauthorized: true }) }));
  });
  it('requires SMTP acceptance before reporting success', async () => {
    mocks.send.mockImplementation((_envelope, _message, cb) => cb(null, { accepted: [], rejected: [message.to] }));
    await expect(sendSmtpFallback(message, 250)).rejects.toThrow('SMTP fallback did not accept the request');
  });
  it('redacts server errors, nested causes and cleanup errors', async () => {
    mocks.send.mockImplementation((_envelope, _message, cb) => cb(new Error('SENTINEL_PRIVATE_REPLY', { cause: new Error('SENTINEL_SMTP_PASSWORD') })));
    mocks.close.mockImplementation(() => { throw new Error('SENTINEL_SMTP_CLOSE'); });
    const error = await sendSmtpFallback(message, 250).catch(error => error);
    expect(error.message).toBe('SMTP fallback did not accept the request'); expect(error.cause).toBeUndefined(); expect(error.stack).not.toContain('SENTINEL');
  });
  it('closes the connection at the deadline and forbids late sending', async () => {
    vi.useFakeTimers(); let finishLogin: ((error: Error | null) => void) | undefined;
    mocks.login.mockImplementation((_auth, cb) => { finishLogin = cb; });
    const result = sendSmtpFallback(message, 100).catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    expect((await result).message).toBe('SMTP fallback did not accept the request'); expect(mocks.close).toHaveBeenCalled();
    finishLogin?.(null); await vi.runAllTimersAsync(); expect(mocks.send).not.toHaveBeenCalled();
  });
});
