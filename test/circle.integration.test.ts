import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { CircleLifecycleService } from '../src/circles/circle-lifecycle.service.js';
import { CircleService } from '../src/circles/circle.service.js';
import { db, pool } from '../src/db/database.js';
import { circleMessages, domainOutbox, lgas, nyscIntakes, orientationCamps, pcmVerifications, states, travelCircleMembers, travelCircles, travelPlans, users } from '../src/db/schema.js';
import { GeographyService } from '../src/geography/geography.service.js';
import { MatchingService } from '../src/matching/matching.service.js';

const enabled = process.env.RUN_PHASE5_INTEGRATION === 'true' || Boolean(process.env.DATABASE_URL?.match(/kopa_padi_phase[45]/));
const suite = enabled ? describe : describe.skip;
const matching = new MatchingService(new GeographyService());
const circles = new CircleService(matching);
const lifecycle = new CircleLifecycleService();
let campId = ''; let intakeId = ''; let reviewerId = ''; let serial = 0;
const runYear = 2070 + (Number.parseInt(crypto.randomUUID().replaceAll('-', '').slice(0, 6), 16) % 20);
const journeyDates = { coordination: `${runYear}-10-10`, locking: `${runYear}-11-10`, pagination: `${runYear}-12-10` };

async function makePlan(date: string) {
  serial += 1; const userId = crypto.randomUUID(); const verificationId = crypto.randomUUID(); const planId = crypto.randomUUID();
  await db.insert(users).values({ id: userId, name: `Circle PCM ${serial}`, email: `phase5-${serial}-${userId}@test.invalid`, emailVerified: true });
  await db.insert(pcmVerifications).values({ id: verificationId, userId, nyscIntakeId: intakeId, orientationCampId: campId, status: 'VERIFIED', submittedAt: new Date(), reviewedAt: new Date(), verifiedAt: new Date(), reviewedBy: reviewerId });
  await db.insert(travelPlans).values({ id: planId, userId, pcmVerificationId: verificationId, originStateId: 'NG017', originLgaId: 'NG017025', destinationCampId: campId, intendedTravelDate: date, departureWindow: 'MORNING', transportMode: 'COMMERCIAL_BUS', groupPreference: 'ANY_VERIFIED_PCM', status: 'SEARCHING', expiresAt: new Date('2100-01-01') });
  return { userId, planId };
}

suite.sequential('Travel Circle PostgreSQL integration', () => {
  beforeAll(async () => { reviewerId = crypto.randomUUID(); await db.insert(users).values({ id: reviewerId, name: 'Circle reviewer', email: `phase5-reviewer-${reviewerId}@test.invalid`, emailVerified: true, role: 'ADMIN' }); await db.insert(states).values({ id: 'NG017', name: 'Phase 5 Imo', code: 'P5-IMO' }).onConflictDoNothing(); await db.insert(lgas).values({ id: 'NG017025', stateId: 'NG017', name: 'Phase 5 Owerri', slug: 'phase5-owerri' }).onConflictDoNothing(); const intakeIdentity = { serviceYear: '2096', batch: 'P5', stream: '1' }; await db.insert(nyscIntakes).values(intakeIdentity).onConflictDoNothing(); const [intake] = await db.select().from(nyscIntakes).where(and(eq(nyscIntakes.serviceYear, intakeIdentity.serviceYear), eq(nyscIntakes.batch, intakeIdentity.batch), eq(nyscIntakes.stream, intakeIdentity.stream))).limit(1); intakeId = intake.id; const campName = 'Phase 5 Integration Camp'; await db.insert(orientationCamps).values({ stateName: 'Phase 5 State', campName, stateId: 'NG017', lgaId: 'NG017025', status: 'ACTIVE' }).onConflictDoNothing(); const [camp] = await db.select().from(orientationCamps).where(eq(orientationCamps.campName, campName)).limit(1); campId = camp.id; });
  afterAll(async () => { await pool.end(); });

  it('enforces membership privacy, chat ordering, read state, soft deletion, confirmation, and meetup agreement', async () => {
    const members = await Promise.all([makePlan(journeyDates.coordination), makePlan(journeyDates.coordination), makePlan(journeyDates.coordination)]); const outsider = await makePlan(`${runYear}-10-11`);
    await matching.processBatch(members.map((member) => member.planId));
    const current = await circles.current(members[0]!.userId); expect(current?.circle.memberCount).toBe(3); expect(current?.members).toHaveLength(3);
    await expect(circles.messages(outsider.userId, { limit: 50 })).rejects.toThrow('active Circle membership');
    const first = await circles.postMessage(members[0]!.userId, 'First'); const second = await circles.postMessage(members[1]!.userId, 'Second');
    const page = await circles.messages(members[0]!.userId, { limit: 50 }); expect(page.messages.slice(-2).map((message) => message.body)).toEqual(['First', 'Second']);
    await circles.markRead(members[0]!.userId, second.id); expect((await circles.current(members[0]!.userId))?.unreadCount).toBe(0);
    await expect(circles.deleteMessage(members[1]!.userId, first.id)).rejects.toThrow('Message not found'); await circles.deleteMessage(members[0]!.userId, first.id);
    expect((await circles.messages(members[0]!.userId, { limit: 50 })).messages.find((message) => message.id === first.id)?.body).toBe('Message deleted');
    await circles.confirmTravel(members[0]!.userId); await circles.confirmTravel(members[0]!.userId); expect((await circles.current(members[0]!.userId))?.membership.membershipStatus).toBe('CONFIRMED');
    const meetup = await circles.proposeMeetup(members[0]!.userId, { areaLabel: 'Main park', locationDescription: 'Inside the staffed ticket hall' });
    await Promise.all(members.map((member) => circles.confirmMeetup(member.userId, meetup.id))); expect((await circles.currentMeetup(members[0]!.userId))?.status).toBe('AGREED');
  }, 30_000);

  it('locks a two-member Circle idempotently, keeps coordination open, rejects new joins, and does not rematch after a locked departure', async () => {
    const [a, b, late] = await Promise.all([makePlan(journeyDates.locking), makePlan(journeyDates.locking), makePlan(journeyDates.locking)]);
    await matching.processBatch([a.planId, b.planId]); const formed = await circles.current(a.userId); expect(formed?.circle.memberCount).toBe(2);
    await db.update(travelCircles).set({ travelDate: '2026-01-01' }).where(eq(travelCircles.id, formed!.circle.id));
    const first = await lifecycle.lockDue(new Date('2026-01-02T00:00:00Z')); const second = await lifecycle.lockDue(new Date('2026-01-02T00:00:00Z'));
    expect(first.locked).toBeGreaterThanOrEqual(1); expect(second.locked).toBe(0); expect((await circles.current(a.userId))?.circle.status).toBe('LOCKED');
    await circles.postMessage(a.userId, 'Locked chat remains open'); expect((await circles.messages(b.userId, { limit: 50 })).messages.at(-1)?.body).toBe('Locked chat remains open');
    await matching.processPlan(late.planId); const lockedRow = (await db.select().from(travelCircles).where(eq(travelCircles.id, formed!.circle.id)))[0]!; expect(lockedRow.memberCount).toBe(2);
    await circles.leave(a.userId); await expect(circles.messages(a.userId, { limit: 50 })).rejects.toThrow('active Circle membership');
    const dissolved = (await db.select().from(travelCircles).where(eq(travelCircles.id, formed!.circle.id)))[0]!; expect(dissolved.status).toBe('DISSOLVED');
    const rematches = await db.select().from(domainOutbox).where(and(eq(domainOutbox.aggregateId, a.planId), eq(domainOutbox.eventType, 'TravelPlanRematchRequested'))); expect(rematches).toHaveLength(0);
    const memberships = await db.select().from(travelCircleMembers).where(eq(travelCircleMembers.travelCircleId, formed!.circle.id)); expect(memberships.every((membership) => !['JOINED', 'CONFIRMED'].includes(membership.membershipStatus))).toBe(true);
  }, 30_000);

  it('paginates a large conversation without duplicates', async () => {
    const [a, b] = await Promise.all([makePlan(journeyDates.pagination), makePlan(journeyDates.pagination)]); await matching.processBatch([a.planId, b.planId]); const current = await circles.current(a.userId);
    const conversationId = (await db.query.circleConversations.findFirst({ where: (conversation, { eq }) => eq(conversation.travelCircleId, current!.circle.id) }))!.id;
    await db.insert(circleMessages).values(Array.from({ length: 600 }, (_, index) => ({ conversationId, senderUserId: a.userId, type: 'TEXT' as const, body: `Bulk ${String(index).padStart(3, '0')}`, createdAt: new Date(Date.UTC(runYear, 11, 1, 0, 0, 0, index)) })));
    const newest = await circles.messages(a.userId, { limit: 100 }); const older = await circles.messages(a.userId, { before: newest.nextCursor!, limit: 100 });
    expect(newest.messages).toHaveLength(100); expect(older.messages).toHaveLength(100); expect(new Set([...newest.messages, ...older.messages].map((message) => message.id)).size).toBe(200);
  }, 30_000);
});
