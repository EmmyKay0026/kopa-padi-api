export type CompatibilityRelationship = 'SAME_LGA' | 'NEARBY_LGA' | 'COMMON_HUB' | 'NOT_COMPATIBLE' | 'UNKNOWN';
export interface DirectProximity { estimatedRoadMinutes: number; commonHubId?: string | null }
export interface SharedHub { hubId: string; hubName: string; minutesA: number; minutesB: number }
export interface CompatibilityDataSource {
  lgasExist(ids: readonly [string, string]): Promise<boolean>;
  directPair(a: string, b: string): Promise<DirectProximity | null>;
  sharedHubs(a: string, b: string): Promise<SharedHub[]>;
}
export interface CompatibilityResult { compatible: boolean; relationship: CompatibilityRelationship; estimatedRoadMinutes: number | null; commonHubId: string | null; reason: 'SAME_LGA' | 'WITHIN_60_MINUTES' | 'COMMON_HUB_WITHIN_60_MINUTES' | 'OVER_60_MINUTES' | 'INSUFFICIENT_DATA' }
export function normalizeLgaPair(a: string, b: string): readonly [string, string] { return a.localeCompare(b) < 0 ? [a, b] : [b, a]; }

export class GeographyCompatibilityEngine {
  constructor(private readonly source: CompatibilityDataSource) {}
  async evaluate(originLgaA: string, originLgaB: string): Promise<CompatibilityResult> {
    if (originLgaA === originLgaB) return { compatible: true, relationship: 'SAME_LGA', estimatedRoadMinutes: 0, commonHubId: null, reason: 'SAME_LGA' };
    const [a, b] = normalizeLgaPair(originLgaA, originLgaB);
    if (!(await this.source.lgasExist([a, b]))) return { compatible: false, relationship: 'UNKNOWN', estimatedRoadMinutes: null, commonHubId: null, reason: 'INSUFFICIENT_DATA' };
    const direct = await this.source.directPair(a, b);
    if (direct && direct.estimatedRoadMinutes <= 60) return { compatible: true, relationship: 'NEARBY_LGA', estimatedRoadMinutes: direct.estimatedRoadMinutes, commonHubId: direct.commonHubId ?? null, reason: 'WITHIN_60_MINUTES' };
    const hubs = await this.source.sharedHubs(a, b);
    const eligible = hubs.filter((hub) => Math.max(hub.minutesA, hub.minutesB) <= 60).sort((x, y) => Math.max(x.minutesA, x.minutesB) - Math.max(y.minutesA, y.minutesB) || x.hubId.localeCompare(y.hubId))[0];
    if (eligible) return { compatible: true, relationship: 'COMMON_HUB', estimatedRoadMinutes: Math.max(eligible.minutesA, eligible.minutesB), commonHubId: eligible.hubId, reason: 'COMMON_HUB_WITHIN_60_MINUTES' };
    if (direct || hubs.length) return { compatible: false, relationship: 'NOT_COMPATIBLE', estimatedRoadMinutes: direct?.estimatedRoadMinutes ?? null, commonHubId: null, reason: 'OVER_60_MINUTES' };
    return { compatible: false, relationship: 'UNKNOWN', estimatedRoadMinutes: null, commonHubId: null, reason: 'INSUFFICIENT_DATA' };
  }
}
