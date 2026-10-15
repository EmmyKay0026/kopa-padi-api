import { safeDiagnostic } from "../common/safe-errors.js";
import { Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../db/database.js';
import { notificationOutbox } from '../db/schema.js';
import { renderEmail } from './email.template.js';

export type EmailIntent = 'ACCOUNT_VERIFICATION' | 'PASSWORD_RESET' | 'PCM_SUBMITTED' | 'PCM_APPROVED' | 'PCM_REJECTED' | 'PCM_RESUBMISSION_REQUIRED' | 'JOURNEY_SAFETY';
export interface EmailMessage { to: string; intent: EmailIntent; subject: string; text: string; userId?: string; title?: string; preheader?: string; recipientName?: string; actionUrl?: string; actionLabel?: string; details?: Array<{ label: string; value: string }> }
const deliveryLogger = new Logger('EmailDelivery');

export async function sendZeptoMail(message: EmailMessage): Promise<void> {
  if (!process.env.ZEPTO_MAIL_API_KEY) {
    if (process.env.NODE_ENV === 'production') throw new Error('ZEPTO_MAIL_API_KEY is required');
    deliveryLogger.warn(safeDiagnostic('email_suppressed'));
    return;
  }
  const rendered = renderEmail(message);
  const response = await fetch(process.env.ZEPTO_MAIL_API_URL ?? 'https://api.zeptomail.com/v1.1/email', {
    method: 'POST', headers: { Authorization: `Zoho-enczapikey ${process.env.ZEPTO_MAIL_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: { address: process.env.ZEPTO_MAIL_FROM_ADDRESS, name: process.env.ZEPTO_MAIL_FROM_NAME ?? 'Kopa Padi' },
      to: [{ email_address: { address: message.to } }], subject: message.subject,
      textbody: rendered.text, htmlbody: rendered.html,
    }),
  });
  if (!response.ok) throw new Error(`ZeptoMail rejected message (${response.status})`);
}

async function deliverQueuedEmail(outboxId: string, message: EmailMessage) {
  try {
    await sendZeptoMail(message);
    await db.update(notificationOutbox).set({ sentAt: new Date(), attempts: '1', lastError: null }).where(eq(notificationOutbox.id, outboxId));
  } catch (error) {
    const detail = JSON.stringify(safeDiagnostic('email_delivery_failed', error));
    await db.update(notificationOutbox).set({ attempts: '1', lastError: detail }).where(eq(notificationOutbox.id, outboxId)).catch(() => undefined);
    deliveryLogger.error(safeDiagnostic('email_delivery_failed', error));
  }
}
export async function retryQueuedEmails(limit=25){
  const rows=await db.select().from(notificationOutbox).where(and(isNull(notificationOutbox.sentAt),lt(sql<number>`${notificationOutbox.attempts}::int`,5))).orderBy(notificationOutbox.createdAt).limit(limit);
  let sent=0,failed=0;
  for(const row of rows){const payload=row.payload as Partial<EmailMessage>;if(!payload.to||!payload.subject||!payload.text){failed++;continue;}try{await sendZeptoMail({...payload,userId:row.userId,to:payload.to,subject:payload.subject,text:payload.text,intent:row.type as EmailIntent});await db.update(notificationOutbox).set({sentAt:new Date(),attempts:sql`(${notificationOutbox.attempts}::int + 1)::text`,lastError:null}).where(and(eq(notificationOutbox.id,row.id),isNull(notificationOutbox.sentAt)));sent++;}catch(error){failed++;await db.update(notificationOutbox).set({attempts:sql`(${notificationOutbox.attempts}::int + 1)::text`,lastError:JSON.stringify(safeDiagnostic('email_delivery_failed', error))}).where(eq(notificationOutbox.id,row.id));}}
  return{checked:rows.length,sent,failed};
}

export async function queueEmail(message: EmailMessage & { userId: string }): Promise<void> {
  const payload: Record<string, unknown> = { ...message };
  const [row] = await db.insert(notificationOutbox).values({ userId: message.userId, type: message.intent, payload }).returning({ id: notificationOutbox.id });
  void deliverQueuedEmail(row.id, message);
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  async send(message: EmailMessage) { await sendZeptoMail(message); }
  dispatch(message: EmailMessage) {
    if (!message.userId) { this.logger.error(safeDiagnostic('email_missing_user')); return; }
    void queueEmail({ ...message, userId: message.userId }).catch((error) => this.logger.error(safeDiagnostic('email_queue_failed', error)));
  }
}
