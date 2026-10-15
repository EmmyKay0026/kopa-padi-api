import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { errorMetadata, safeFailure, safeNestLogger } from './safe-errors.js';

describe('safe exception boundary', () => {
  const sentinel = 'SYNTHETIC_PRIVATE_PASSWORD_COOKIE_TOKEN_DOCUMENT_LOCATION';
  it.each(['database parameters', 'nested causes', 'authentication', 'multipart documents', 'safety reporting', 'background worker'])('excludes %s secrets from metadata and responses', () => {
    const error = new Error(sentinel, { cause: Object.assign(new Error(sentinel), { code: '23514', query: sentinel, params: [sentinel], detail: sentinel }) });
    error.name = sentinel;
    const output = JSON.stringify({ metadata: errorMetadata(error), response: safeFailure(error) });
    expect(output).not.toContain(sentinel);
    expect(errorMetadata(error)).toEqual({ error_category: 'database_error', pg_code: '23514' });
    expect(safeFailure(error).status).toBe(500);
  });
  it('preserves reviewed business messages and codes, never arbitrary 4xx data', () => {
    expect(safeFailure(new ConflictException('Self-review is prohibited')).body.message).toBe('Self-review is prohibited');
    expect(safeFailure(new ConflictException({ code: 'OFFER_NO_LONGER_AVAILABLE' })).body.code).toBe('OFFER_NO_LONGER_AVAILABLE');
    for (const error of [new UnauthorizedException(sentinel), new BadRequestException({ message: sentinel, issues: [sentinel] })]) expect(JSON.stringify(safeFailure(error))).not.toContain(sentinel);
  });
  it('handles cycles, ignores getters and rejects unapproved PostgreSQL codes', () => {
    const error: any = { code: sentinel }; error.cause = error;
    expect(errorMetadata(error)).toEqual({ error_category: 'internal_error' });
    expect(errorMetadata({ get code() { throw new Error(sentinel); } })).toEqual({ error_category: 'internal_error' });
    expect(safeFailure(new Error(sentinel), 200).status).toBe(500);
  });
  it('preserves framework rate-limit status without echoing its message', () => {
    const result = safeFailure(Object.assign(new Error(sentinel), { statusCode: 429 }));
    expect(result.status).toBe(429);
    expect(result.body.message).toBe('Too many requests. Please try again later.');
    expect(JSON.stringify(result)).not.toContain(sentinel);
  });
  it('sanitizes Nest startup logs rather than serializing error causes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { safeNestLogger.error(new Error(sentinel, { cause: new Error(sentinel) })); expect(JSON.stringify(spy.mock.calls)).not.toContain(sentinel); expect(JSON.stringify(spy.mock.calls)).toContain('framework_error'); }
    finally { spy.mockRestore(); }
  });
});
