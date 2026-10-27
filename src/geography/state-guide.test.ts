import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const select = vi.hoisted(() => vi.fn());
vi.mock('../db/database.js', () => ({ db: { select } }));
import { GeographyService } from './geography.service.js';
import { GeographyController } from './geography.controller.js';

describe('public state guide geography', () => {
  beforeEach(() => select.mockReset());

  it('only makes the narrow state guide endpoint public', () => {
    const proto = GeographyController.prototype;
    expect(Reflect.getMetadata('publicRoute', proto.stateGuide)).toBe(true);
    for (const name of ['states', 'lgas', 'towns', 'lga', 'camps', 'camp', 'hubs', 'hub', 'createCamp', 'updateCamp'] as const) {
      expect(Reflect.getMetadata('publicRoute', proto[name])).not.toBe(true);
    }
  });

  it('joins canonical state, LGA and operational camp records with a limited public projection', async () => {
    const conditions: unknown[] = [];
    const filtered = (rows: unknown[]) => ({ where: (condition: unknown) => { conditions.push(condition); return { orderBy: async () => rows }; } });
    select.mockReturnValueOnce({ from: () => ({ where: async () => [{ id: 'NG008', name: 'Borno' }] }) });
    select.mockReturnValueOnce({ from: () => filtered([{ id: 'lga-id', name: 'Maiduguri' }]) });
    select.mockReturnValueOnce({ from: () => ({ leftJoin: () => filtered([
      { id: 'camp-id', name: 'Orientation venue', address: 'Camp address', lga: 'Maiduguri', latitude: '11.828196', longitude: '13.123580', status: 'ACTIVE' },
      { id: 'temporary-id', name: 'Temporary venue', address: null, lga: null, latitude: null, longitude: '0', status: 'TEMPORARY' },
    ]) }) });

    const result = await new GeographyService().stateGuide('NG008');
    expect(result.state).toEqual({ id: 'NG008', name: 'Borno' });
    expect(result.camps[0]).toMatchObject({ latitude: 11.828196, longitude: 13.12358 });
    expect(result.camps[1]).toMatchObject({ latitude: null, longitude: 0 });
    expect(Object.keys(select.mock.calls[0][0])).toEqual(['id', 'name']);
    expect(Object.keys(select.mock.calls[1][0])).toEqual(['id', 'name']);
    expect(Object.keys(select.mock.calls[2][0])).not.toContain('sourceReference');
    const dialect = new PgDialect();
    const queries = conditions.map(condition => dialect.sqlToQuery(condition as Parameters<typeof dialect.sqlToQuery>[0]));
    expect(queries[0].params).toContain('NG008');
    expect(queries[1].params).toEqual(['NG008', 'ACTIVE', 'TEMPORARY']);
  });

  it('does not load unrelated geography for an unknown or inactive state', async () => {
    select.mockReturnValueOnce({ from: () => ({ where: async () => [] }) });
    await expect(new GeographyService().stateGuide('unknown')).rejects.toThrow('State not found');
    expect(select).toHaveBeenCalledTimes(1);
  });
});
