import type { EmailIntent, EmailMessage } from './email.service.js';

const BRAND_COLOR = '#165D3A';
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const titles: Record<EmailIntent, string> = {
  ACCOUNT_VERIFICATION: 'Verify your email address', PASSWORD_RESET: 'Reset your password',
  PCM_SUBMITTED: 'Verification submitted', PCM_APPROVED: 'You’re verified',
  PCM_REJECTED: 'Verification update', PCM_RESUBMISSION_REQUIRED: 'Action needed on your verification',
  JOURNEY_SAFETY: 'Journey safety update',
};
const preheaders: Record<EmailIntent, string> = {
  ACCOUNT_VERIFICATION: 'Confirm your email to finish setting up your Kopa Padi account.',
  PASSWORD_RESET: 'Use this secure link to choose a new Kopa Padi password.',
  PCM_SUBMITTED: 'We received your verification and will review it shortly.',
  PCM_APPROVED: 'Your Kopa Padi profile has been verified.',
  PCM_REJECTED: 'There is an update about your Kopa Padi verification.',
  PCM_RESUBMISSION_REQUIRED: 'Please update your documents so we can continue your verification.',
  JOURNEY_SAFETY: 'A new Kopa Padi journey safety update is available.',
};

export interface RenderedEmail { html: string; text: string }

export function renderEmail(message: EmailMessage): RenderedEmail {
  const greeting = message.recipientName ? `Hi ${message.recipientName},` : 'Hello,';
  const action = message.actionUrl && message.actionLabel
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0"><tr><td style="border-radius:8px;background:${BRAND_COLOR}"><a href="${escapeHtml(message.actionUrl)}" style="display:inline-block;padding:14px 22px;color:#fff;text-decoration:none;font-size:15px;font-weight:700">${escapeHtml(message.actionLabel)}</a></td></tr></table>`
    : '';
  const details = message.details?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#f6f8f7;border-radius:8px">${message.details.map(({ label, value }) => `<tr><td style="padding:10px 14px;color:#66726c;font-size:13px;border-bottom:1px solid #e7ece9">${escapeHtml(label)}</td><td align="right" style="padding:10px 14px;color:#17251e;font-size:13px;font-weight:600;border-bottom:1px solid #e7ece9">${escapeHtml(value)}</td></tr>`).join('')}</table>`
    : '';
  const textDetails = message.details?.length ? `\n\n${message.details.map(({ label, value }) => `${label}: ${value}`).join('\n')}` : '';
  const textAction = message.actionUrl && message.actionLabel ? `\n\n${message.actionLabel}: ${message.actionUrl}` : '';
  const safetyNote = message.intent === 'JOURNEY_SAFETY'
    ? 'For urgent safety concerns, contact the traveller or local emergency services directly.'
    : 'If you didn’t request this or believe you received it by mistake, you can safely ignore this email.';
  return {
    text: `${greeting}\n\n${message.text}${textDetails}${textAction}\n\n${safetyNote}\n\n— The Kopa Padi team\n${WEB_URL}`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(message.subject)}</title></head><body style="margin:0;padding:0;background:#f2f5f3;font-family:Arial,Helvetica,sans-serif;color:#17251e"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(message.preheader ?? preheaders[message.intent])}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f5f3"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px"><tr><td style="padding:0 4px 20px;color:${BRAND_COLOR};font-size:22px;font-weight:800">Kopa Padi</td></tr><tr><td style="background:#fff;border:1px solid #dfe7e2;border-radius:12px;padding:40px 36px"><p style="margin:0 0 18px;color:#526159;font-size:15px;line-height:1.6">${escapeHtml(greeting)}</p><h1 style="margin:0 0 18px;color:#12271c;font-size:27px;line-height:1.25">${escapeHtml(message.title ?? titles[message.intent])}</h1><p style="margin:0;color:#384940;font-size:16px;line-height:1.65">${escapeHtml(message.text).replaceAll('\n', '<br>')}</p>${details}${action}<p style="margin:28px 0 0;color:#66726c;font-size:13px;line-height:1.6">${escapeHtml(safetyNote)}</p></td></tr><tr><td align="center" style="padding:22px 20px;color:#78857e;font-size:12px;line-height:1.6">Sent by Kopa Padi · Safer journeys, better connections<br><a href="${escapeHtml(WEB_URL)}" style="color:${BRAND_COLOR};text-decoration:none">${escapeHtml(WEB_URL.replace(/^https?:\/\//, ''))}</a></td></tr></table></td></tr></table></body></html>`,
  };
}
