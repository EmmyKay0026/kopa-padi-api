import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { journeyCheckIns, journeyLocationShares, journeyShares } from '../db/schema.js';
import { JourneyService } from './journey.service.js';
import { sharedCheckInQuerySchema } from './journey.schemas.js';

const mocked = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn() }));
vi.mock('../db/database.js', () => ({ db: mocked }));

const dialect = new PgDialect();
const uuid = (value: number) => `11111111-1111-4111-8111-${String(value).padStart(12, '0')}`;
const journeyId = uuid(1);
const token = 'synthetic-share-token';
const service = new JourneyService({} as any);
let eligible: boolean;
let rows: Array<{ id: string; journeyId: string; type: string; message: string | null; createdAt: Date; latitude: string; userId: string }>;
let queries: Array<{ table: unknown; fields: string[]; where: string; params: unknown[]; order: string[]; limit: number; joins: string[] }>;

beforeEach(() => {
  eligible = true;
  rows = [];
  queries = [];
  mocked.select.mockImplementation((projection: Record<string, unknown>) => {
    const query = { table: undefined as unknown, fields: Object.keys(projection), where: '', params: [] as unknown[], order: [] as string[], limit: 0, joins: [] as string[] };
    const builder: any = {
      from(table: unknown) { query.table = table; return builder; },
      innerJoin(_table: unknown, condition: any) { query.joins.push(dialect.sqlToQuery(condition).sql); return builder; },
      leftJoin(_table: unknown, condition: any) { query.joins.push(dialect.sqlToQuery(condition).sql); return builder; },
      where(condition: any) { const compiled = dialect.sqlToQuery(condition); query.where = compiled.sql; query.params = compiled.params; return builder; },
      orderBy(...order: any[]) { query.order = order.map((value) => dialect.sqlToQuery(value).sql); return builder; },
      async limit(limit: number) {
        query.limit = limit;
        queries.push(query);
        if (query.table === journeyShares) return eligible ? [{
          share: { id: uuid(2), expiresAt: new Date('2099-01-01') }, journey: { id: journeyId, status: 'IN_PROGRESS', expectedArrivalAt: null },
          user: { name: 'Synthetic Traveller' }, profile: null, destination: { campName: 'Synthetic Camp' },
        }] : [];
        if (query.table === journeyLocationShares) return [];
        if (query.table === journeyCheckIns) {
          const scoped = rows.filter((row) => row.journeyId === query.params[0]);
          if (query.fields.length === 1) return scoped.filter((row) => row.id === query.params[1]).map(({ id }) => ({ id })).slice(0, limit);
          let ordered = [...scoped].sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf() || (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));
          if (query.params.length > 1) {
            const cursor = ordered.findIndex((row) => row.id === query.params[1]);
            ordered = cursor === -1 ? [] : ordered.slice(cursor + 1);
          }
          return ordered.slice(0, limit).map((row) => Object.fromEntries(query.fields.map((field) => [field, row[field as keyof typeof row]])));
        }
        throw new Error('Unexpected table in shared-history query');
      },
    };
    return builder;
  });
  mocked.update.mockImplementation(() => ({ set: () => ({ where: async () => undefined }) }));
});

function seed(count: number) {
  rows = Array.from({ length: count }, (_, index) => ({
    id: uuid(index + 100), journeyId, type: index === 0 ? 'STARTED' : 'SAFE', message: `Update ${index}`,
    createdAt: new Date('2026-10-25T08:00:00Z'), latitude: 'private-coordinate', userId: 'private-user-id',
  }));
  rows.push({ ...rows[0], id: uuid(999), journeyId: uuid(999), message: 'OTHER JOURNEY' });
}

describe('trusted-contact check-in history', () => {
  it('returns the latest summary plus a bounded first page without private fields', async () => {
    seed(45);
    const result = await service.publicShare(token);
    expect(result.checkInHistory.items).toHaveLength(20);
    expect(result.lastCheckIn).toEqual(result.checkInHistory.items[0]);
    expect(result.checkInHistory.nextCursor).toBe(result.checkInHistory.items.at(-1)!.id);
    expect(Object.keys(result.checkInHistory.items[0]).sort()).toEqual(['createdAt', 'id', 'message', 'type']);
    expect(JSON.stringify(result)).not.toContain('private-coordinate');
    expect(JSON.stringify(result)).not.toContain('OTHER JOURNEY');
    expect(queries.find((query) => query.table === journeyCheckIns)!.limit).toBe(21);
  });

  it('retrieves every repeated check-in across pages with deterministic timestamp ties', async () => {
    seed(45);
    let page = await service.publicCheckIns(token);
    const all = [...page.items];
    while (page.nextCursor) {
      page = await service.publicCheckIns(token, page.nextCursor);
      all.push(...page.items);
    }
    expect(all).toHaveLength(45);
    expect(new Set(all.map((item) => item.id)).size).toBe(45);
    expect(all.filter((item) => item.type === 'SAFE')).toHaveLength(44);
    expect(all.at(-1)!.type).toBe('STARTED');
    expect(queries.filter((query) => query.table === journeyCheckIns && query.fields.length > 1).every((query) => query.order.join(',').includes('"created_at" desc'))).toBe(true);
    expect(queries.some((query) => query.where.includes('checkin_cursor.created_at') && query.params.filter((value) => value === journeyId).length === 2)).toBe(true);
  });

  it('rejects a cursor from another journey before reading a history page', async () => {
    seed(2);
    await expect(service.publicCheckIns(token, uuid(999))).rejects.toThrow('Invalid check-in cursor');
    expect(queries.filter((query) => query.table === journeyCheckIns)).toHaveLength(1);
  });

  it.each(['expired', 'revoked', 'invalid', 'inactive contact'])('rejects %s shares on both initial and older-page requests', async () => {
    eligible = false;
    await expect(service.publicShare(token)).rejects.toThrow('invalid or expired');
    await expect(service.publicCheckIns(token, uuid(100))).rejects.toThrow('invalid or expired');
    expect(queries.every((query) => query.table === journeyShares)).toBe(true);
  });

  it('revalidates the hashed token, active share, expiry and active owned contact on every request', async () => {
    await service.publicShare(token);
    await service.publicCheckIns(token);
    for (const query of queries.filter((query) => query.table === journeyShares)) {
      expect(query.params).toContain(createHash('sha256').update(token).digest('hex'));
      expect(query.params).toContain('ACTIVE');
      expect(query.params.some((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value))).toBe(true);
      expect(query.where).toContain('"journey_share"."expires_at" >');
      expect(query.joins.join(' ')).toContain('"trusted_contact"."is_active"');
      expect(query.joins.join(' ')).toContain('"trusted_contact"."user_id" = "journey"."user_id"');
    }
  });

  it('returns an empty history and no latest check-in before the first update', async () => {
    const result = await service.publicShare(token);
    expect(result.checkInHistory).toEqual({ items: [], nextCursor: null });
    expect(result.lastCheckIn).toBeNull();
  });

  it('validates cursor queries and rejects forged scope or unbounded limits', () => {
    expect(sharedCheckInQuerySchema.parse({})).toEqual({});
    expect(sharedCheckInQuerySchema.parse({ before: uuid(100) })).toEqual({ before: uuid(100) });
    for (const query of [{ before: 'invalid' }, { before: [uuid(100), uuid(101)] }, { journeyId }, { limit: 100000 }]) {
      expect(sharedCheckInQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});
