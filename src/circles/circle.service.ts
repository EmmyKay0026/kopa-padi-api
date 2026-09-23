import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../db/database.js";
import {
  accountRestrictions,
  circleMeetups,
  circleMessages,
  circleNotifications,
  circleSafetyReports,
  conversationReadStates,
  domainOutbox,
  journeys,
  meetupConfirmations,
  orientationCamps,
  pcmProfiles,
  pcmVerifications,
  travelCircleMembers,
  travelCircles,
  travelHubs,
  travelPlans,
  userBlocks,
} from "../db/schema.js";
import { MatchingService } from "../matching/matching.service.js";
import { circleSystemMessage, ensureConversation } from "./circle-events.js";
import { enabled } from '../config/runtime.js';

const ACTIVE = ["JOINED", "CONFIRMED"] as const;
type Cursor = { createdAt: string; id: string };
const encodeCursor = (createdAt: Date, id: string) =>
  Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id }),
  ).toString("base64url");
function decodeCursor(value: string): Cursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString(),
    ) as Cursor;
    if (
      !parsed.createdAt ||
      !/^[0-9a-f-]{36}$/i.test(parsed.id) ||
      Number.isNaN(Date.parse(parsed.createdAt))
    )
      throw new Error();
    return parsed;
  } catch {
    throw new BadRequestException("Invalid message cursor");
  }
}

@Injectable()
export class CircleService {
  constructor(private readonly matching: MatchingService) {}

  async current(userId: string) {
    const context = await this.context(db, userId, false);
    if (!context) return null;
    const [members, meetup, unread, notifications] = await Promise.all([
      this.members(userId),
      this.currentMeetup(userId),
      this.unreadCount(context.conversation.id, userId),
      db
        .select()
        .from(circleNotifications)
        .where(
          and(
            eq(circleNotifications.userId, userId),
            eq(circleNotifications.travelCircleId, context.circle.id),
            isNull(circleNotifications.readAt),
          ),
        )
        .orderBy(desc(circleNotifications.createdAt))
        .limit(10),
    ]);
    const [destination] = await db
      .select({
        name: orientationCamps.campName,
        address: orientationCamps.officialAddress,
      })
      .from(orientationCamps)
      .where(eq(orientationCamps.id, context.circle.destinationCampId))
      .limit(1);
    const [hub] = context.circle.originHubId
      ? await db
          .select({ name: travelHubs.name })
          .from(travelHubs)
          .where(eq(travelHubs.id, context.circle.originHubId))
          .limit(1)
      : [];
    return {
      circle: context.circle,
      membership: context.membership,
      destination,
      originHub: hub ?? null,
      members,
      meetup,
      unreadCount: unread,
      notifications,
    };
  }

  async members(userId: string) {
    const context = await this.context(db, userId);
    return db
      .select({
        userId: travelCircleMembers.userId,
        displayName: pcmProfiles.displayName,
        profilePhotoKey: pcmProfiles.profilePhotoKey,
        membershipStatus: travelCircleMembers.membershipStatus,
        joinedAt: travelCircleMembers.joinedAt,
        confirmedAt: travelCircleMembers.confirmedAt,
        verificationStatus: pcmVerifications.status,
      })
      .from(travelCircleMembers)
      .innerJoin(
        travelPlans,
        eq(travelPlans.id, travelCircleMembers.travelPlanId),
      )
      .innerJoin(
        pcmVerifications,
        eq(pcmVerifications.id, travelPlans.pcmVerificationId),
      )
      .leftJoin(pcmProfiles, eq(pcmProfiles.userId, travelCircleMembers.userId))
      .where(
        and(
          eq(travelCircleMembers.travelCircleId, context.circle.id),
          inArray(travelCircleMembers.membershipStatus, [...ACTIVE]),
        ),
      )
      .orderBy(asc(travelCircleMembers.joinedAt), asc(travelCircleMembers.id));
  }

  async confirmTravel(userId: string) {
    const context = await this.context(db, userId);
    if (context.membership.membershipStatus === "CONFIRMED")
      return context.membership;
    const [member] = await db
      .update(travelCircleMembers)
      .set({ membershipStatus: "CONFIRMED", confirmedAt: new Date() })
      .where(
        and(
          eq(travelCircleMembers.id, context.membership.id),
          eq(travelCircleMembers.membershipStatus, "JOINED"),
        ),
      )
      .returning();
    return member ?? this.context(db, userId).then((value) => value.membership);
  }

  async messages(
    userId: string,
    query: { after?: string; before?: string; limit: number },
  ) {
    const context = await this.context(db, userId);
    const cursor = query.after
      ? decodeCursor(query.after)
      : query.before
        ? decodeCursor(query.before)
        : null;
    if (cursor) {
      const [ownedCursor] = await db
        .select({ id: circleMessages.id })
        .from(circleMessages)
        .where(
          and(
            eq(circleMessages.id, cursor.id),
            eq(circleMessages.conversationId, context.conversation.id),
          ),
        )
        .limit(1);
      if (!ownedCursor) throw new BadRequestException("Invalid message cursor");
    }
    const boundary = cursor
      ? query.after
        ? sql<boolean>`(${circleMessages.createdAt}, ${circleMessages.id}) > (select cursor_message.created_at, cursor_message.id from circle_message cursor_message where cursor_message.id = ${cursor.id})`
        : sql<boolean>`(${circleMessages.createdAt}, ${circleMessages.id}) < (select cursor_message.created_at, cursor_message.id from circle_message cursor_message where cursor_message.id = ${cursor.id})`
      : undefined;
    const descending = Boolean(query.before || !query.after);
    const rows = await db
      .select({
        id: circleMessages.id,
        type: circleMessages.type,
        body: circleMessages.body,
        senderUserId: circleMessages.senderUserId,
        senderDisplayName: pcmProfiles.displayName,
        createdAt: circleMessages.createdAt,
        editedAt: circleMessages.editedAt,
        deletedAt: circleMessages.deletedAt,
      })
      .from(circleMessages)
      .leftJoin(
        pcmProfiles,
        eq(pcmProfiles.userId, circleMessages.senderUserId),
      )
      .where(
        and(
          eq(circleMessages.conversationId, context.conversation.id),
          boundary,
        ),
      )
      .orderBy(
        descending ? desc(circleMessages.createdAt) : asc(circleMessages.createdAt),
        descending ? desc(circleMessages.id) : asc(circleMessages.id),
      )
      .limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    if (descending) page.reverse();
    return {
      messages: page.map((message) => ({
        ...message,
        body: message.deletedAt ? "Message deleted" : message.body,
      })),
      hasMore,
      nextCursor: page.length
        ? encodeCursor(
            (descending ? page[0] : page[page.length - 1])!.createdAt,
            (descending ? page[0] : page[page.length - 1])!.id,
          )
        : null,
    };
  }

  async postMessage(userId: string, body: string) {
    if(!enabled('MESSAGING_ENABLED',true))throw new ForbiddenException('New messages are temporarily paused');
    return db.transaction(async (tx: any) => {
      const [restriction]=await tx.select({id:accountRestrictions.id}).from(accountRestrictions).where(and(eq(accountRestrictions.userId,userId),eq(accountRestrictions.restrictionType,'MESSAGING_DISABLED'),eq(accountRestrictions.status,'ACTIVE'),or(isNull(accountRestrictions.expiresAt),gt(accountRestrictions.expiresAt,new Date())))).limit(1);
      if(restriction)throw new ForbiddenException('Messaging is temporarily unavailable for this account');
      const context = await this.context(tx, userId);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`chat:${userId}`}))`,
      );
      const since = new Date(Date.now() - 60_000);
      const limit = Number(process.env.CIRCLE_MESSAGE_LIMIT_PER_MINUTE ?? 12);
      const [usage] = await tx
        .select({ value: count() })
        .from(circleMessages)
        .where(
          and(
            eq(circleMessages.conversationId, context.conversation.id),
            eq(circleMessages.senderUserId, userId),
            gt(circleMessages.createdAt, since),
            isNull(circleMessages.deletedAt),
          ),
        );
      if (Number(usage?.value ?? 0) >= limit)
        throw new HttpException(
          "Too many requests",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      const [message] = await tx
        .insert(circleMessages)
        .values({
          conversationId: context.conversation.id,
          senderUserId: userId,
          type: "TEXT",
          body,
        })
        .returning();
      return message;
    });
  }

  async deleteMessage(userId: string, id: string) {
    const context = await this.context(db, userId);
    const [message] = await db
      .update(circleMessages)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(circleMessages.id, id),
          eq(circleMessages.conversationId, context.conversation.id),
          eq(circleMessages.senderUserId, userId),
          eq(circleMessages.type, "TEXT"),
          isNull(circleMessages.deletedAt),
        ),
      )
      .returning();
    if (!message) throw new NotFoundException("Message not found");
    return { deleted: true };
  }

  async markRead(userId: string, messageId: string) {
    const context = await this.context(db, userId);
    const [message] = await db
      .select()
      .from(circleMessages)
      .where(
        and(
          eq(circleMessages.id, messageId),
          eq(circleMessages.conversationId, context.conversation.id),
        ),
      )
      .limit(1);
    if (!message) throw new NotFoundException("Message not found");
    await db
      .insert(conversationReadStates)
      .values({
        conversationId: context.conversation.id,
        userId,
        lastReadMessageId: message.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          conversationReadStates.conversationId,
          conversationReadStates.userId,
        ],
        set: { lastReadMessageId: message.id, updatedAt: new Date() },
      });
    return { read: true };
  }

  async leave(userId: string) {
    return db.transaction(async (tx: any) => {
      const context = await this.context(tx, userId);
      const [activeJourney] = await tx.select({ id: journeys.id }).from(journeys).where(and(eq(journeys.travelPlanId, context.membership.travelPlanId), eq(journeys.userId, userId), inArray(journeys.status, ['IN_PROGRESS', 'NEEDS_ATTENTION']))).limit(1);
      const result = await this.matching.detachPlan(
        tx,
        context.membership.travelPlanId,
      );
      if (activeJourney) {
        await tx.update(journeys).set({ journeyMode: 'SOLO', travelCircleId: null, updatedAt: new Date() }).where(eq(journeys.id, activeJourney.id));
        await this.event(tx, 'TravelCircleMemberLeft', context.circle.id, userId);
        return { left: true, circleId: context.circle.id, rematchRequested: false, journeyMode: 'SOLO' };
      }
      await tx
        .update(travelPlans)
        .set({ status: "SEARCHING", updatedAt: new Date() })
        .where(
          and(
            eq(travelPlans.id, context.membership.travelPlanId),
            inArray(travelPlans.status, ["IN_CIRCLE", "LOCKED"]),
          ),
        );
      await this.event(tx, "TravelCircleMemberLeft", context.circle.id, userId);
      if (!result?.afterCutoff)
        await this.event(
          tx,
          "TravelPlanRematchRequested",
          context.membership.travelPlanId,
          userId,
        );
      return {
        left: true,
        circleId: context.circle.id,
        rematchRequested: !result?.afterCutoff,
      };
    });
  }

  async currentMeetup(userId: string) {
    const context = await this.context(db, userId);
    const [meetup] = await db
      .select()
      .from(circleMeetups)
      .where(
        and(
          eq(circleMeetups.travelCircleId, context.circle.id),
          inArray(circleMeetups.status, ["PROPOSED", "AGREED"]),
        ),
      )
      .orderBy(desc(circleMeetups.createdAt))
      .limit(1);
    if (!meetup) return null;
    const confirmations = await db
      .select({
        userId: meetupConfirmations.userId,
        confirmedAt: meetupConfirmations.confirmedAt,
      })
      .from(meetupConfirmations)
      .where(eq(meetupConfirmations.meetupId, meetup.id));
    return { ...meetup, confirmations };
  }
  async proposeMeetup(
    userId: string,
    input: { areaLabel: string; locationDescription: string },
  ) {
    return db.transaction(async (tx: any) => {
      const context = await this.context(tx, userId);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`meetup:${context.circle.id}`}))`,
      );
      const [existing] = await tx
        .select()
        .from(circleMeetups)
        .where(
          and(
            eq(circleMeetups.travelCircleId, context.circle.id),
            inArray(circleMeetups.status, ["PROPOSED", "AGREED"]),
          ),
        )
        .limit(1);
      if (existing)
        throw new ConflictException("This Circle already has an active meetup");
      const [meetup] = await tx
        .insert(circleMeetups)
        .values({
          travelCircleId: context.circle.id,
          proposedByUserId: userId,
          ...input,
        })
        .returning();
      await circleSystemMessage(
        tx,
        context.circle.id,
        `meetup:${meetup.id}`,
        `Meetup proposed in ${meetup.areaLabel}. Choose a public, well-lit place and tell someone you trust.`,
        "SAFETY_NOTICE",
      );
      await this.event(tx, "CircleMeetupProposed", meetup.id, userId);
      return meetup;
    });
  }
  async updateMeetup(userId: string, id: string, input: { areaLabel: string; locationDescription: string }) {
    const context = await this.context(db, userId);
    const [meetup] = await db.update(circleMeetups).set({ ...input, updatedAt: new Date() }).where(and(eq(circleMeetups.id, id), eq(circleMeetups.travelCircleId, context.circle.id), inArray(circleMeetups.status, ["PROPOSED"]))).returning();
    if (!meetup) throw new ConflictException("Only a proposed meetup can be edited");
    await circleSystemMessage(db, context.circle.id, "meetup-updated:" + meetup.id + ":" + meetup.updatedAt.getTime(), "Meetup suggestion updated: " + meetup.areaLabel + ". Review the public meeting point in the meetup panel.", "SAFETY_NOTICE");
    return this.currentMeetup(userId);
  }
  async confirmMeetup(userId: string, id: string) {
    await db.transaction(async (tx: any) => {
      const context = await this.context(tx, userId);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`meetup:${id}`}))`,
      );
      const [meetup] = await tx
        .select()
        .from(circleMeetups)
        .where(
          and(
            eq(circleMeetups.id, id),
            eq(circleMeetups.travelCircleId, context.circle.id),
            inArray(circleMeetups.status, ["PROPOSED", "AGREED"]),
          ),
        )
        .limit(1);
      if (!meetup) throw new NotFoundException("Active meetup not found");
      await tx
        .insert(meetupConfirmations)
        .values({ meetupId: id, userId })
        .onConflictDoNothing();
      const [total] = await tx
        .select({ value: count() })
        .from(meetupConfirmations)
        .where(eq(meetupConfirmations.meetupId, id));
      if (
        Number(total?.value) >= context.circle.memberCount &&
        meetup.status === "PROPOSED"
      )
        await tx
          .update(circleMeetups)
          .set({
            status: "AGREED",
            agreedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(eq(circleMeetups.id, id), eq(circleMeetups.status, "PROPOSED")),
          );
    });
    return this.currentMeetup(userId);
  }
  async cancelMeetup(userId: string, id: string) {
    const context = await this.context(db, userId);
    const [meetup] = await db
      .update(circleMeetups)
      .set({
        status: "CANCELLED",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(circleMeetups.id, id),
          eq(circleMeetups.travelCircleId, context.circle.id),
          eq(circleMeetups.proposedByUserId, userId),
          eq(circleMeetups.status, "PROPOSED"),
        ),
      )
      .returning();
    if (!meetup)
      throw new ForbiddenException(
        "Only the proposer can cancel an active proposal",
      );
    return meetup;
  }

  async report(
    userId: string,
    input: {
      reportedUserId?: string;
      meetupId?: string;
      category: any;
      details?: string;
    },
  ) {
    const context = await this.context(db, userId);
    if (input.reportedUserId) {
      if (input.reportedUserId === userId)
        throw new BadRequestException("You cannot report yourself");
      const [member] = await db
        .select({ id: travelCircleMembers.id })
        .from(travelCircleMembers)
        .where(
          and(
            eq(travelCircleMembers.travelCircleId, context.circle.id),
            eq(travelCircleMembers.userId, input.reportedUserId),
            inArray(travelCircleMembers.membershipStatus, [...ACTIVE]),
          ),
        )
        .limit(1);
      if (!member) throw new NotFoundException("Circle member not found");
    }
    if (input.meetupId) {
      const [meetup] = await db
        .select({ id: circleMeetups.id })
        .from(circleMeetups)
        .where(
          and(
            eq(circleMeetups.id, input.meetupId),
            eq(circleMeetups.travelCircleId, context.circle.id),
          ),
        )
        .limit(1);
      if (!meetup) throw new NotFoundException("Meetup not found");
    }
    const [report] = await db
      .insert(circleSafetyReports)
      .values({
        travelCircleId: context.circle.id,
        reporterUserId: userId,
        reportedUserId: input.reportedUserId,
        meetupId: input.meetupId,
        category: input.category,
        detailsPrivate: input.details,
      })
      .returning();
    await db
      .insert(domainOutbox)
      .values({
        aggregateType: "SAFETY_REPORT",
        aggregateId: report.id,
        eventType: "CircleSafetyReportCreated",
        payload: {
          reportId: report.id,
          circleId: context.circle.id,
          occurredAt: new Date().toISOString(),
        },
      });
    return { id: report.id, submitted: true };
  }
  async block(userId: string, blockedUserId: string) {
    if (userId === blockedUserId)
      throw new BadRequestException("You cannot block yourself");
    return db.transaction(async (tx: any) => {
      const context = await this.context(tx, userId);
      const [target] = await tx
        .select({ id: travelCircleMembers.id })
        .from(travelCircleMembers)
        .where(
          and(
            eq(travelCircleMembers.travelCircleId, context.circle.id),
            eq(travelCircleMembers.userId, blockedUserId),
            inArray(travelCircleMembers.membershipStatus, [...ACTIVE]),
          ),
        )
        .limit(1);
      if (!target) throw new NotFoundException("Circle member not found");
      await tx
        .insert(userBlocks)
        .values({ blockerUserId: userId, blockedUserId })
        .onConflictDoNothing();
      const result = await this.matching.detachPlan(
        tx,
        context.membership.travelPlanId,
      );
      const [activeJourney] = await tx.select({ id: journeys.id }).from(journeys).where(and(eq(journeys.travelPlanId, context.membership.travelPlanId), eq(journeys.userId, userId), inArray(journeys.status, ['IN_PROGRESS', 'NEEDS_ATTENTION']))).limit(1);
      if (activeJourney) {
        await tx.update(journeys).set({ journeyMode: 'SOLO', travelCircleId: null, updatedAt: new Date() }).where(eq(journeys.id, activeJourney.id));
        return { blocked: true, separated: true, rematchRequested: false, journeyMode: 'SOLO' };
      }
      await tx
        .update(travelPlans)
        .set({ status: "SEARCHING", updatedAt: new Date() })
        .where(
          and(
            eq(travelPlans.id, context.membership.travelPlanId),
            inArray(travelPlans.status, ["IN_CIRCLE", "LOCKED"]),
          ),
        );
      if (!result?.afterCutoff)
        await this.event(
          tx,
          "TravelPlanRematchRequested",
          context.membership.travelPlanId,
          userId,
        );
      return { blocked: true, separated: true };
    });
  }
  async notifications(userId: string) {
    return db
      .select()
      .from(circleNotifications)
      .where(eq(circleNotifications.userId, userId))
      .orderBy(desc(circleNotifications.createdAt))
      .limit(50);
  }
  async readNotification(userId: string, id: string) {
    const [row] = await db
      .update(circleNotifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(circleNotifications.id, id),
          eq(circleNotifications.userId, userId),
        ),
      )
      .returning();
    if (!row) throw new NotFoundException("Notification not found");
    return row;
  }
  async metrics() {
    const result = await db.execute(
      sql`select (select count(*)::int from circle_message where deleted_at is null) messages_sent,(select count(*)::int from circle_meetup) meetups_proposed,(select count(*)::int from circle_meetup where status='AGREED') meetups_agreed,(select count(*)::int from circle_safety_report where status='OPEN') open_safety_reports,(select count(*)::int from travel_circle_member where membership_status='CONFIRMED') travel_confirmations,(select count(*)::int from travel_circle where status='LOCKED') circles_locked`,
    );
    return result.rows[0];
  }

  private async context(tx: any, userId: string, required = true) {
    const [row] = await tx
      .select({ membership: travelCircleMembers, circle: travelCircles })
      .from(travelCircleMembers)
      .innerJoin(
        travelCircles,
        eq(travelCircles.id, travelCircleMembers.travelCircleId),
      )
      .where(
        and(
          eq(travelCircleMembers.userId, userId),
          inArray(travelCircleMembers.membershipStatus, [...ACTIVE]),
        ),
      )
      .limit(1);
    if (!row) {
      if (required)
        throw new ForbiddenException("An active Circle membership is required");
      return null;
    }
    const conversation = await ensureConversation(tx, row.circle.id);
    return { ...row, conversation };
  }
  private async unreadCount(conversationId: string, userId: string) {
    const [state] = await db
      .select()
      .from(conversationReadStates)
      .where(
        and(
          eq(conversationReadStates.conversationId, conversationId),
          eq(conversationReadStates.userId, userId),
        ),
      )
      .limit(1);
    const [result] = await db
      .select({ value: count() })
      .from(circleMessages)
      .where(
        and(
          eq(circleMessages.conversationId, conversationId),
          isNull(circleMessages.deletedAt),
          state?.lastReadMessageId
            ? sql<boolean>`(${circleMessages.createdAt}, ${circleMessages.id}) > (select read_message.created_at, read_message.id from circle_message read_message where read_message.id = ${state.lastReadMessageId})`
            : undefined,
          or(
            isNull(circleMessages.senderUserId),
            ne(circleMessages.senderUserId, userId),
          ),
        ),
      );
    return Number(result?.value ?? 0);
  }
  private event(
    tx: any,
    eventType: string,
    aggregateId: string,
    userId: string,
  ) {
    return tx
      .insert(domainOutbox)
      .values({
        aggregateType:
          eventType.startsWith("TravelCircle") || eventType.startsWith("Circle")
            ? "TRAVEL_CIRCLE"
            : "TRAVEL_PLAN",
        aggregateId,
        eventType,
        payload: { aggregateId, userId, occurredAt: new Date().toISOString() },
      });
  }
}
