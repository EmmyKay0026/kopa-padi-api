import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter, type LoggerService } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { publicCodes, publicMessages } from './public-errors.js';
import { LogController } from 'fastify';
import { AsyncLocalStorage } from 'node:async_hooks';
import { writeSync } from 'node:fs';

const errorContext = new AsyncLocalStorage<{ request_id: string; route: string; status_code?: number }>();
export const withErrorContext = <T>(request: FastifyRequest, work: () => T): T => errorContext.run({ request_id: request.id, route: request.routeOptions.url ?? 'unmatched' }, work);

const pgCodes = new Set(['23502', '23503', '23505', '23514', '22P02', '22001', '40001', '40P01', '53300', '08006', '08001', '57P01']);
// Read own data properties only: no getters, serialization, stack or arbitrary names.
function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}
export function errorMetadata(error: unknown) {
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; current && depth < 8 && !seen.has(current); depth++) {
    seen.add(current);
    const code = own(current, 'code');
    if (typeof code === 'string' && pgCodes.has(code)) return { error_category: 'database_error', pg_code: code };
    current = own(current, 'cause');
  }
  return { error_category: error instanceof HttpException ? 'http_error' : 'internal_error' };
}
export function safeFailure(error: unknown, frameworkStatus?: number) {
  const frameworkCodes: Record<string, number> = { FST_REQ_FILE_TOO_LARGE: 413, FST_FILES_LIMIT: 413, FST_FIELDS_LIMIT: 413, FST_PARTS_LIMIT: 413, FST_ERR_CTP_BODY_TOO_LARGE: 413, FST_ERR_CTP_INVALID_MEDIA_TYPE: 415, FST_ERR_CTP_INVALID_JSON_BODY: 400, FST_ERR_CTP_EMPTY_JSON_BODY: 400 };
  const codeValue = own(error, 'code');
  const candidate = error instanceof HttpException ? error.getStatus() : frameworkStatus ?? own(error, 'statusCode') ?? (typeof codeValue === 'string' ? frameworkCodes[codeValue] : undefined);
  const status = typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
  if (status >= 500) return { status, body: { statusCode: status, code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } };
  const defaults: Record<number, string> = { 400: 'Invalid request. Check the supplied fields.', 401: 'Authentication required', 403: 'Access is not permitted', 404: 'Resource not found', 409: 'The resource changed. Refresh and try again.', 413: 'Uploaded content is too large', 415: 'Unsupported content type', 429: 'Too many requests. Please try again later.' };
  const response = error instanceof HttpException ? error.getResponse() : undefined;
  const message = typeof response === 'string' ? response : own(response, 'message');
  const code = own(response, 'code');
  return { status, body: { statusCode: status, message: typeof message === 'string' && publicMessages.has(message) ? message : defaults[status] ?? 'Request could not be completed', ...(typeof code === 'string' && publicCodes.has(code) ? { code } : {}) } };
}
export function handleRequestError(error: unknown, request: FastifyRequest, reply: FastifyReply, frameworkStatus?: number) {
  const { status, body } = safeFailure(error, frameworkStatus);
  request.log.error({ request_id: request.id, route: request.routeOptions.url ?? 'unmatched', status_code: status, ...errorMetadata(error) }, 'request_failed');
  if (!reply.sent) reply.code(status).send(body);
}
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    handleRequestError(error, context.getRequest(), context.getResponse());
  }
}
// Nest bootstrap and dependency errors must not fall back to ConsoleLogger.
export const safeNestLogger: LoggerService = {
  log: () => console.info(JSON.stringify({ event_type: 'framework_info' })),
  warn: () => console.warn(JSON.stringify({ event_type: 'framework_warning' })),
  error: (error: unknown) => console.error(JSON.stringify({ event_type: 'framework_error', ...errorMetadata(error) })),
};
export function safeDiagnostic(event: string, error?: unknown) {
  // Event names are code-owned constants at callers, never request input.
  return { event_type: event, ...errorContext.getStore(), ...errorMetadata(error) };
}

export class SafeLogController extends LogController {
  constructor() { super({ disableRequestLogging: true }); }
  private failure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
    request.log.error({ request_id: request.id, route: request.routeOptions.url ?? 'unmatched', status_code: reply.statusCode, ...errorMetadata(error) }, 'transport_failed');
  }
  override streamError(error: Error, request: FastifyRequest, reply: FastifyReply) { this.failure(error, request, reply); }
  override writeHeadError(error: Error, request: FastifyRequest, reply: FastifyReply) { this.failure(error, request, reply); }
  override serializerError(error: Error, request: FastifyRequest, reply: FastifyReply) { this.failure(error, request, reply); }
}

// Match Node's fail-fast behavior without its default raw error/cause dump.
export function installFatalErrorHandlers() {
  const fatal = (event: string, error: unknown) => {
    writeSync(2, JSON.stringify(safeDiagnostic(event, error)) + '\n');
    process.exit(1);
  };
  process.once('uncaughtException', error => fatal('uncaught_exception', error));
  process.once('unhandledRejection', error => fatal('unhandled_rejection', error));
}
