import { safeDiagnostic } from '../common/safe-errors.js';
import { Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../db/database.js';
import { notificationOutbox, journeyShares, journeys, trustedContacts } from '../db/schema.js';
import { renderEmail } from './email.template.js';

export type EmailIntent = 'ACCOUNT_VERIFICATION' | 'PASSWORD_RESET' | 'PCM_SUBMITTED' | 'PCM_APPROVED' | 'PCM_REJECTED' | 'PCM_RESUBMISSION_REQUIRED' | 'JOURNEY_SAFETY';
export interface EmailMessage { to: string; intent: EmailIntent; subject: string; text: string; userId?: string; title?: string; preheader?: string; recipientName?: string; actionUrl?: string; actionLabel?: string; details?: Array<{ label: string; value: string }>; safety?: { journeyId: string; shareId: string; contactId: string } }
const deliveryLogger = new Logger('EmailDelivery');
export const MAX_EMAIL_ATTEMPTS = 5;
export function validQueuedEmail(payload: unknown): payload is EmailMessage {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as EmailMessage;
  return typeof p.to === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.to) && typeof p.subject === 'string' && !!p.subject && typeof p.text === 'string' && !!p.text;
}
export function mailTimeoutMs() {
  const n = Number(process.env.ZEPTO_MAIL_TIMEOUT_MS ?? 10000);
  return Number.isFinite(n) ? Math.max(100, Math.min(30000, n)) : 10000;
}
export async function sendZeptoMail(message: EmailMessage): Promise<void> {
  if (!process.env.ZEPTO_MAIL_API_KEY) throw new Error('Email delivery is not configured');
  const rendered = renderEmail(message);
  const response = await fetch(process.env.ZEPTO_MAIL_API_URL ?? 'https://api.zeptomail.com/v1.1/email', {
    method: 'POST', signal: AbortSignal.timeout(mailTimeoutMs()),
    headers: { Authorization: `Zoho-enczapikey ${process.env.ZEPTO_MAIL_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: { address: process.env.ZEPTO_MAIL_FROM_ADDRESS, name: process.env.ZEPTO_MAIL_FROM_NAME ?? 'Kopa Padi' }, to: [{ email_address: { address: message.to } }], subject: message.subject, textbody: rendered.text, htmlbody: rendered.html }),
  });
  // Never read/store provider bodies, which can repeat private input.
  await response.body?.cancel();
  if (!response.ok) throw new Error('Email provider did not accept the request');
}

// Immediate and retry delivery use the SAME row lock. The bounded provider call
// runs while the claim is held. A crash releases the transaction for retry;
// a provider acceptance before commit can still be delivered twice externally.
export async function deliverQueuedEmail(outboxId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(notificationOutbox).where(and(eq(notificationOutbox.id, outboxId), isNull(notificationOutbox.sentAt), lt(sql<number>`${notificationOutbox.attempts}::int`, MAX_EMAIL_ATTEMPTS))).for('update', { skipLocked: true });
    if (!row) return 'skipped';
    const payload = row.payload as unknown;
    const finish = async (reason: string) => { await tx.update(notificationOutbox).set({ attempts: String(MAX_EMAIL_ATTEMPTS), lastError: reason }).where(eq(notificationOutbox.id, row.id)); return 'cancelled'; };
    if (!validQueuedEmail(payload)) return finish('invalid_payload');
    if (row.type === 'JOURNEY_SAFETY') {
      const safety = payload.safety;
      if (!safety || ![safety.journeyId, safety.shareId, safety.contactId].every(v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))) return finish('invalid_safety_consent');
      // Lock consent/contact rows until this provider attempt finishes. Withdrawal
      // or deletion waits for an already-started bounded send, and prevents later sends.
      const [recipient] = await tx.select({ contact: trustedContacts }).from(journeyShares)
        .innerJoin(trustedContacts, eq(trustedContacts.id, journeyShares.trustedContactId))
        .innerJoin(journeys, eq(journeys.id, journeyShares.journeyId))
        .where(and(eq(journeyShares.id, safety.shareId), eq(journeyShares.journeyId, safety.journeyId), eq(trustedContacts.id, safety.contactId), eq(journeys.userId, row.userId), eq(trustedContacts.userId, row.userId), eq(trustedContacts.isActive, true), eq(journeyShares.status, 'ACTIVE'), gt(journeyShares.expiresAt, new Date()))).for('update');
      if (!recipient || recipient.contact.email !== payload.to) return finish('recipient_consent_cancelled');
    }
    const attempts = Number(row.attempts) + 1;
    try {
      await sendZeptoMail({ ...payload, intent: row.type as EmailIntent });
      await tx.update(notificationOutbox).set({ sentAt: new Date(), attempts: String(attempts), lastError: null }).where(eq(notificationOutbox.id, row.id));
      return 'accepted';
    } catch (error) {
      await tx.update(notificationOutbox).set({ attempts: String(attempts), lastError: JSON.stringify(safeDiagnostic('email_delivery_failed', error)) }).where(eq(notificationOutbox.id, row.id));
      deliveryLogger.error(safeDiagnostic('email_delivery_failed', error));
      return 'failed';
    }
  });
}
export async function retryQueuedEmails(limit = 25) {
  const rows = await db.select({ id: notificationOutbox.id }).from(notificationOutbox).where(and(isNull(notificationOutbox.sentAt), lt(sql<number>`${notificationOutbox.attempts}::int`, MAX_EMAIL_ATTEMPTS))).orderBy(notificationOutbox.createdAt).limit(limit);
  let sent = 0, failed = 0, cancelled = 0;
  for (const row of rows) {
    const outcome = await deliverQueuedEmail(row.id);
    if (outcome === 'accepted') sent++;
    if (outcome === 'failed') failed++;
    if (outcome === 'cancelled') cancelled++;
  }
  return { checked: rows.length, sent, failed, cancelled };
}
// Can be called in a caller's transaction. No provider I/O before commit.
export async function enqueueEmail(message: EmailMessage & { userId: string }, executor: any = db) {
  const [row] = await executor.insert(notificationOutbox).values({ userId: message.userId, type: message.intent, payload: { ...message } }).returning({ id: notificationOutbox.id });
  return row.id as string;
}
export async function queueEmail(message: EmailMessage & { userId: string }): Promise<void> {
  const id = await enqueueEmail(message);
  await deliverQueuedEmail(id);
}
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  async send(message: EmailMessage) { await sendZeptoMail(message); }
  async dispatch(message: EmailMessage) {
    if (!message.userId) { this.logger.error(safeDiagnostic('email_missing_user')); return; }
    // API callers await persistence and the same bounded delivery path. Safety
    // reminder workers instead enqueue transactionally and never fire-and-forget.
    try { await queueEmail({ ...message, userId: message.userId }); }
    catch (error) { this.logger.error(safeDiagnostic('email_queue_failed', error)); }
  }
}
