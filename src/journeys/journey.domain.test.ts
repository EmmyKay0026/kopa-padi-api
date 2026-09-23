import { describe, expect, it } from 'vitest';
import { assertJourneyTransition, checklistItems, shareExpiry } from './journey.domain.js';
describe('Journey domain', () => {
  it('allows the required happy-path lifecycle', () => {
    expect(() => assertJourneyTransition('PREPARING', 'READY_TO_START')).not.toThrow();
    expect(() => assertJourneyTransition('READY_TO_START', 'IN_PROGRESS')).not.toThrow();
    expect(() => assertJourneyTransition('IN_PROGRESS', 'ARRIVED')).not.toThrow();
    expect(() => assertJourneyTransition('ARRIVED', 'COMPLETED')).not.toThrow();
  });
  it('rejects unsafe state jumps', () => expect(() => assertJourneyTransition('PREPARING', 'COMPLETED')).toThrow());
  it('ships a persistent preparation checklist and expiring shares', () => {
    expect(checklistItems.length).toBeGreaterThanOrEqual(8);
    const now = new Date('2026-01-01T00:00:00Z');
    expect(shareExpiry(now, 24).toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });
});
