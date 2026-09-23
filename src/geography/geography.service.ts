import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/database.js';
import { lgaProximities, lgas, orientationCamps, states, towns, travelHubLgas, travelHubs } from '../db/schema.js';
import { CompatibilityDataSource, GeographyCompatibilityEngine, normalizeLgaPair, SharedHub } from './compatibility.js';

type CampInput = { stateId: string; lgaId?: string | null; name: string; officialAddress?: string | null; latitude?: number | null; longitude?: number | null; status: 'ACTIVE'|'TEMPORARY'|'INACTIVE'|'UNKNOWN'; sourceReference?: string | null };
type HubInput = { name: string; stateId: string; lgaId?: string | null; townId?: string | null; latitude?: number | null; longitude?: number | null; hubType: 'LOCAL'|'REGIONAL'|'INTERSTATE'|'DESTINATION_GATEWAY'; status: 'ACTIVE'|'INACTIVE'|'REVIEW_REQUIRED' };
type ProximityInput = { lgaAId: string; lgaBId: string; estimatedRoadMinutes: number; estimatedRoadDistanceKm?: number | null; commonHubId?: string | null; source: 'OSRM'|'MANUAL_REVIEW'|'OPENSTREETMAP'|'IMPORTED_DATASET' };

@Injectable()
export class GeographyService implements CompatibilityDataSource {
  private readonly engine = new GeographyCompatibilityEngine(this);
  states() { return db.select().from(states).where(eq(states.isActive, true)).orderBy(asc(states.name)); }
  lgas(stateId: string) { return db.select().from(lgas).where(and(eq(lgas.stateId, stateId), eq(lgas.isActive, true))).orderBy(asc(lgas.name)); }
  towns(lgaId: string) { return db.select().from(towns).where(and(eq(towns.lgaId, lgaId), eq(towns.isActive, true))).orderBy(asc(towns.name)); }
  async lga(id: string) { const [row] = await db.select({ lga: lgas, state: states }).from(lgas).innerJoin(states, eq(states.id, lgas.stateId)).where(eq(lgas.id, id)); if (!row) throw new NotFoundException('LGA not found'); return row; }
  camps() { return db.select({ camp: orientationCamps, state: states, lga: lgas }).from(orientationCamps).leftJoin(states, eq(states.id, orientationCamps.stateId)).leftJoin(lgas, eq(lgas.id, orientationCamps.lgaId)).orderBy(asc(orientationCamps.stateName), asc(orientationCamps.campName)); }
  async camp(id: string) { const [row] = await db.select({ camp: orientationCamps, state: states, lga: lgas }).from(orientationCamps).leftJoin(states, eq(states.id, orientationCamps.stateId)).leftJoin(lgas, eq(lgas.id, orientationCamps.lgaId)).where(eq(orientationCamps.id, id)); if (!row) throw new NotFoundException('Camp not found'); return row; }
  hubs() { return db.select({ hub: travelHubs, state: states, lga: lgas }).from(travelHubs).innerJoin(states, eq(states.id, travelHubs.stateId)).leftJoin(lgas, eq(lgas.id, travelHubs.lgaId)).orderBy(asc(travelHubs.name)); }
  async hub(id: string) { const [row] = await db.select({ hub: travelHubs, state: states, lga: lgas }).from(travelHubs).innerJoin(states, eq(states.id, travelHubs.stateId)).leftJoin(lgas, eq(lgas.id, travelHubs.lgaId)).where(eq(travelHubs.id, id)); if (!row) throw new NotFoundException('Hub not found'); const coverage = await db.select({ coverage: travelHubLgas, lga: lgas }).from(travelHubLgas).innerJoin(lgas, eq(lgas.id, travelHubLgas.lgaId)).where(eq(travelHubLgas.travelHubId, id)); return { ...row, coverage }; }
  proximities() { return db.select().from(lgaProximities).orderBy(asc(lgaProximities.lgaAId), asc(lgaProximities.lgaBId)); }
  evaluate(a: string, b: string) { return this.engine.evaluate(a, b); }

  async saveCamp(id: string | null, input: CampInput) {
    const geography = await this.validateStateLga(input.stateId, input.lgaId);
    const values = { stateId: input.stateId, lgaId: input.lgaId ?? null, stateName: geography.state.name, lgaName: geography.lga?.name ?? null, campName: input.name, officialAddress: input.officialAddress ?? null, latitude: input.latitude == null ? null : String(input.latitude), longitude: input.longitude == null ? null : String(input.longitude), status: input.status, sourceReference: input.sourceReference ?? null, updatedAt: new Date() };
    if (id) { const [row] = await db.update(orientationCamps).set(values).where(eq(orientationCamps.id, id)).returning(); if (!row) throw new NotFoundException('Camp not found'); return row; }
    return (await db.insert(orientationCamps).values(values).returning())[0];
  }
  async saveHub(id: string | null, input: HubInput) {
    await this.validateStateLga(input.stateId, input.lgaId);
    if (input.townId) { const [town] = await db.select().from(towns).where(eq(towns.id, input.townId)); if (!town || (input.lgaId && town.lgaId !== input.lgaId)) throw new BadRequestException('Town does not belong to the selected LGA'); }
    const values = { ...input, lgaId: input.lgaId ?? null, townId: input.townId ?? null, latitude: input.latitude == null ? null : String(input.latitude), longitude: input.longitude == null ? null : String(input.longitude), updatedAt: new Date() };
    if (id) { const [row] = await db.update(travelHubs).set(values).where(eq(travelHubs.id, id)).returning(); if (!row) throw new NotFoundException('Hub not found'); return row; }
    return (await db.insert(travelHubs).values(values).returning())[0];
  }
  async saveCoverage(hubId: string, input: { lgaId: string; estimatedMinutes: number; isPrimary: boolean; source: any }) {
    const [[hub], [lga]] = await Promise.all([db.select().from(travelHubs).where(eq(travelHubs.id, hubId)), db.select().from(lgas).where(eq(lgas.id, input.lgaId))]);
    if (!hub || !lga) throw new NotFoundException('Hub or LGA not found');
    if (input.isPrimary) await db.update(travelHubLgas).set({ isPrimary: false, updatedAt: new Date() }).where(eq(travelHubLgas.lgaId, input.lgaId));
    return (await db.insert(travelHubLgas).values({ travelHubId: hubId, ...input }).onConflictDoUpdate({ target: [travelHubLgas.travelHubId, travelHubLgas.lgaId], set: { estimatedMinutes: input.estimatedMinutes, isPrimary: input.isPrimary, source: input.source, updatedAt: new Date() } }).returning())[0];
  }
  async saveProximity(id: string | null, input: ProximityInput) {
    const [a, b] = normalizeLgaPair(input.lgaAId, input.lgaBId);
    if (a === b) throw new BadRequestException('A proximity pair requires two different LGAs');
    if (!(await this.lgasExist([a, b]))) throw new NotFoundException('One or both LGAs do not exist');
    if (input.commonHubId && !(await db.select({ id: travelHubs.id }).from(travelHubs).where(eq(travelHubs.id, input.commonHubId))).length) throw new NotFoundException('Common hub not found');
    const values = { lgaAId: a, lgaBId: b, estimatedRoadMinutes: input.estimatedRoadMinutes, estimatedRoadDistanceKm: input.estimatedRoadDistanceKm == null ? null : String(input.estimatedRoadDistanceKm), commonHubId: input.commonHubId ?? null, isNearby: input.estimatedRoadMinutes <= 60, source: input.source, lastVerifiedAt: new Date(), updatedAt: new Date() };
    if (id) { const [row] = await db.update(lgaProximities).set(values).where(eq(lgaProximities.id, id)).returning(); if (!row) throw new NotFoundException('Proximity not found'); return row; }
    return (await db.insert(lgaProximities).values(values).onConflictDoUpdate({ target: [lgaProximities.lgaAId, lgaProximities.lgaBId], set: values }).returning())[0];
  }
  async lgasExist(ids: readonly [string, string]) { const rows = await db.select({ id: lgas.id }).from(lgas).where(inArray(lgas.id, [...ids])); return rows.length === 2; }
  async directPair(a: string, b: string) { const [row] = await db.select().from(lgaProximities).where(and(eq(lgaProximities.lgaAId, a), eq(lgaProximities.lgaBId, b))); return row ? { estimatedRoadMinutes: row.estimatedRoadMinutes, commonHubId: row.commonHubId } : null; }
  async sharedHubs(a: string, b: string): Promise<SharedHub[]> {
    const rows = await db.select({ hubId: travelHubs.id, hubName: travelHubs.name, lgaId: travelHubLgas.lgaId, minutes: travelHubLgas.estimatedMinutes }).from(travelHubLgas).innerJoin(travelHubs, eq(travelHubs.id, travelHubLgas.travelHubId)).where(and(inArray(travelHubLgas.lgaId, [a, b]), eq(travelHubs.status, 'ACTIVE')));
    const grouped = new Map<string, { hubName: string; values: Map<string, number> }>(); for (const row of rows) { const group = grouped.get(row.hubId) ?? { hubName: row.hubName, values: new Map() }; group.values.set(row.lgaId, row.minutes); grouped.set(row.hubId, group); }
    return [...grouped].flatMap(([hubId, group]) => group.values.has(a) && group.values.has(b) ? [{ hubId, hubName: group.hubName, minutesA: group.values.get(a)!, minutesB: group.values.get(b)! }] : []);
  }
  private async validateStateLga(stateId: string, lgaId?: string | null) { const [state] = await db.select().from(states).where(eq(states.id, stateId)); if (!state) throw new NotFoundException('State not found'); if (!lgaId) return { state, lga: null }; const [lga] = await db.select().from(lgas).where(eq(lgas.id, lgaId)); if (!lga) throw new NotFoundException('LGA not found'); if (lga.stateId !== stateId) throw new BadRequestException('LGA does not belong to selected State'); return { state, lga }; }
}
