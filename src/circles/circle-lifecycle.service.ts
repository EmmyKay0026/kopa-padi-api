import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/database.js';
import { circleNotifications, domainOutbox, travelCircleMembers, travelCircles, travelPlans } from '../db/schema.js';
import { circleSystemMessage } from './circle-events.js';
import { circleLockAt, confirmationAt } from './circle.domain.js';

const ACTIVE = ['JOINED', 'CONFIRMED'] as const;

@Injectable()
export class CircleLifecycleService {
  async lockDue(now = new Date()) {
    const candidates = await db.select().from(travelCircles).where(inArray(travelCircles.status, ['FORMING', 'READY', 'FULL']));
    let locked = 0;
    for (const candidate of candidates) {
      if (candidate.memberCount < 2 || circleLockAt(candidate.travelDate, candidate.departureWindow) > now) continue;
      const didLock = await db.transaction(async (tx: any) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`circle:${candidate.id}`}))`);
        const [circle] = await tx.update(travelCircles).set({ status: 'LOCKED', lockedAt: now, updatedAt: now }).where(and(eq(travelCircles.id, candidate.id), inArray(travelCircles.status, ['FORMING', 'READY', 'FULL']), sql`${travelCircles.memberCount} >= 2`)).returning();
        if (!circle) return false;
        await tx.update(travelPlans).set({ status: 'LOCKED', updatedAt: now }).where(inArray(travelPlans.id, tx.select({ id: travelCircleMembers.travelPlanId }).from(travelCircleMembers).where(and(eq(travelCircleMembers.travelCircleId, circle.id), inArray(travelCircleMembers.membershipStatus, [...ACTIVE])))));
        await circleSystemMessage(tx, circle.id, `circle-locked:${circle.id}`, 'This Travel Circle is now locked. Chat and meetup coordination remain available.');
        const members = await tx.select({ userId: travelCircleMembers.userId }).from(travelCircleMembers).where(and(eq(travelCircleMembers.travelCircleId, circle.id), inArray(travelCircleMembers.membershipStatus, [...ACTIVE])));
        for (const member of members) await tx.insert(circleNotifications).values({ userId: member.userId, travelCircleId: circle.id, type: 'CIRCLE_LOCKED', body: 'Your Travel Circle is locked. Review the final plan and keep safety first.', dedupeKey: `circle-locked:${circle.id}` }).onConflictDoNothing();
        await tx.insert(domainOutbox).values({ aggregateType: 'TRAVEL_CIRCLE', aggregateId: circle.id, eventType: 'TravelCircleLocked', payload: { circleId: circle.id, occurredAt: now.toISOString() } });
        return true;
      });
      if (didLock) locked += 1;
    }
    return { checked: candidates.length, locked };
  }

  async requestConfirmations(now = new Date()) {
    const candidates = await db.select().from(travelCircles).where(inArray(travelCircles.status, ['FORMING', 'READY', 'FULL']));
    let requested = 0;
    for (const circle of candidates) {
      if (confirmationAt(circle.travelDate, circle.departureWindow) > now) continue;
      const members = await db.select().from(travelCircleMembers).where(and(eq(travelCircleMembers.travelCircleId, circle.id), eq(travelCircleMembers.membershipStatus, 'JOINED'), isNull(travelCircleMembers.confirmedAt)));
      for (const member of members) {
        const rows = await db.insert(circleNotifications).values({ userId: member.userId, travelCircleId: circle.id, type: 'TRAVEL_CONFIRMATION_REQUIRED', body: 'Please confirm that you are still travelling with this Circle.', dedupeKey: `travel-confirmation:${circle.id}` }).onConflictDoNothing().returning();
        if (rows.length) { requested += 1; await db.insert(domainOutbox).values({ aggregateType: 'TRAVEL_CIRCLE', aggregateId: circle.id, eventType: 'TravelConfirmationRequested', payload: { circleId: circle.id, userId: member.userId, occurredAt: now.toISOString() } }); }
      }
      if (members.length) await db.transaction((tx: any) => circleSystemMessage(tx, circle.id, `confirmation-request:${circle.id}`, 'Departure is approaching. Please confirm whether you are still travelling.'));
    }
    return { checked: candidates.length, requested };
  }
}

