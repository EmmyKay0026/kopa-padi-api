import { afterEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { journeys, journeyLocationShares, journeyShares } from '../db/schema.js';
import { locationSharingPolicy } from './journey.domain.js';
import { locationSchema } from './journey.schemas.js';
import { JourneyService } from './journey.service.js';

const mocked = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('../db/database.js', () => ({ db: mocked }));
const input = { latitude: 6.5, longitude: 3.4, audience: 'TRUSTED_CONTACT' as const, consent: true as const };
const dialect = new PgDialect();

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('location duration and renewal', () => {
  it('keeps the 60-minute default and exposes a configured default to the client', () => {
    vi.stubEnv('JOURNEY_LOCATION_SHARE_MINUTES', '60');
    expect(locationSharingPolicy()).toEqual({ defaultDurationMinutes: 60, maxDurationMinutes: 1440 });
    vi.stubEnv('JOURNEY_LOCATION_SHARE_MINUTES', '30');
    expect(locationSharingPolicy().defaultDurationMinutes).toBe(30);
    vi.stubEnv('JOURNEY_LOCATION_SHARE_MINUTES', 'invalid');
    expect(locationSharingPolicy().defaultDurationMinutes).toBe(60);
  });

  it('requires consent and accepts only bounded whole-minute durations', () => {
    expect(locationSchema.parse(input).durationMinutes).toBeUndefined();
    for (const durationMinutes of [1, 15, 60, 120, 1440]) expect(locationSchema.safeParse({ ...input, durationMinutes }).success).toBe(true);
    for (const durationMinutes of [0, -1, 1.5, 1441, Infinity, '60']) expect(locationSchema.safeParse({ ...input, durationMinutes }).success).toBe(false);
    expect(locationSchema.safeParse({ ...input, consent: false, durationMinutes: 60 }).success).toBe(false);
  });

  it.each([undefined, 1, 30, 120])('persists the chosen expiry (%s minutes) and replaces the previous snapshot for the same audience', async (durationMinutes) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));
    vi.stubEnv('JOURNEY_LOCATION_SHARE_MINUTES', '60');
    let stored: Record<string, unknown> | undefined;
    let replaced: ReturnType<PgDialect['sqlToQuery']> | undefined;
    const tx = {
      execute: vi.fn(),
      select: () => {
        let table: unknown;
        const builder: any = {
          from(value: unknown) { table = value; return builder; },
          innerJoin() { return builder; }, where() { return builder; },
          async limit() { return table === journeys ? [{ id: 'journey', userId: 'owner', status: 'IN_PROGRESS' }] : table === journeyShares ? [{ id: 'eligible-share' }] : []; },
        };
        return builder;
      },
      update: (table: unknown) => {
        expect(table).toBe(journeyLocationShares);
        return { set: (value: { expiresAt: Date }) => {
          expect(value.expiresAt).toEqual(new Date());
          return { where: (condition: any) => { replaced = dialect.sqlToQuery(condition); } };
        } };
      },
      insert: (table: unknown) => {
        expect(table).toBe(journeyLocationShares);
        return { values: (value: Record<string, unknown>) => { stored = value; return { returning: async () => [{ id: 'new-snapshot', ...value }] }; } };
      },
    };
    mocked.transaction.mockImplementation((work) => work(tx));
    const service = new JourneyService({} as any);
    const result = await service.shareLocation('owner', { ...input, durationMinutes });
    expect(result.expiresAt.getTime() - Date.now()).toBe((durationMinutes ?? 60) * 60_000);
    expect(stored).toMatchObject({ journeyId: 'journey', audience: 'TRUSTED_CONTACT', expiresAt: result.expiresAt, latitude: '6.5', longitude: '3.4' });
    expect(replaced?.params).toContain('journey');
    expect(replaced?.params).toContain('TRUSTED_CONTACT');
    expect(replaced?.sql).toContain('"expires_at" >');
  });

  it('rejects invalid durations at the service boundary before writing', async () => {
    const service = new JourneyService({} as any);
    await expect(service.shareLocation('owner', { ...input, durationMinutes: 0 })).rejects.toThrow('Invalid location sharing duration');
    expect(mocked.transaction).not.toHaveBeenCalled();
  });
});
