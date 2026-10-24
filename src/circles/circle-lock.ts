import { randomUUID, createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/database.js';
import { circleLockRequests, circleNotifications, domainOutbox, travelCircleMembers, travelCircles, travelPlans } from '../db/schema.js';
import { circleSystemMessage } from './circle-events.js';

const OPEN = ['FORMING', 'READY', 'FULL'] as const;
const ACTIVE = ['JOINED', 'CONFIRMED'];
export const lockThreshold = (members: number) => Math.max(2, Math.ceil(members / 2));
export const LOCK_WARNING = `Locking is permanent. This Circle will close to new members and cannot be unlocked. Locking does not change the departure schedule or start anyone's journey automatically.`;

// Shared by the automatic worker and approval path; callers hold the Circle lock.
export async function permanentlyLockCircle(tx: any, circleId: string, now: Date) {
  const [circle] = await tx.update(travelCircles).set({ status: 'LOCKED', lockedAt: now, updatedAt: now })
    .where(and(eq(travelCircles.id, circleId), inArray(travelCircles.status, [...OPEN]), sql`${travelCircles.memberCount} >= 2`)).returning();
  if (!circle) return false;
  const members = await tx.select().from(travelCircleMembers).where(and(eq(travelCircleMembers.travelCircleId, circleId), inArray(travelCircleMembers.membershipStatus, ['JOINED', 'CONFIRMED'])));
  await tx.update(travelPlans).set({ status: 'LOCKED', updatedAt: now }).where(inArray(travelPlans.id, members.map((m: any) => m.travelPlanId)));
  await circleSystemMessage(tx, circleId, `circle-locked:${circleId}`, 'This Travel Circle is permanently locked and cannot be unlocked. New members cannot join. The agreed departure schedule is unchanged. Each member must start their own journey when ready. Chat and meetup coordination remain available.');
  for (const member of members) await tx.insert(circleNotifications).values({ userId: member.userId, travelCircleId: circleId, type: 'CIRCLE_LOCKED', body: 'Your Circle is permanently locked. Review the agreed plan before starting your own journey.', dedupeKey: `circle-locked:${circleId}` }).onConflictDoNothing();
  await tx.insert(domainOutbox).values({ aggregateType: 'TRAVEL_CIRCLE', aggregateId: circleId, eventType: 'TravelCircleLocked', payload: { circleId, occurredAt: now.toISOString() } });
  return true;
}

export async function invalidateCircleLockApprovals(tx: any, circleId: string) {
  const removed = await tx.delete(circleLockRequests).where(eq(circleLockRequests.travelCircleId, circleId)).returning();
  if (removed.some((request: any) => request.approvals.length)) await circleSystemMessage(tx, circleId, `lock-reset:${randomUUID()}`, 'Circle membership changed. Earlier lock approvals no longer count. Review the current group and departure plan before approving again.');
}

export function lockSnapshot(circle: { id: string; travelDate: string; departureWindow: string; transportMode: string }, members: Array<{ id: string; membershipStatus: string }>) {
  // Include inactive membership history: leaving and rejoining cannot revive old approvals.
  const roster = members.map(m => [m.id, ACTIVE.includes(m.membershipStatus)]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash('sha256').update(JSON.stringify([circle.id, circle.travelDate, circle.departureWindow, circle.transportMode, roster])).digest('hex');
}

@Injectable()
export class CircleLockService {
  private async state(tx: any, userId: string, lock: boolean) {
    const [member] = await tx.select().from(travelCircleMembers).where(and(eq(travelCircleMembers.userId, userId), inArray(travelCircleMembers.membershipStatus, ['JOINED', 'CONFIRMED']))).limit(1);
    if (!member) throw new NotFoundException('No active Travel Circle');
    if (lock) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`circle:${member.travelCircleId}`}))`);
    const query = tx.select().from(travelCircles).where(eq(travelCircles.id, member.travelCircleId));
    const [circle] = lock ? await query.for('update') : await query;
    if (!circle) throw new NotFoundException('No active Travel Circle');
    const members = await tx.select().from(travelCircleMembers).where(eq(travelCircleMembers.travelCircleId, circle.id));
    if (!members.some((m: any) => m.userId === userId && ACTIVE.includes(m.membershipStatus))) throw new ForbiddenException('Current Circle membership required');
    const active = members.filter((m: any) => ACTIVE.includes(m.membershipStatus));
    const snapshot = lockSnapshot(circle, members);
    const [request] = await tx.select().from(circleLockRequests).where(eq(circleLockRequests.travelCircleId, circle.id));
    const approvals: string[] = request?.snapshot === snapshot ? request.approvals.filter((id: string) => active.some((m: any) => m.userId === id)) : [];
    return { circle, active, snapshot, request, approvals };
  }
  private summary(s: Awaited<ReturnType<CircleLockService['state']>>, userId: string) {
    return { circleId: s.circle.id, snapshot: s.snapshot, approvals: s.approvals.length, required: lockThreshold(s.active.length), members: s.active.length, approved: s.approvals.includes(userId), locked: ['LOCKED', 'IN_JOURNEY', 'ARRIVED'].includes(s.circle.status), canApprove: OPEN.includes(s.circle.status as any) && s.active.length >= 2, reset: Boolean(s.request && s.request.snapshot !== s.snapshot) };
  }
  async status(userId: string) { return db.transaction(async tx => this.summary(await this.state(tx, userId, false), userId)); }
  async approve(userId: string, body: { snapshot: string; approve: boolean }) {
    return db.transaction(async tx => {
      const s = await this.state(tx, userId, true);
      if (s.snapshot !== body.snapshot) throw new ConflictException('Circle membership or departure plan changed. Review the latest plan before approving.');
      if (!OPEN.includes(s.circle.status as any)) {
        if (!body.approve) throw new ConflictException('Circle is permanently locked. Approval cannot be withdrawn.');
        return this.summary(s, userId);
      }
      if (s.active.length < 2 || s.active.length !== s.circle.memberCount) throw new ConflictException('Circle membership changed. Refresh and try again.');
      const hadApproval = s.approvals.includes(userId);
      if (hadApproval === body.approve && !s.request?.snapshot) return this.summary(s, userId);
      if (s.request && s.request.snapshot !== s.snapshot) await circleSystemMessage(tx, s.circle.id, `lock-reset:${randomUUID()}`, 'The Circle membership or departure plan changed. Earlier lock approvals no longer count. Please review the current plan and approve again.');
      if (hadApproval === body.approve && s.request?.snapshot === s.snapshot) return this.summary(s, userId);
      if (!s.approvals.length && body.approve) await circleSystemMessage(tx, s.circle.id, `lock-request:${randomUUID()}`, `A member requested a permanent Circle lock. ${LOCK_WARNING} At least ${lockThreshold(s.active.length)} of ${s.active.length} current members must approve. Approvals may be withdrawn only before the Circle locks.`);
      s.approvals = body.approve ? [...s.approvals, userId] : s.approvals.filter(id => id !== userId);
      await tx.insert(circleLockRequests).values({ travelCircleId: s.circle.id, snapshot: s.snapshot, approvals: s.approvals }).onConflictDoUpdate({ target: circleLockRequests.travelCircleId, set: { snapshot: s.snapshot, approvals: s.approvals, updatedAt: new Date() } });
      await circleSystemMessage(tx, s.circle.id, `lock-vote:${randomUUID()}`, `A member ${body.approve ? 'approved the permanent lock' : 'withdrew their lock approval'}. ${s.approvals.length} of ${lockThreshold(s.active.length)} required approvals received. Once locked, the Circle cannot be unlocked.`);
      if (s.approvals.length >= lockThreshold(s.active.length)) {
        await permanentlyLockCircle(tx, s.circle.id, new Date());
        s.circle.status = 'LOCKED';
      }
      return this.summary(s, userId);
    });
  }
}
