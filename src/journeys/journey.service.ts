import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { db } from '../db/database.js';
import { circleMessages, domainOutbox, journeyCheckIns, journeyLocationShares, journeyReminders, journeySafetyChecklist, journeyShares, journeys, orientationCamps, pcmProfiles, notificationOutbox, travelCircleMembers, travelCircles, travelPlans, trustedContacts, users } from '../db/schema.js';
import { enqueueEmail } from '../email/email.service.js';
import { circleSystemMessage } from '../circles/circle-events.js';
import { checklistItems, locationSharingPolicy, shareExpiry } from './journey.domain.js';
import { JourneyGuideResolver } from '../journey-guides/journey-guide.service.js';
import { enabled } from '../config/runtime.js';

const ACTIVE_JOURNEYS = ['PREPARING', 'READY_TO_START', 'IN_PROGRESS', 'NEEDS_ATTENTION', 'ARRIVED'] as const;
const ACTIVE_MEMBERS = ['JOINED', 'CONFIRMED'] as const;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class JourneyService {
  constructor(private readonly guideResolver: JourneyGuideResolver) {}
  async prepare(userId: string, expectedArrivalAt?: string) {
    const existing = await this.current(userId, false); if (existing) return existing;
    const [plan] = await db.select().from(travelPlans).where(and(eq(travelPlans.userId, userId), inArray(travelPlans.status, ['SEARCHING', 'IN_CIRCLE', 'LOCKED']))).orderBy(desc(travelPlans.updatedAt)).limit(1);
    if (!plan) throw new ConflictException('An active Travel Plan is required');
    const [membership] = await db.select({ member: travelCircleMembers, circle: travelCircles }).from(travelCircleMembers).innerJoin(travelCircles, eq(travelCircles.id, travelCircleMembers.travelCircleId)).where(and(eq(travelCircleMembers.travelPlanId, plan.id), inArray(travelCircleMembers.membershipStatus, [...ACTIVE_MEMBERS]))).limit(1);
    const resolution = await this.guideResolver.resolve({ originStateId: plan.originStateId, originLgaId: plan.originLgaId, originTownId: plan.originTownId, destinationCampId: plan.destinationCampId });
    const resolvedGuide = 'guide' in resolution ? resolution.guide : null;
    try { await db.transaction(async (tx: any) => { const [journey] = await tx.insert(journeys).values({ userId, travelPlanId: plan.id, travelCircleId: membership?.circle.id ?? null, journeyGuideId: resolvedGuide?.id ?? null, journeyGuideVersion: resolvedGuide?.version ?? null, originStateId: plan.originStateId, originLgaId: plan.originLgaId, originTownId: plan.originTownId, destinationCampId: plan.destinationCampId, travelDate: membership?.circle.travelDate ?? plan.intendedTravelDate, departureWindow: membership?.circle.departureWindow ?? plan.departureWindow, transportMode: membership?.circle.transportMode ?? plan.transportMode, journeyMode: membership ? 'CIRCLE' : 'SOLO', expectedArrivalAt: expectedArrivalAt ? new Date(expectedArrivalAt) : null }).returning(); await tx.insert(journeySafetyChecklist).values(checklistItems.map((item) => ({ journeyId: journey.id, ...item }))); await this.event(tx, 'JourneyPreparing', journey.id, userId); }); } catch (error: any) { if (error?.code === '23505' || error?.cause?.code === '23505') return this.current(userId); throw error; }
    return this.current(userId);
  }

  async current(userId: string): Promise<any>;
  async current(userId: string, required: false): Promise<any | null>;
  async current(userId: string, required = true): Promise<any | null> {
    const [journey] = await db.select().from(journeys).where(and(eq(journeys.userId, userId), inArray(journeys.status, [...ACTIVE_JOURNEYS]))).orderBy(desc(journeys.createdAt)).limit(1);
    if (!journey) { if (required) throw new NotFoundException('No active Journey'); return null; }
    const [destination, checklist, contacts, checkIns, shares, trustedLocation, circleLocation] = await Promise.all([
      db.select({ name: orientationCamps.campName, address: orientationCamps.officialAddress }).from(orientationCamps).where(eq(orientationCamps.id, journey.destinationCampId)).limit(1).then((r) => r[0]),
      db.select().from(journeySafetyChecklist).where(eq(journeySafetyChecklist.journeyId, journey.id)).orderBy(asc(journeySafetyChecklist.itemKey)),
      db.select().from(trustedContacts).where(and(eq(trustedContacts.userId, userId), eq(trustedContacts.isActive, true))).orderBy(asc(trustedContacts.name)),
      db.select({ id: journeyCheckIns.id, type: journeyCheckIns.type, message: journeyCheckIns.message, createdAt: journeyCheckIns.createdAt }).from(journeyCheckIns).where(eq(journeyCheckIns.journeyId, journey.id)).orderBy(desc(journeyCheckIns.createdAt), desc(journeyCheckIns.id)).limit(20),
      db.select({ id: journeyShares.id, trustedContactId: journeyShares.trustedContactId, status: journeyShares.status, expiresAt: journeyShares.expiresAt }).from(journeyShares).where(eq(journeyShares.journeyId, journey.id)).orderBy(desc(journeyShares.createdAt)),
      ...(['TRUSTED_CONTACT', 'CIRCLE'] as const).map(audience => db.select({ id: journeyLocationShares.id, audience: journeyLocationShares.audience, sharedAt: journeyLocationShares.sharedAt, expiresAt: journeyLocationShares.expiresAt }).from(journeyLocationShares).where(and(eq(journeyLocationShares.journeyId, journey.id), eq(journeyLocationShares.audience, audience))).orderBy(desc(journeyLocationShares.sharedAt), desc(journeyLocationShares.id)).limit(1)),
    ]);
    return { journey, destination, checklist, contacts, checkIns, shares, locationShares: [...trustedLocation, ...circleLocation], locationSharing: locationSharingPolicy(), emergencyNumbers: { general: process.env.NIGERIA_EMERGENCY_NUMBER ?? '112', road: process.env.NIGERIA_ROAD_EMERGENCY_NUMBER ?? '122' } };
  }

  async checklist(userId: string, itemKey: string, completed: boolean) { const current = await this.current(userId); if (!['PREPARING', 'READY_TO_START'].includes(current.journey.status)) throw new ConflictException('Checklist is closed after Journey start'); const [row] = await db.update(journeySafetyChecklist).set({ completed, completedAt: completed ? new Date() : null }).where(and(eq(journeySafetyChecklist.journeyId, current.journey.id), eq(journeySafetyChecklist.itemKey, itemKey))).returning(); if (!row) throw new NotFoundException('Checklist item not found'); return row; }
  async ready(userId: string) { const current = await this.current(userId); if (current.journey.status === 'READY_TO_START') return current; if (current.journey.status !== 'PREPARING') throw new ConflictException('Journey cannot be marked ready'); await db.update(journeys).set({ status: 'READY_TO_START', updatedAt: new Date() }).where(and(eq(journeys.id, current.journey.id), eq(journeys.status, 'PREPARING'))); return this.current(userId); }

  async start(userId: string) {
    if(!enabled('JOURNEY_START_ENABLED',true))throw new ConflictException('New Journey starts are temporarily paused');
    const result = await db.transaction(async (tx: any) => { await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`journey-start:${userId}`}))`); const [journey] = await tx.select().from(journeys).where(and(eq(journeys.userId, userId), inArray(journeys.status, [...ACTIVE_JOURNEYS]))).limit(1); if (!journey) throw new NotFoundException('No prepared Journey'); if (['IN_PROGRESS', 'NEEDS_ATTENTION', 'ARRIVED'].includes(journey.status)) return { journey, changed: false }; if (journey.status !== 'READY_TO_START') throw new ConflictException('Complete preparation before starting'); if (journey.travelCircleId) { const [circle] = await tx.select().from(travelCircles).where(eq(travelCircles.id, journey.travelCircleId)).limit(1); if (!circle || !['LOCKED', 'IN_JOURNEY'].includes(circle.status)) throw new ConflictException('Circle Journey can start after the Circle is locked'); }
      const now = new Date(); const [started] = await tx.update(journeys).set({ status: 'IN_PROGRESS', startedAt: now, lastCheckInAt: now, lastSafeAt: now, updatedAt: now }).where(and(eq(journeys.id, journey.id), eq(journeys.status, 'READY_TO_START'))).returning(); if (!started) return { journey, changed: false }; await tx.update(travelPlans).set({ status: 'IN_JOURNEY', updatedAt: now }).where(and(eq(travelPlans.id, journey.travelPlanId), inArray(travelPlans.status, ['SEARCHING', 'IN_CIRCLE', 'LOCKED']))); if (journey.travelCircleId) await tx.update(travelCircles).set({ status: 'IN_JOURNEY', updatedAt: now }).where(and(eq(travelCircles.id, journey.travelCircleId), eq(travelCircles.status, 'LOCKED'))); await tx.insert(journeyCheckIns).values({ journeyId: journey.id, userId, type: 'STARTED', clientRequestId: journey.id, createdAt: now }).onConflictDoNothing(); await this.event(tx, 'JourneyStarted', journey.id, userId); await this.notifyTrusted(userId, journey.id, 'JOURNEY_STARTED', tx); return { journey: started, changed: true }; });
    return this.current(userId);
  }

  async checkIn(userId: string, input: { type: 'SAFE'|'CONNECTION_REACHED'|'NEAR_DESTINATION'|'NEED_HELP'; clientRequestId: string; message?: string; includeLocation: boolean; latitude?: number; longitude?: number }) {
    const result = await db.transaction(async (tx: any) => { const [journey] = await tx.select().from(journeys).where(and(eq(journeys.userId, userId), inArray(journeys.status, ['IN_PROGRESS', 'NEEDS_ATTENTION']))).limit(1); if (!journey) throw new ConflictException('Journey is not in progress'); const now = new Date(); const [checkIn] = await tx.insert(journeyCheckIns).values({ journeyId: journey.id, userId, type: input.type, clientRequestId: input.clientRequestId, message: input.message, latitude: input.includeLocation ? String(input.latitude) : null, longitude: input.includeLocation ? String(input.longitude) : null, createdAt: now }).onConflictDoNothing().returning(); if (!checkIn) { const [existing] = await tx.select().from(journeyCheckIns).where(and(eq(journeyCheckIns.journeyId, journey.id), eq(journeyCheckIns.clientRequestId, input.clientRequestId))).limit(1); return { journey, checkIn: existing, changed: false }; } const status = input.type === 'NEED_HELP' ? 'NEEDS_ATTENTION' : journey.status === 'NEEDS_ATTENTION' && input.type === 'SAFE' ? 'IN_PROGRESS' : journey.status; await tx.update(journeys).set({ status, lastCheckInAt: now, lastSafeAt: input.type === 'SAFE' ? now : journey.lastSafeAt, updatedAt: now }).where(eq(journeys.id, journey.id)); await this.event(tx, input.type === 'NEED_HELP' ? 'JourneyNeedsHelp' : 'JourneyCheckInCreated', journey.id, userId); if (['SAFE','NEAR_DESTINATION'].includes(input.type)) await this.notifyTrusted(userId, journey.id, input.type, tx); return { journey: { ...journey, status }, checkIn, changed: true }; });
    return result;
  }

  async arrive(userId: string, clientRequestId: string) { const result = await db.transaction(async (tx: any) => { await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`journey-arrive:${userId}`}))`); const [journey] = await tx.select().from(journeys).where(and(eq(journeys.userId, userId), inArray(journeys.status, [...ACTIVE_JOURNEYS]))).limit(1); if (!journey) throw new NotFoundException('No active Journey'); if (journey.status === 'ARRIVED') return { journey, changed: false }; if (!['IN_PROGRESS', 'NEEDS_ATTENTION'].includes(journey.status)) throw new ConflictException('Journey has not started'); const now = new Date(); const [arrived] = await tx.update(journeys).set({ status: 'ARRIVED', arrivedAt: now, lastCheckInAt: now, lastSafeAt: now, updatedAt: now }).where(and(eq(journeys.id, journey.id), inArray(journeys.status, ['IN_PROGRESS', 'NEEDS_ATTENTION']))).returning(); if (!arrived) return { journey, changed: false }; await tx.insert(journeyCheckIns).values({ journeyId: journey.id, userId, type: 'ARRIVED', clientRequestId, createdAt: now }).onConflictDoNothing(); await tx.update(travelPlans).set({ status: 'COMPLETED', updatedAt: now }).where(eq(travelPlans.id, journey.travelPlanId)); await tx.update(journeyShares).set({ expiresAt: new Date(now.getTime() + Number(process.env.JOURNEY_SHARE_AFTER_COMPLETION_HOURS ?? 24) * 3_600_000) }).where(and(eq(journeyShares.journeyId, journey.id), eq(journeyShares.status, 'ACTIVE'))); await this.event(tx, 'JourneyArrived', journey.id, userId); await this.notifyTrusted(userId, journey.id, 'ARRIVED', tx); await this.updateCircleArrival(tx, journey.travelCircleId); return { journey: arrived, changed: true }; }); return this.current(userId); }
  async complete(userId: string) { const current = await this.current(userId, false); if (!current) { const [completed] = await db.select().from(journeys).where(and(eq(journeys.userId, userId), eq(journeys.status, 'COMPLETED'))).orderBy(desc(journeys.completedAt)).limit(1); if (completed) return completed; throw new NotFoundException('No arrived Journey'); } if (current.journey.status !== 'ARRIVED') throw new ConflictException('Confirm arrival first'); const now = new Date(); await db.transaction(async (tx: any) => { const [row] = await tx.update(journeys).set({ status: 'COMPLETED', completedAt: now, updatedAt: now }).where(and(eq(journeys.id, current.journey.id), eq(journeys.status, 'ARRIVED'))).returning(); if (row) await this.event(tx, 'JourneyCompleted', row.id, userId); }); return this.historyItem(userId, current.journey.id); }
  async cancel(userId: string, reason: string) { const current = await this.current(userId); if (current.journey.status === 'ARRIVED') throw new ConflictException('Complete the arrived Journey instead'); const now = new Date(); await db.transaction(async (tx: any) => { await tx.update(journeys).set({ status: 'CANCELLED', cancelledAt: now, cancellationReason: reason, updatedAt: now }).where(and(eq(journeys.id, current.journey.id), inArray(journeys.status, ['PREPARING', 'READY_TO_START', 'IN_PROGRESS', 'NEEDS_ATTENTION']))); await tx.update(travelPlans).set({ status: 'CANCELLED', cancelledAt: now, cancellationReason: 'OTHER', updatedAt: now }).where(eq(travelPlans.id, current.journey.travelPlanId)); await tx.update(journeyShares).set({ status: 'REVOKED', revokedAt: now }).where(and(eq(journeyShares.journeyId, current.journey.id), eq(journeyShares.status, 'ACTIVE'))); await this.event(tx, 'JourneyCancelled', current.journey.id, userId); }); return { cancelled: true }; }

  contacts(userId: string) { return db.select().from(trustedContacts).where(and(eq(trustedContacts.userId, userId), eq(trustedContacts.isActive, true))).orderBy(asc(trustedContacts.name)); }
  async createContact(userId: string, input: any) { const [row] = await db.insert(trustedContacts).values({ userId, ...input }).returning(); return row; }
  async updateContact(userId: string, id: string, input: any) { const [row] = await db.update(trustedContacts).set({ ...input, updatedAt: new Date() }).where(and(eq(trustedContacts.id, id), eq(trustedContacts.userId, userId), eq(trustedContacts.isActive, true))).returning(); if (!row) throw new NotFoundException('Trusted contact not found'); return row; }
  async deleteContact(userId: string, id: string) { const [row] = await db.update(trustedContacts).set({ isActive: false, updatedAt: new Date() }).where(and(eq(trustedContacts.id, id), eq(trustedContacts.userId, userId), eq(trustedContacts.isActive, true))).returning(); if (!row) throw new NotFoundException('Trusted contact not found'); await db.update(journeyShares).set({ status: 'REVOKED', revokedAt: new Date() }).where(and(eq(journeyShares.trustedContactId, id), eq(journeyShares.status, 'ACTIVE'))); return { deleted: true }; }

  async createShare(userId: string, contactId: string) { const current = await this.current(userId); const [contact] = await db.select().from(trustedContacts).where(and(eq(trustedContacts.id, contactId), eq(trustedContacts.userId, userId), eq(trustedContacts.isActive, true))).limit(1); if (!contact) throw new NotFoundException('Trusted contact not found'); const rawToken = randomBytes(32).toString('base64url'); const tokenHash = hashToken(rawToken); const expiresAt = shareExpiry(); await db.transaction(async (tx: any) => { await tx.update(journeyShares).set({ status: 'REVOKED', revokedAt: new Date() }).where(and(eq(journeyShares.journeyId, current.journey.id), eq(journeyShares.trustedContactId, contactId), eq(journeyShares.status, 'ACTIVE'))); await tx.insert(journeyShares).values({ journeyId: current.journey.id, trustedContactId: contactId, tokenHash, expiresAt }); await this.event(tx, 'JourneyShareCreated', current.journey.id, userId); }); return { url: `${process.env.WEB_URL ?? 'http://localhost:3000'}/journey-share/${rawToken}`, expiresAt }; }
  async sharing(userId: string) {
    const owned = db.select({ id: journeys.id }).from(journeys).where(eq(journeys.userId,userId));
    const now = new Date();
    const alerts = await db.select({sentAt:notificationOutbox.sentAt,attempts:notificationOutbox.attempts,lastError:notificationOutbox.lastError}).from(notificationOutbox).where(and(eq(notificationOutbox.userId,userId),eq(notificationOutbox.type,'JOURNEY_SAFETY')));
    return {
      notifications: { providerAccepted:alerts.filter(x=>x.sentAt).length, queued:alerts.filter(x=>!x.sentAt && Number(x.attempts)<5 && !x.lastError).length, awaitingRetry:alerts.filter(x=>!x.sentAt && Number(x.attempts)<5 && x.lastError).length, failedOrCancelled:alerts.filter(x=>!x.sentAt && Number(x.attempts)>=5).length },
      shares: await db.select({ id: journeyShares.id, journeyId: journeyShares.journeyId, expiresAt: journeyShares.expiresAt }).from(journeyShares).where(and(inArray(journeyShares.journeyId,owned),eq(journeyShares.status,'ACTIVE'),gt(journeyShares.expiresAt,now))),
      locations: await db.select({ id: journeyLocationShares.id, audience: journeyLocationShares.audience, expiresAt: journeyLocationShares.expiresAt }).from(journeyLocationShares).where(and(inArray(journeyLocationShares.journeyId,owned),gt(journeyLocationShares.expiresAt,now))),
    };
  }
  async revokeShares(userId: string) {
    return db.transaction(async tx => {
      const owned = tx.select({id:journeys.id}).from(journeys).where(eq(journeys.userId,userId));
      const rows = await tx.update(journeyShares).set({status:'REVOKED',revokedAt:new Date()}).where(and(inArray(journeyShares.journeyId,owned),eq(journeyShares.status,'ACTIVE'))).returning({journeyId:journeyShares.journeyId});
      for (const id of new Set(rows.map(row=>row.journeyId))) await this.event(tx,'JourneyShareRevoked',id,userId);
      return {revoked:rows.length};
    });
  }
  async withdrawLocation(userId: string) {
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`journey-location:${userId}`}))`);
      const owned = tx.select({ id: journeys.id }).from(journeys).where(eq(journeys.userId,userId));
      const rows = await tx.update(journeyLocationShares).set({expiresAt:new Date()}).where(and(inArray(journeyLocationShares.journeyId,owned),gt(journeyLocationShares.expiresAt,new Date()))).returning({id:journeyLocationShares.id});
      return {withdrawn:rows.length};
    });
  }
  async circleLocations(userId: string) {
    const current = await this.current(userId);
    const circleId = current.journey.travelCircleId;
    if (!circleId) return [];
    const [membership] = await db.select({id:travelCircleMembers.id}).from(travelCircleMembers).where(and(eq(travelCircleMembers.userId,userId),eq(travelCircleMembers.travelCircleId,circleId),inArray(travelCircleMembers.membershipStatus,[...ACTIVE_MEMBERS]))).limit(1);
    if (!membership) throw new ForbiddenException('An active Circle membership is required');
    return db.select({id:journeyLocationShares.id,userId:journeys.userId,latitude:journeyLocationShares.latitude,longitude:journeyLocationShares.longitude,expiresAt:journeyLocationShares.expiresAt})
      .from(journeyLocationShares).innerJoin(journeys,eq(journeys.id,journeyLocationShares.journeyId))
      .innerJoin(travelCircleMembers,and(eq(travelCircleMembers.userId,journeys.userId),eq(travelCircleMembers.travelCircleId,circleId),inArray(travelCircleMembers.membershipStatus,[...ACTIVE_MEMBERS])))
      .where(and(eq(journeys.travelCircleId,circleId),inArray(journeys.status,['IN_PROGRESS','NEEDS_ATTENTION']),eq(journeyLocationShares.audience,'CIRCLE'),gt(journeyLocationShares.expiresAt,new Date())));
  }
  private async publicShareContext(token: string) {
    const [row] = await db.select({ share: journeyShares, journey: journeys, user: users, profile: pcmProfiles, destination: orientationCamps })
      .from(journeyShares)
      .innerJoin(journeys, eq(journeys.id, journeyShares.journeyId))
      .innerJoin(users, eq(users.id, journeys.userId))
      .innerJoin(trustedContacts, and(eq(trustedContacts.id, journeyShares.trustedContactId), eq(trustedContacts.userId, journeys.userId), eq(trustedContacts.isActive, true)))
      .leftJoin(pcmProfiles, eq(pcmProfiles.userId, journeys.userId))
      .innerJoin(orientationCamps, eq(orientationCamps.id, journeys.destinationCampId))
      .where(and(eq(journeyShares.tokenHash, hashToken(token)), eq(journeyShares.status, 'ACTIVE'), gt(journeyShares.expiresAt, new Date())))
      .limit(1);
    if (!row) throw new NotFoundException('Journey share is invalid or expired');
    return row;
  }

  private async sharedCheckIns(journeyId: string, before?: string) {
    if (before) {
      const [cursor] = await db.select({ id: journeyCheckIns.id }).from(journeyCheckIns)
        .where(and(eq(journeyCheckIns.journeyId, journeyId), eq(journeyCheckIns.id, before))).limit(1);
      if (!cursor) throw new BadRequestException('Invalid check-in cursor');
    }
    // Compare against the stored timestamp to retain PostgreSQL's full precision.
    const boundary = before
      ? sql<boolean>`(${journeyCheckIns.createdAt}, ${journeyCheckIns.id}) < (select checkin_cursor.created_at, checkin_cursor.id from journey_check_in checkin_cursor where checkin_cursor.id = ${before} and checkin_cursor.journey_id = ${journeyId})`
      : undefined;
    const rows = await db.select({ id: journeyCheckIns.id, type: journeyCheckIns.type, message: journeyCheckIns.message, createdAt: journeyCheckIns.createdAt })
      .from(journeyCheckIns)
      .where(and(eq(journeyCheckIns.journeyId, journeyId), boundary))
      .orderBy(desc(journeyCheckIns.createdAt), desc(journeyCheckIns.id))
      .limit(21);
    const items = rows.slice(0, 20);
    return { items, nextCursor: rows.length > 20 ? items.at(-1)!.id : null };
  }

  async publicShare(token: string) {
    const row = await this.publicShareContext(token);
    const [checkInHistory, locations] = await Promise.all([
      this.sharedCheckIns(row.journey.id),
      db.select({ latitude: journeyLocationShares.latitude, longitude: journeyLocationShares.longitude, sharedAt: journeyLocationShares.sharedAt, expiresAt: journeyLocationShares.expiresAt })
        .from(journeyLocationShares)
        .where(and(eq(journeyLocationShares.journeyId, row.journey.id), eq(journeyLocationShares.audience, 'TRUSTED_CONTACT'), gt(journeyLocationShares.expiresAt, new Date())))
        .orderBy(desc(journeyLocationShares.sharedAt)).limit(1),
    ]);
    await db.update(journeyShares).set({ lastViewedAt: new Date() }).where(eq(journeyShares.id, row.share.id));
    return {
      shareExpiresAt: row.share.expiresAt,
      travellerName: row.profile?.displayName ?? row.user.name.split(' ')[0],
      status: row.journey.status,
      destination: row.destination.campName,
      expectedArrivalAt: row.journey.expectedArrivalAt,
      lastCheckIn: checkInHistory.items[0] ?? null,
      checkInHistory,
      currentLocation: locations[0] ?? null,
    };
  }

  async publicCheckIns(token: string, before?: string) {
    const row = await this.publicShareContext(token);
    const page = await this.sharedCheckIns(row.journey.id, before);
    await db.update(journeyShares).set({ lastViewedAt: new Date() }).where(eq(journeyShares.id, row.share.id));
    return page;
  }

  async shareLocation(userId: string, input: { latitude: number; longitude: number; audience: 'TRUSTED_CONTACT'|'CIRCLE'; durationMinutes?: number }) {
    const policy = locationSharingPolicy();
    const durationMinutes = input.durationMinutes ?? policy.defaultDurationMinutes;
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > policy.maxDurationMinutes) throw new BadRequestException('Invalid location sharing duration');
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`journey-location:${userId}`}))`);
      const [journey] = await tx.select().from(journeys).where(and(eq(journeys.userId,userId),inArray(journeys.status,['IN_PROGRESS','NEEDS_ATTENTION']))).limit(1);
      if (!journey) throw new ConflictException('Location can be shared during an active Journey');
      if (input.audience === 'CIRCLE') {
        if (!journey.travelCircleId) throw new BadRequestException('This is a Solo Journey');
        const [member] = await tx.select({id:travelCircleMembers.id}).from(travelCircleMembers).where(and(eq(travelCircleMembers.userId,userId),eq(travelCircleMembers.travelCircleId,journey.travelCircleId),inArray(travelCircleMembers.membershipStatus,[...ACTIVE_MEMBERS]))).limit(1);
        if (!member) throw new ForbiddenException('An active Circle membership is required');
      }
      if (input.audience === 'TRUSTED_CONTACT') {
        const [recipient] = await tx.select({id:journeyShares.id}).from(journeyShares).innerJoin(trustedContacts,eq(trustedContacts.id,journeyShares.trustedContactId)).where(and(eq(journeyShares.journeyId,journey.id),eq(journeyShares.status,'ACTIVE'),gt(journeyShares.expiresAt,new Date()),eq(trustedContacts.userId,userId),eq(trustedContacts.isActive,true))).limit(1);
        if (!recipient) throw new ConflictException('Create an active Journey share link before sharing a location');
      }
      const expiresAt=new Date(Date.now()+durationMinutes*60_000);
      // Only the newest explicit consent per audience remains readable.
      await tx.update(journeyLocationShares).set({expiresAt:new Date()}).where(and(eq(journeyLocationShares.journeyId,journey.id),eq(journeyLocationShares.audience,input.audience),gt(journeyLocationShares.expiresAt,new Date())));
      const [row]=await tx.insert(journeyLocationShares).values({journeyId:journey.id,latitude:String(input.latitude),longitude:String(input.longitude),audience:input.audience,expiresAt}).returning();
      if (input.audience==='CIRCLE') await circleSystemMessage(tx,journey.travelCircleId!,`location-shared:${row.id}`,'A Circle member explicitly shared a temporary location for safety.','SAFETY_NOTICE');
      return {shared:true,expiresAt};
    });
  }
  async alertTrusted(userId: string) { const current = await this.current(userId); const queued = await db.transaction(tx => this.notifyTrusted(userId, current.journey.id, 'NEED_HELP', tx)); return { status: queued ? 'QUEUED' : 'NO_ELIGIBLE_RECIPIENTS', queued, providerAccepted: 0 }; }
  async alertCircle(userId: string) { const current = await this.current(userId); if (!current.journey.travelCircleId || current.journey.journeyMode !== 'CIRCLE') throw new BadRequestException('No active Travel Circle'); await db.transaction((tx: any) => circleSystemMessage(tx, current.journey.travelCircleId, `journey-help:${current.journey.id}`, 'A Circle member has requested help.', 'SAFETY_NOTICE')); return { alerted: true }; }
  async separateFromCircle(userId: string) { const current = await this.current(userId); if (!current.journey.travelCircleId || !['IN_PROGRESS', 'NEEDS_ATTENTION'].includes(current.journey.status)) throw new ConflictException('No active Circle Journey'); const [membership] = await db.select().from(travelCircleMembers).where(and(eq(travelCircleMembers.userId, userId), eq(travelCircleMembers.travelCircleId, current.journey.travelCircleId), inArray(travelCircleMembers.membershipStatus, [...ACTIVE_MEMBERS]))).limit(1); if (!membership) { await db.update(journeys).set({ journeyMode: 'SOLO', travelCircleId: null, updatedAt: new Date() }).where(eq(journeys.id, current.journey.id)); return this.current(userId); } await db.transaction(async (tx: any) => { const now = new Date(); await tx.update(travelCircleMembers).set({ membershipStatus: 'LEFT', leftAt: now }).where(eq(travelCircleMembers.id, membership.id)); await tx.update(journeys).set({ journeyMode: 'SOLO', travelCircleId: null, updatedAt: now }).where(eq(journeys.id, current.journey.id)); await tx.update(travelCircles).set({ memberCount: sql`${travelCircles.memberCount} - 1`, updatedAt: now }).where(eq(travelCircles.id, membership.travelCircleId)); await this.event(tx, 'JourneySeparatedFromCircle', current.journey.id, userId); }); return this.current(userId); }

  async processReminders(now = new Date()) {
    const period = Number(process.env.CHECKIN_REMINDER_AFTER_HOURS ?? 2) * 3_600_000;
    const due = await db.select().from(journeys).where(and(inArray(journeys.status,['IN_PROGRESS','NEEDS_ATTENTION']),lte(journeys.lastCheckInAt,new Date(now.getTime()-period))));
    let created = 0;
    for (const journey of due) {
      await db.transaction(async (tx) => {
        const [locked] = await tx.select().from(journeys).where(and(eq(journeys.id,journey.id),inArray(journeys.status,['IN_PROGRESS','NEEDS_ATTENTION']))).for('update');
        if (!locked) return;
        const base = locked.lastCheckInAt ?? locked.startedAt;
        if (!base) return;
        const anchor=base.toISOString();
        const elapsed=Math.floor((now.getTime()-base.getTime())/period);
        const [processed]=await tx.select({period:sql<number>`coalesce(max((${domainOutbox.payload}->>'reminderPeriod')::int),0)`}).from(domainOutbox).where(and(eq(domainOutbox.aggregateId,journey.id),eq(domainOutbox.eventType,'JourneyCheckInOverdue'),sql`${domainOutbox.payload}->>'overdueAnchor' = ${anchor}`));
        // Preserve already-consumed legacy intervals on upgrade. New reminders
        // use the durable event's explicit anchor, not creation time or Journey start.
        const [legacy]=await tx.select({number:sql<number>`coalesce(max(${journeyReminders.reminderNumber}),0)`}).from(journeyReminders).where(and(eq(journeyReminders.journeyId,journey.id),gte(journeyReminders.createdAt,base),sql`not exists (select 1 from ${domainOutbox} where ${domainOutbox.aggregateId}=${journey.id} and ${domainOutbox.eventType}='JourneyCheckInOverdue' and ${domainOutbox.payload}->>'reminderId'=${journeyReminders.id}::text and ${domainOutbox.payload} ? 'overdueAnchor')`));
        const done=Math.max(Number(processed.period),Number(legacy.number));
        const [latest]=await tx.select({number:journeyReminders.reminderNumber}).from(journeyReminders).where(eq(journeyReminders.journeyId,journey.id)).orderBy(desc(journeyReminders.reminderNumber)).limit(1);
        let sequence=latest?.number??0;
        // Cap catch-up work. Future executions continue this same durable anchor.
        for (let n=done+1;n<=Math.min(elapsed,done+24);n++) {
          const [reminder] = await tx.insert(journeyReminders).values({journeyId:journey.id,reminderNumber:++sequence,createdAt:now}).onConflictDoNothing().returning();
          if (!reminder) continue;
          await tx.insert(domainOutbox).values({aggregateType:'JOURNEY',aggregateId:journey.id,eventType:'JourneyCheckInOverdue',payload:{journeyId:journey.id,userId:journey.userId,reminderId:reminder.id,reminderNumber:sequence,reminderPeriod:n,overdueAnchor:anchor,overdue:true,emergency:false,occurredAt:now.toISOString()}});
          if (n>=2) await this.notifyTrusted(journey.userId,journey.id,'CHECKIN_OVERDUE',tx);
          created++;
        }
      });
    }
    return {checked:due.length,created};
  }
  async metrics() { const result = await db.execute(sql`select count(*) filter(where started_at is not null)::int journeys_started,count(*) filter(where journey_mode='SOLO' and started_at is not null)::int solo_journeys,count(*) filter(where status='COMPLETED')::int journeys_completed,count(*) filter(where arrived_at is not null)::int arrivals,(select count(*)::int from journey_check_in where type not in ('STARTED','ARRIVED')) checkins,(select count(*)::int from journey_check_in where type='NEED_HELP') need_help,(select count(distinct user_id)::int from trusted_contact where is_active) trusted_contact_adoption,(select count(distinct j.user_id)::int from journey_share s join journey j on j.id=s.journey_id) journey_share_adoption,(select count(*)::int from journey_reminder) overdue_reminders from journey`); return result.rows[0]; }

  private historyItem(userId: string, id: string) { return db.select().from(journeys).where(and(eq(journeys.id, id), eq(journeys.userId, userId))).limit(1).then((r) => r[0]); }
  private event(tx: any, eventType: string, journeyId: string, userId: string) { return tx.insert(domainOutbox).values({ aggregateType: 'JOURNEY', aggregateId: journeyId, eventType, payload: { journeyId, userId, occurredAt: new Date().toISOString() } }); }
  private async notifyTrusted(userId: string, journeyId: string, event: string, tx: any) { const rows = await tx.select({ contact: trustedContacts, share: journeyShares, destination: orientationCamps, user: users }).from(journeyShares).innerJoin(trustedContacts, eq(trustedContacts.id, journeyShares.trustedContactId)).innerJoin(journeys, eq(journeys.id, journeyShares.journeyId)).innerJoin(orientationCamps, eq(orientationCamps.id, journeys.destinationCampId)).innerJoin(users, eq(users.id, journeys.userId)).where(and(eq(journeys.userId,userId), eq(trustedContacts.userId,userId), eq(journeyShares.journeyId, journeyId), eq(journeyShares.status, 'ACTIVE'), gt(journeyShares.expiresAt, new Date()), eq(trustedContacts.isActive, true))); let sent = 0; for (const row of rows) if (row.contact.email) { const traveller = row.user.name.split(' ')[0]; const urgent = event === 'NEED_HELP'; const eventLabel = event.replaceAll('_', ' ').toLowerCase(); await enqueueEmail({ userId, safety: { journeyId, shareId: row.share.id, contactId: row.contact.id }, to: row.contact.email, intent: 'JOURNEY_SAFETY', subject: urgent ? `${traveller} has requested help` : `${traveller} shared a journey update`, title: urgent ? 'Help requested during a journey' : 'Journey safety update', preheader: urgent ? `${traveller} has requested help during their journey.` : `${traveller} shared a new journey update.`, recipientName: row.contact.name, text: urgent ? `${traveller} has requested help during their journey. Please check their secure journey page and contact them as soon as you can.` : `${traveller} shared a new journey update: ${eventLabel}. Open the secure journey link you previously received for the latest information.`, details: [{ label: 'Traveller', value: traveller }, { label: 'Destination', value: row.destination.campName }, { label: 'Update', value: eventLabel }] }, tx); sent++; } return sent; }
  private async updateCircleArrival(tx: any, circleId: string | null) { if (!circleId) return; const activeMembers = await tx.select({ userId: travelCircleMembers.userId }).from(travelCircleMembers).where(and(eq(travelCircleMembers.travelCircleId, circleId), inArray(travelCircleMembers.membershipStatus, [...ACTIVE_MEMBERS]))); if (!activeMembers.length) return; const unfinished = await tx.select({ id: journeys.id }).from(journeys).where(and(eq(journeys.travelCircleId, circleId), inArray(journeys.userId, activeMembers.map((m: any) => m.userId)), inArray(journeys.status, ['PREPARING', 'READY_TO_START', 'IN_PROGRESS', 'NEEDS_ATTENTION']))).limit(1); if (!unfinished.length) await tx.update(travelCircles).set({ status: 'ARRIVED', updatedAt: new Date() }).where(eq(travelCircles.id, circleId)); }
}
