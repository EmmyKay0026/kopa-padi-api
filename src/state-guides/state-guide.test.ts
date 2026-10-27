import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { StateGuideAdminController, StateGuideController } from './state-guide.controller.js';
import { stateGuideWriteSchema } from './state-guide.schemas.js';

async function examples() { return JSON.parse(await readFile(new URL('../../data/state-guide-content.json', import.meta.url), 'utf8')).states; }

describe('state guide editing boundaries', () => {
  it('keeps public reads separate from administrator-only writes', () => {
    expect(Reflect.getMetadata('publicRoute', StateGuideController.prototype.read)).toBe(true);
    expect(Reflect.getMetadata('adminRoute', StateGuideAdminController)).toBe(true);
    for (const method of ['read', 'list', 'save'] as const) expect(Reflect.getMetadata('publicRoute', StateGuideAdminController.prototype[method])).not.toBe(true);
  });
  it('accepts all 37 imported guides without inventing missing office links', async () => {
    const rows = await examples();
    expect(Object.keys(rows)).toHaveLength(37);
    for (const value of Object.values(rows)) expect(stateGuideWriteSchema.safeParse({ ...(value as object), version: 0 }).success).toBe(true);
  });
  it('rejects forged metadata, invalid dates and unsafe photo/source URLs without throwing', async () => {
    const data = { ...(await examples()).NG008, version: 1 };
    expect(stateGuideWriteSchema.safeParse({ ...data, stateId: 'NG001' }).success).toBe(false);
    expect(stateGuideWriteSchema.safeParse({ ...data, updatedBy: 'forged' }).success).toBe(false);
    for (const reviewedOn of ['2026-02-30', '', 'tomorrow']) expect(stateGuideWriteSchema.safeParse({ ...data, research: { ...data.research, reviewedOn } }).success).toBe(false);
    for (const sourceUrl of ['javascript:alert(1)', 'http://example.com', 'not a url']) expect(stateGuideWriteSchema.safeParse({ ...data, secretariat: { ...data.secretariat, sourceUrl } }).success).toBe(false);
    for (const src of ['http://127.0.0.1/private', 'https://unknown.example/photo.jpg', '//example.com/photo.jpg', 'javascript:alert(1)']) expect(stateGuideWriteSchema.safeParse({ ...data, photos: [{ ...data.photos[0], src }] }).success).toBe(false);
  });
  it('allows empty galleries and expectations and a local project image', async () => {
    const data = { ...(await examples()).NG008, version: 1 };
    expect(stateGuideWriteSchema.safeParse({ ...data, photos: [], expectations: [] }).success).toBe(true);
    expect(stateGuideWriteSchema.safeParse({ ...data, photos: [{ ...data.photos[0], src: '/local-photo.webp' }] }).success).toBe(true);
  });
  it('adds only related guide tables, leaving the canonical geography schema intact', async () => {
    const sql = await readFile(new URL('../../drizzle/0014_state_guide_content.sql', import.meta.url), 'utf8');
    expect(sql).not.toMatch(/CREATE TABLE "(?:state|lga)"|DROP TABLE|DELETE FROM|ALTER TABLE "(?:state|lga)"/i);
    expect(sql).toContain('REFERENCES "public"."state"("id")');
    expect((sql.match(/CREATE TABLE "state_guide/g) ?? []).length).toBe(7);
  });
});
