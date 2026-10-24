import { createServer, type Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ port: 0 }));
// Avoid DNS and guarantee every test connection stays on loopback. Production
// hostname validation is exercised separately by smtp-config.test.ts.
vi.mock('./smtp-config.js', () => ({ smtpFallbackConfig: () => ({
  host: '127.0.0.1', port: fixture.port, secure: false,
  user: 'synthetic-local-only', password: 'synthetic-local-only',
}) }));
import { sendSmtpFallback } from './smtp.transport.js';

afterEach(() => vi.unstubAllEnvs());
describe('real loopback SMTP boundary (no email delivery)', () => {
  it.each([false, true])('rejects absent STARTTLS or a hung greeting (hung=%s)', async hung => {
    const sockets = new Set<Socket>(); const commands: string[] = [];
    const server = createServer(socket => {
      sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
      if (hung) return;
      socket.write('220 synthetic localhost sink\r\n');
      let input = '';
      socket.on('data', chunk => {
        input += chunk.toString();
        while (input.includes('\r\n')) {
          const index = input.indexOf('\r\n'), line = input.slice(0, index); input = input.slice(index + 2);
          commands.push(line.split(' ')[0]);
          if (line.startsWith('EHLO')) socket.write('250-synthetic sink\r\n250 AUTH PLAIN\r\n');
          else if (line === 'STARTTLS') socket.write('454 TLS unavailable SENTINEL_PRIVATE_REPLY\r\n');
        }
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Local sink unavailable');
    fixture.port = address.port;
    vi.stubEnv('SMTP_FALLBACK_ENABLED', 'true'); vi.stubEnv('SMTP_HOST', 'localhost');
    vi.stubEnv('SMTP_PORT', String(address.port)); vi.stubEnv('SMTP_SECURE', 'false');
    vi.stubEnv('SMTP_USER', 'synthetic-local-only'); vi.stubEnv('SMTP_PASSWORD', 'synthetic-local-only');
    vi.stubEnv('ZEPTO_MAIL_FROM_ADDRESS', 'sender@p2.invalid');
    try {
      const error = await sendSmtpFallback({ to: 'sink@p2.invalid', intent: 'PASSWORD_RESET', subject: 'Synthetic', text: 'Synthetic' }, 500).catch(error => error);
      expect(error.message).toBe('SMTP fallback did not accept the request'); expect(error.stack).not.toContain('SENTINEL');
      await vi.waitFor(() => expect(sockets.size).toBe(0), { timeout: 1500 });
      if (!hung) expect(commands).toContain('EHLO');
      expect(commands).not.toContain('AUTH'); expect(commands).not.toContain('MAIL'); expect(commands).not.toContain('DATA');
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
