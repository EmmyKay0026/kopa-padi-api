import { describe, expect, it, vi } from 'vitest';
vi.mock('../db/database.js', () => ({ db: {} }));
import { lockSnapshot, lockThreshold, LOCK_WARNING } from './circle-lock.js';
const circle = { id: 'circle', travelDate: '2026-10-31', departureWindow: 'MORNING', transportMode: 'COMMERCIAL_BUS' };
describe('permanent group lock rules', () => {
  it.each([[2,2],[3,2],[4,2],[5,3],[6,3]])('requires %s members to supply %s approvals', (size, votes) => expect(lockThreshold(size)).toBe(votes));
  it('never allows one person to lock a Circle', () => expect(lockThreshold(1)).toBe(2));
  it('keeps the snapshot stable for sorting and travel confirmation', () => {
    const a = [{ id: 'a', membershipStatus: 'JOINED' }, { id: 'b', membershipStatus: 'CONFIRMED' }];
    expect(lockSnapshot(circle, a)).toBe(lockSnapshot(circle, [...a].reverse()));
    expect(lockSnapshot(circle, a)).toBe(lockSnapshot(circle, a.map(m => ({ ...m, membershipStatus: 'CONFIRMED' }))));
  });
  it('invalidates approval for joins, exits, rejoining and schedule changes', () => {
    const members = [{ id: 'a', membershipStatus: 'JOINED' }, { id: 'b', membershipStatus: 'CONFIRMED' }];
    const original = lockSnapshot(circle, members);
    for (const roster of [[...members, { id: 'c', membershipStatus: 'JOINED' }], [{ ...members[0], membershipStatus: 'LEFT' }, members[1]], [...members, { id: 'old', membershipStatus: 'LEFT' }]]) expect(lockSnapshot(circle, roster)).not.toBe(original);
    expect(lockSnapshot({ ...circle, travelDate: '2026-11-01' }, members)).not.toBe(original);
  });
  it('warns about permanence without implying rescheduling or automatic departure', () => {
    expect(LOCK_WARNING).toContain('cannot be unlocked');
    expect(LOCK_WARNING).toContain('does not change the departure schedule');
    expect(LOCK_WARNING).toContain('start');
  });
});
