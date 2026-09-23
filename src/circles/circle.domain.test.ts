import { describe, expect, it } from 'vitest';
import { circleLockAt, confirmationAt, departureAt, matchingIsClosed } from './circle.domain.js';
import { messageQuerySchema, postMessageSchema } from './circle.schemas.js';

describe('Circle timing in Africa/Lagos', () => {
  it('maps departure windows to stable Lagos local times', () => {
    expect(departureAt('2026-09-10', 'EARLY_MORNING').toISOString()).toBe('2026-09-10T03:00:00.000Z');
    expect(departureAt('2026-09-10', 'MORNING').toISOString()).toBe('2026-09-10T06:00:00.000Z');
    expect(departureAt('2026-09-10', 'LATE_MORNING').toISOString()).toBe('2026-09-10T09:00:00.000Z');
    expect(departureAt('2026-09-10', 'AFTERNOON').toISOString()).toBe('2026-09-10T11:00:00.000Z');
  });
  it('calculates configurable confirmation and lock cutoffs', () => {
    expect(circleLockAt('2026-09-10', 'MORNING', 2).toISOString()).toBe('2026-09-10T04:00:00.000Z');
    expect(confirmationAt('2026-09-10', 'MORNING', 24).toISOString()).toBe('2026-09-09T06:00:00.000Z');
  });
  it('closes matching at the exact lock instant', () => {
    expect(matchingIsClosed('2026-09-10', 'MORNING', new Date('2026-09-10T03:59:59.999Z'))).toBe(false);
    expect(matchingIsClosed('2026-09-10', 'MORNING', new Date('2026-09-10T04:00:00.000Z'))).toBe(true);
  });
});

describe('Circle boundary validation', () => {
  it('prevents clients from forging system messages', () => {
    expect(postMessageSchema.safeParse({ body: 'hello', type: 'SYSTEM' }).success).toBe(false);
  });
  it('enforces message length and exclusive cursors', () => {
    expect(postMessageSchema.safeParse({ body: '' }).success).toBe(false);
    expect(postMessageSchema.safeParse({ body: 'x'.repeat(2001) }).success).toBe(false);
    expect(messageQuerySchema.safeParse({ after: 'a', before: 'b' }).success).toBe(false);
  });
});

