import { safeDiagnostic } from '../common/safe-errors.js';

const codes = new Set(['EAUTH', 'EENVELOPE', 'EMESSAGE', 'EDNS', 'ETLS', 'ESOCKET', 'ECONNECTION', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'EACCES', 'EPERM', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID', 'SELF_SIGNED_CERT_IN_CHAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET']);
function own(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
}
export function transportCode(error: unknown): string {
  let current = error;
  const seen = new Set<unknown>();
  for (let depth = 0; current && depth < 8 && !seen.has(current); depth++) {
    seen.add(current);
    const code = own(current, 'code');
    if (typeof code === 'string' && codes.has(code)) return code;
    if (['TimeoutError', 'AbortError'].includes(own(current, 'name') as string)) return 'ETIMEDOUT';
    current = own(current, 'cause');
  }
  return 'UNKNOWN';
}
export class EmailHttpError extends Error {
  constructor(readonly status: number) { super('Email provider did not accept the request'); }
}
export type SmtpStage = 'configuration' | 'compose' | 'connect' | 'authenticate' | 'send';
export class SmtpDeliveryError extends Error {
  readonly code: string;
  readonly responseCode?: number;
  constructor(error: unknown, readonly stage: SmtpStage, timedOut = false) {
    super('SMTP fallback did not accept the request');
    this.code = timedOut ? 'ETIMEDOUT' : transportCode(error);
    const status = own(error, 'responseCode');
    if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) this.responseCode = status;
    // Never retain the original error, cause, reply, recipient or credentials.
  }
}
export class EmailFallbackError extends Error {
  readonly primary: ReturnType<typeof details>;
  readonly fallback: ReturnType<typeof details>;
  constructor(primary: unknown, fallback: unknown) {
    super('SMTP fallback did not accept the request');
    this.primary = details(primary); this.fallback = details(fallback);
  }
}
function details(error: unknown) {
  if (error instanceof EmailHttpError) return { provider: 'zeptomail', http_status: error.status };
  if (error instanceof SmtpDeliveryError) return { provider: 'smtp', stage: error.stage, transport_code: error.code, ...(error.responseCode ? { smtp_status: error.responseCode } : {}) };
  return { transport_code: transportCode(error) };
}
export function emailDeliveryDiagnostic(error: unknown) {
  return { ...safeDiagnostic('email_delivery_failed', error),
    delivery: error instanceof EmailFallbackError ? { primary: error.primary, fallback: error.fallback } : details(error) };
}
