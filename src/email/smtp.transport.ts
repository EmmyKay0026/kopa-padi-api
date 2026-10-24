import nodemailer from 'nodemailer';
import SMTPConnection from 'nodemailer/lib/smtp-connection';
import type { EmailMessage } from './email.service.js';
import { renderEmail } from './email.template.js';
import { smtpFallbackConfig } from './smtp-config.js';
import { SmtpDeliveryError, type SmtpStage } from './email-errors.js';

export async function sendSmtpFallback(message: EmailMessage, remainingMs: number) {
  let connection: SMTPConnection | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  let stage: SmtpStage = 'configuration';
  const ensureLive = () => { if (expired) throw new Error(); };
  const close = () => { try { connection?.close(); } catch { /* No raw diagnostics. */ } };
  try {
    const config = smtpFallbackConfig();
    if (!config || remainingMs < 1) throw new Error();
    connection = new SMTPConnection({
      host: config.host, port: config.port, secure: config.secure,
      requireTLS: !config.secure, ignoreTLS: false,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: config.host },
      logger: false, debug: false, transactionLog: false,
      connectionTimeout: remainingMs, greetingTimeout: remainingMs,
      socketTimeout: remainingMs, dnsTimeout: remainingMs,
    });
    // Connection failures can arrive as events rather than callbacks. Reject
    // promptly without letting EventEmitter print raw SMTP diagnostics.
    let rejectConnection: (error: unknown) => void = () => {};
    const connectionFailure = new Promise<never>((_, reject) => { rejectConnection = reject; });
    connection.on('error', error => rejectConnection(error));
    const smtp = connection;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired = true; close(); reject(new Error()); }, remainingMs);
    });
    const delivery = (async () => {
      stage = 'compose';
      // Compose MIME in memory; attachments cannot fetch files or URLs.
      const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows', disableFileAccess: true, disableUrlAccess: true });
      const rendered = renderEmail(message);
      const sender = process.env.ZEPTO_MAIL_FROM_ADDRESS ?? '';
      const mime = await composer.sendMail({
        from: { address: sender, name: process.env.ZEPTO_MAIL_FROM_NAME ?? 'Kopa Padi' },
        to: [{ address: message.to }], subject: message.subject,
        text: rendered.text, html: rendered.html, disableFileAccess: true, disableUrlAccess: true,
      });
      ensureLive();
      stage = 'connect';
      await new Promise<void>((resolve, reject) => smtp.connect(error => error ? reject(error) : resolve()));
      ensureLive();
      stage = 'authenticate';
      await new Promise<void>((resolve, reject) => smtp.login({ user: config.user, pass: config.password }, error => error ? reject(error) : resolve()));
      ensureLive();
      stage = 'send';
      return new Promise<{ accepted: string[]; rejected: string[] }>((resolve, reject) => {
        smtp.send({ from: sender, to: [message.to] }, mime.message, (error, result) => error ? reject(error) : resolve(result));
      });
    })();
    const result = await Promise.race([delivery, deadline, connectionFailure]);
    if (!result.accepted?.length || result.rejected?.length) throw new Error();
  } catch (error) {
    throw new SmtpDeliveryError(error, stage, expired);
  } finally {
    expired = true;
    if (timer) clearTimeout(timer);
    close();
  }
}
