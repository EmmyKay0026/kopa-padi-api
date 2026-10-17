import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/db/database.js';
import { nyscIntakes, orientationCamps, pcmVerifications, towns, users } from '../src/db/schema.js';
import { GeographyService } from '../src/geography/geography.service.js';
import { MatchingService } from '../src/matching/matching.service.js';

const base = process.env.TEST_BASE_URL;
const databaseEnabled = Boolean(process.env.DATABASE_URL?.match(/kopa_padi_phase[34]/));
const suite = base && databaseEnabled ? describe : describe.skip;
const password = 'Phase3-test-password!';
const runId = crypto.randomUUID();
const identities = {
  grace: { email: `grace-${runId}@test.invalid`, name: 'Grace' },
  victor: { email: `victor-${runId}@test.invalid`, name: 'Victor' },
  unverified: { email: `unverified-${runId}@test.invalid`, name: 'Unverified' },
  revoked: { email: `revoked-${runId}@test.invalid`, name: 'Revoked' },
  suspended: { email: `suspended-${runId}@test.invalid`, name: 'Suspended' },
};
type Identity = keyof typeof identities;
const userIds = {} as Record<Identity, string>;
const cookies = {} as Record<Identity, string>;
let intakeId = '';
let campId = '';
let stateId = '';
let lgaId = '';
let townId = '';
let gracePlanId = '';
let victorPlanId = '';
const matching = new MatchingService(new GeographyService());

async function request(path: string, identity?: Identity, init: RequestInit = {}) {
  return fetch(`${base}/api${path}`, {
    ...init,
    headers: {
      origin: 'http://localhost:3000',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(identity ? { cookie: cookies[identity] } : {}),
      ...init.headers,
    },
  });
}

async function signUp(identity: Identity) {
  const data = identities[identity];
  const response = await request('/auth/sign-up/email', undefined, { method: 'POST', body: JSON.stringify({ ...data, password }) });
  expect(response.status).toBe(200);
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email));
  userIds[identity] = user.id;
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
  const login = await request('/auth/sign-in/email', undefined, { method: 'POST', body: JSON.stringify({ email: data.email, password }) });
  expect(login.status).toBe(200);
  const setCookie = login.headers.get('set-cookie') ?? '';
  const sessionCookie = setCookie.split(/,(?=[^;]+?=)/).find((value) => value.includes('session_token'));
  expect(sessionCookie).toBeTruthy();
  cookies[identity] = sessionCookie!.split(';')[0]!.trim();
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    originStateId: stateId,
    originLgaId: lgaId,
    originTownId: townId,
    intendedTravelDate: '2099-09-14',
    dateFlexibilityDays: 1,
    departureWindow: 'MORNING',
    transportMode: 'COMMERCIAL_BUS',
    transportFlexible: false,
    nearbyMatchingEnabled: true,
    groupPreference: 'ANY_VERIFIED_PCM',
    ...overrides,
  };
}

suite.sequential('Phase 3 authenticated HTTP E2E', () => {
  beforeAll(async () => {
    for (const identity of Object.keys(identities) as Identity[]) await signUp(identity);
    const [intake] = await db.select().from(nyscIntakes).limit(1);
    const [camp] = await db.select().from(orientationCamps).limit(1);
    const [town] = await db.select().from(towns).limit(1);
    intakeId = intake.id;
    campId = camp.id;
    townId = town.id;
    lgaId = town.lgaId;
    const locationResponse = await request(`/locations/lgas/${lgaId}/towns`, 'grace');
    expect(locationResponse.status).toBe(200);
    const stateResponse = await request('/locations/states', 'grace');
    const states = await stateResponse.json() as Array<{ id: string }>;
    const matchingState = await db.query.lgas.findFirst({ where: (lga, { eq }) => eq(lga.id, lgaId) });
    stateId = matchingState!.stateId;
    expect(states.some((state) => state.id === stateId)).toBe(true);
    await db.insert(pcmVerifications).values({ id: crypto.randomUUID(), userId: userIds.grace, nyscIntakeId: intakeId, orientationCampId: campId, status: 'VERIFIED', submittedAt: new Date(), reviewedAt: new Date(), verifiedAt: new Date(), reviewedBy: userIds.victor });
    await db.insert(pcmVerifications).values({ id: crypto.randomUUID(), userId: userIds.victor, nyscIntakeId: intakeId, orientationCampId: campId, status: 'VERIFIED', submittedAt: new Date(), reviewedAt: new Date(), verifiedAt: new Date(), reviewedBy: userIds.grace });
    await db.insert(pcmVerifications).values({ id: crypto.randomUUID(), userId: userIds.revoked, nyscIntakeId: intakeId, orientationCampId: campId, status: 'REVOKED', submittedAt: new Date(), reviewedAt: new Date(), reviewedBy: userIds.grace });
    await db.update(users).set({ accountStatus: 'SUSPENDED' }).where(eq(users.id, userIds.suspended));
  }, 30_000);

  afterAll(async () => { await pool.end(); });

  it('denies unverified, revoked, and suspended users', async () => {
    for (const identity of ['unverified', 'revoked', 'suspended'] as const) {
      const response = await request('/travel-plans', identity, { method: 'POST', body: JSON.stringify(plan()) });
      expect(response.status).toBe(403);
    }
  });

  it('rejects destination tampering and creates the server-derived SEARCHING plan', async () => {
    const tampered = await request('/travel-plans', 'grace', { method: 'POST', body: JSON.stringify(plan({ destinationCampId: crypto.randomUUID() })) });
    expect(tampered.status).toBe(400);
    const created = await request('/travel-plans', 'grace', { method: 'POST', body: JSON.stringify(plan()) });
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.plan.status).toBe('SEARCHING');
    expect(body.plan.destinationCampId).toBe(campId);
    expect(body.destination.id).toBe(campId);
    gracePlanId = body.plan.id;
  });

  it('persists across reload and rejects a second active plan', async () => {
    const active = await request('/travel-plans/active', 'grace');
    expect(active.status).toBe(200);
    expect((await active.json()).plan.id).toBe(gracePlanId);
    const duplicate = await request('/travel-plans', 'grace', { method: 'POST', body: JSON.stringify(plan()) });
    expect(duplicate.status).toBe(409);
  });

  it('prevents read, update, and cancellation IDOR', async () => {
    const created = await request('/travel-plans', 'victor', { method: 'POST', body: JSON.stringify(plan({ originTownId: null })) });
    victorPlanId = (await created.json()).plan.id;
    const [read, update, cancel] = await Promise.all([
      request(`/travel-plans/${victorPlanId}`, 'grace'),
      request(`/travel-plans/${victorPlanId}`, 'grace', { method: 'PATCH', body: JSON.stringify(plan()) }),
      request(`/travel-plans/${victorPlanId}/cancel`, 'grace', { method: 'POST', body: JSON.stringify({}) }),
    ]);
    expect([read.status, update.status, cancel.status]).toEqual([404, 404, 404]);
  });

  it('exposes only the authenticated member Circle and aggregate matching status', async () => {
    await matching.processBatch([gracePlanId, victorPlanId]);
    const [status, circle, offers] = await Promise.all([request('/matching/status', 'grace'), request('/travel-circles/current', 'grace'), request('/match-offers', 'grace')]);
    expect([status.status, circle.status, offers.status]).toEqual([200, 200, 200]);
    expect((await status.json()).status).toBe('FORMING');
    const circleBody = await circle.json();
    expect(circleBody.circle.memberCount).toBe(2);
    expect(circleBody.members).toHaveLength(2);
    expect(await offers.json()).toEqual([]);
  });

  it('edits, cancels idempotently, and permits recreation without a Town', async () => {
    const updated = await request(`/travel-plans/${gracePlanId}`, 'grace', { method: 'PATCH', body: JSON.stringify(plan({ departureWindow: 'AFTERNOON', nearbyMatchingEnabled: false })) });
    expect(updated.status).toBe(200);
    expect((await updated.json()).plan.departureWindow).toBe('AFTERNOON');
    const firstCancel = await request(`/travel-plans/${gracePlanId}/cancel`, 'grace', { method: 'POST', body: JSON.stringify({ reason: 'TRAVEL_NO_LONGER_NEEDED' }) });
    const secondCancel = await request(`/travel-plans/${gracePlanId}/cancel`, 'grace', { method: 'POST', body: JSON.stringify({ reason: 'OTHER' }) });
    expect([firstCancel.status, secondCancel.status]).toEqual([201, 201]);
    expect((await secondCancel.json()).plan.status).toBe('CANCELLED');
    const editCancelled = await request(`/travel-plans/${gracePlanId}`, 'grace', { method: 'PATCH', body: JSON.stringify(plan()) });
    expect(editCancelled.status).toBe(409);
    const recreated = await request('/travel-plans', 'grace', { method: 'POST', body: JSON.stringify(plan({ originTownId: null })) });
    expect(recreated.status).toBe(201);
    expect((await recreated.json()).plan.originTownId).toBeNull();
  });
});
