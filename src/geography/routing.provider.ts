export interface RouteEstimate { durationMinutes: number; distanceKm: number }
export interface RoutingProvider { getRouteDuration(origin: { latitude: number; longitude: number }, destination: { latitude: number; longitude: number }): Promise<RouteEstimate> }
export class OsrmRoutingProvider implements RoutingProvider {
  constructor(private readonly baseUrl = process.env.OSRM_BASE_URL ?? 'https://router.project-osrm.org') {}
  async getRouteDuration(origin: { latitude: number; longitude: number }, destination: { latitude: number; longitude: number }) {
    const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const response = await fetch(`${this.baseUrl}/route/v1/driving/${coordinates}?overview=false`);
    if (!response.ok) throw new Error(`OSRM request failed (${response.status})`);
    const body = await response.json() as { code: string; routes?: Array<{ duration: number; distance: number }> };
    const route = body.routes?.[0]; if (body.code !== 'Ok' || !route) throw new Error('OSRM returned no route');
    return { durationMinutes: Math.ceil(route.duration / 60), distanceKm: Math.round(route.distance / 10) / 100 };
  }
}
