import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { CircleService } from "../circles/circle.service.js";
import { db } from "../db/database.js";
import {
  accountRestrictions,
  auditLogs,
  circleConversations,
  circleMessages,
  domainOutbox,
  journeys,
  matchingRestrictions,
  moderationCaseNotes,
  moderationCaseReports,
  moderationCases,
  pcmVerifications,
  safetyReports,
  travelCircleMembers,
  travelPlans,
  userBlocks,
  users,
} from "../db/schema.js";
@Injectable()
export class SafetyService {
  constructor(private readonly circles?: CircleService) {}
  async blocks(userId: string) {
    return db
      .select({
        blockedUserId: userBlocks.blockedUserId,
        createdAt: userBlocks.createdAt,
      })
      .from(userBlocks)
      .where(eq(userBlocks.blockerUserId, userId));
  }
  async block(userId: string, input: any) {
    if (userId === input.blockedUserId)
      throw new BadRequestException("You cannot block yourself");
    if (this.circles) {
      const memberships = await db
        .select({ travelCircleId: travelCircleMembers.travelCircleId })
        .from(travelCircleMembers)
        .where(
          and(
            eq(travelCircleMembers.userId, userId),
            inArray(travelCircleMembers.membershipStatus, [
              "JOINED",
              "CONFIRMED",
            ]),
          ),
        );
      if (memberships.length) {
        const [target] = await db
          .select({ id: travelCircleMembers.id })
          .from(travelCircleMembers)
          .where(
            and(
              eq(travelCircleMembers.userId, input.blockedUserId),
              inArray(
                travelCircleMembers.travelCircleId,
                memberships.map((m) => m.travelCircleId),
              ),
              inArray(travelCircleMembers.membershipStatus, [
                "JOINED",
                "CONFIRMED",
              ]),
            ),
          )
          .limit(1);
        if (target) return this.circles.block(userId, input.blockedUserId);
      }
    }
    await db
      .insert(userBlocks)
      .values({ blockerUserId: userId, blockedUserId: input.blockedUserId })
      .onConflictDoNothing();
    return { blocked: true, separated: false };
  }
  async unblock(userId: string, target: string) {
    const rows = await db
      .delete(userBlocks)
      .where(
        and(
          eq(userBlocks.blockerUserId, userId),
          eq(userBlocks.blockedUserId, target),
        ),
      )
      .returning();
    return { unblocked: rows.length > 0, rematched: false };
  }
  async submit(userId: string, input: any) {
    if (input.reportedUserId === userId)
      throw new BadRequestException("You cannot report yourself");
    let snapshot: string | null = null;
    if (input.messageId) {
      const [m] = await db
        .select({
          body: circleMessages.body,
          circleId: circleConversations.travelCircleId,
        })
        .from(circleMessages)
        .innerJoin(
          circleConversations,
          eq(circleConversations.id, circleMessages.conversationId),
        )
        .where(eq(circleMessages.id, input.messageId))
        .limit(1);
      if (!m) throw new NotFoundException("Message not found");
      const [member] = await db
        .select({ id: travelCircleMembers.id })
        .from(travelCircleMembers)
        .where(
          and(
            eq(travelCircleMembers.travelCircleId, m.circleId),
            eq(travelCircleMembers.userId, userId),
          ),
        )
        .limit(1);
      if (!member)
        throw new ForbiddenException("Message is outside your Circle");
      snapshot = m.body.slice(0, 4000);
      input.travelCircleId = m.circleId;
    }
    if (input.journeyId) {
      const [j] = await db
        .select({ id: journeys.id })
        .from(journeys)
        .where(
          and(eq(journeys.id, input.journeyId), eq(journeys.userId, userId)),
        )
        .limit(1);
      if (!j) throw new ForbiddenException("Journey context is not yours");
    }
    const severe = ["THREATENING_BEHAVIOUR", "STALKING_OR_PROBING"].includes(
      input.category,
    )
      ? "HIGH"
      : "MEDIUM";
    const [row] = await db.transaction(async (tx: any) => {
      const [r] = await tx
        .insert(safetyReports)
        .values({
          ...input,
          reporterUserId: userId,
          severity: severe,
          reportedContentSnapshot: snapshot,
        })
        .returning();
      await tx.insert(domainOutbox).values({
        aggregateType: "SAFETY_REPORT",
        aggregateId: r.id,
        eventType: "SafetyReportSubmitted",
        payload: {
          reportId: r.id,
          severity: severe,
          occurredAt: new Date().toISOString(),
        },
      });
      return r;
    });
    return { id: row.id, status: row.status };
  }
  mine(userId: string) {
    return db
      .select({
        id: safetyReports.id,
        category: safetyReports.category,
        status: safetyReports.status,
        createdAt: safetyReports.createdAt,
        updatedAt: safetyReports.updatedAt,
      })
      .from(safetyReports)
      .where(eq(safetyReports.reporterUserId, userId))
      .orderBy(desc(safetyReports.createdAt));
  }
  async mineStatus(userId: string, id: string) {
    const [r] = await db
      .select({
        id: safetyReports.id,
        status: safetyReports.status,
        updatedAt: safetyReports.updatedAt,
      })
      .from(safetyReports)
      .where(
        and(eq(safetyReports.id, id), eq(safetyReports.reporterUserId, userId)),
      )
      .limit(1);
    if (!r) throw new NotFoundException("Report not found");
    return r;
  }
  reports(filters: any) {
    return db
      .select({
        id: safetyReports.id,
        reportedUserId: safetyReports.reportedUserId,
        category: safetyReports.category,
        severity: safetyReports.severity,
        status: safetyReports.status,
        createdAt: safetyReports.createdAt,
      })
      .from(safetyReports)
      .where(
        and(
          filters.status ? eq(safetyReports.status, filters.status) : undefined,
          filters.severity
            ? eq(safetyReports.severity, filters.severity)
            : undefined,
          filters.category
            ? eq(safetyReports.category, filters.category)
            : undefined,
        ),
      )
      .orderBy(desc(safetyReports.createdAt));
  }
  async reportDetail(_actor: string, id: string) {
    const [r] = await db
      .select()
      .from(safetyReports)
      .where(eq(safetyReports.id, id))
      .limit(1);
    if (!r) throw new NotFoundException("Report not found");
    const [c] = await db
      .select()
      .from(moderationCaseReports)
      .where(eq(moderationCaseReports.safetyReportId, id))
      .limit(1);
    return {
      report: r,
      hasMessageEvidence: Boolean(r.messageId),
      caseLink: c ?? null,
    };
  }
  async messageEvidence(actor: string, id: string) {
    const [r] = await db
      .select({ messageId: safetyReports.messageId })
      .from(safetyReports)
      .where(eq(safetyReports.id, id))
      .limit(1);
    if (!r?.messageId)
      throw new NotFoundException("Reported message evidence not found");
    const [m] = await db
      .select({
        id: circleMessages.id,
        body: circleMessages.body,
        createdAt: circleMessages.createdAt,
      })
      .from(circleMessages)
      .where(eq(circleMessages.id, r.messageId))
      .limit(1);
    await this.audit(
      db,
      actor,
      "VIEWED_PRIVATE_MESSAGE_FOR_SAFETY",
      "SAFETY_REPORT",
      id,
    );
    return { message: m };
  }
  async triage(actor: string, id: string, input: any) {
    return db.transaction(async (tx: any) => {
      const [r] = await tx
        .update(safetyReports)
        .set({
          status: input.status,
          severity: input.severity,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(safetyReports.id, id),
            inArray(safetyReports.status, [
              "SUBMITTED",
              "TRIAGED",
              "UNDER_REVIEW",
            ]),
          ),
        )
        .returning();
      if (!r) throw new ConflictException("Report is no longer triageable");
      let caseId = null;
      if (input.openCase && r.reportedUserId) {
        const [c] = await tx
          .insert(moderationCases)
          .values({
            primaryReportId: r.id,
            subjectUserId: r.reportedUserId,
            priority:
              input.severity === "CRITICAL"
                ? "CRITICAL"
                : input.severity === "HIGH"
                  ? "HIGH"
                  : "NORMAL",
          })
          .returning();
        await tx
          .insert(moderationCaseReports)
          .values({ moderationCaseId: c.id, safetyReportId: r.id });
        caseId = c.id;
        await this.audit(
          tx,
          actor,
          "MODERATION_CASE_OPENED",
          "MODERATION_CASE",
          c.id,
        );
      }
      await this.audit(tx, actor, "SAFETY_REPORT_TRIAGED", "SAFETY_REPORT", id);
      return { report: r, caseId };
    });
  }
  cases() {
    return db
      .select()
      .from(moderationCases)
      .orderBy(desc(moderationCases.openedAt));
  }
  async caseDetail(id: string) {
    const [c] = await db
      .select()
      .from(moderationCases)
      .where(eq(moderationCases.id, id))
      .limit(1);
    if (!c) throw new NotFoundException("Case not found");
    const [reports, notes, restrictions] = await Promise.all([
      db
        .select({ report: safetyReports })
        .from(moderationCaseReports)
        .innerJoin(
          safetyReports,
          eq(safetyReports.id, moderationCaseReports.safetyReportId),
        )
        .where(eq(moderationCaseReports.moderationCaseId, id)),
      db
        .select()
        .from(moderationCaseNotes)
        .where(eq(moderationCaseNotes.moderationCaseId, id))
        .orderBy(desc(moderationCaseNotes.createdAt)),
      db
        .select()
        .from(accountRestrictions)
        .where(
          and(
            eq(accountRestrictions.userId, c.subjectUserId),
            eq(accountRestrictions.status, "ACTIVE"),
          ),
        ),
    ]);
    return { case: c, reports, notes, restrictions };
  }
  async updateCase(actor: string, id: string, input: any) {
    const terminal =
      input.status === "RESOLVED" || input.status === "DISMISSED";
    const [c] = await db
      .update(moderationCases)
      .set({
        ...input,
        updatedAt: new Date(),
        resolvedAt: terminal ? new Date() : null,
      })
      .where(
        and(
          eq(moderationCases.id, id),
          inArray(moderationCases.status, [
            "OPEN",
            "TRIAGED",
            "IN_REVIEW",
            "AWAITING_INFORMATION",
            "ACTION_REQUIRED",
          ]),
        ),
      )
      .returning();
    if (!c) throw new ConflictException("Case is terminal or missing");
    await this.audit(
      db,
      actor,
      input.assignedAdminId
        ? "MODERATION_CASE_ASSIGNED"
        : input.status === "RESOLVED"
          ? "CASE_RESOLVED"
          : input.status === "DISMISSED"
            ? "CASE_DISMISSED"
            : "MODERATION_CASE_ASSIGNED",
      "MODERATION_CASE",
      id,
    );
    return c;
  }
  async note(actor: string, id: string, input: any) {
    const [n] = await db
      .insert(moderationCaseNotes)
      .values({ ...input, moderationCaseId: id, authorAdminId: actor })
      .returning();
    await this.audit(db, actor, "MODERATION_NOTE_ADDED", "MODERATION_CASE", id);
    return n;
  }
  async restrict(actor: string, userId: string, input: any) {
    return db.transaction(async (tx: any) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`restriction:${userId}:${input.restrictionType}`}))`,
      );
      const [existing] = await tx
        .select()
        .from(accountRestrictions)
        .where(
          and(
            eq(accountRestrictions.userId, userId),
            eq(accountRestrictions.restrictionType, input.restrictionType),
            eq(accountRestrictions.status, "ACTIVE"),
          ),
        )
        .limit(1);
      if (existing) return existing;
      const [r] = await tx
        .insert(accountRestrictions)
        .values({
          ...input,
          userId,
          appliedBy: actor,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        })
        .returning();
      if (
        [
          "MATCHING_DISABLED",
          "TRAVEL_PLAN_DISABLED",
          "VERIFICATION_REVIEW_REQUIRED",
          "ACCOUNT_SUSPENDED",
        ].includes(input.restrictionType)
      ) {
        await tx
          .insert(matchingRestrictions)
          .values({
            userId,
            type:
              input.restrictionType === "TRAVEL_PLAN_DISABLED"
                ? "TRAVEL_PLAN_DISABLED"
                : "MATCHING_DISABLED",
            reasonPrivate: input.reasonInternal,
          })
          .onConflictDoNothing();
        await tx
          .update(travelPlans)
          .set({ status: "CANCELLED", updatedAt: new Date() })
          .where(
            and(
              eq(travelPlans.userId, userId),
              eq(travelPlans.status, "SEARCHING"),
            ),
          );
      }
      if (input.restrictionType === "VERIFICATION_REVIEW_REQUIRED")
        await tx
          .update(pcmVerifications)
          .set({ status: "UNDER_REVIEW", updatedAt: new Date() })
          .where(
            and(
              eq(pcmVerifications.userId, userId),
              eq(pcmVerifications.status, "VERIFIED"),
            ),
          );
      if (input.restrictionType === "ACCOUNT_SUSPENDED")
        await tx
          .update(users)
          .set({ accountStatus: "SUSPENDED", updatedAt: new Date() })
          .where(eq(users.id, userId));
      await tx.insert(domainOutbox).values({
        aggregateType: "USER",
        aggregateId: userId,
        eventType: "RestrictionApplied",
        payload: {
          restrictionId: r.id,
          type: r.restrictionType,
          occurredAt: new Date().toISOString(),
        },
      });
      await this.audit(
        tx,
        actor,
        input.restrictionType === "ACCOUNT_SUSPENDED"
          ? "USER_SUSPENDED"
          : input.restrictionType === "VERIFICATION_REVIEW_REQUIRED"
            ? "VERIFICATION_REVIEW_REQUESTED"
            : "RESTRICTION_APPLIED",
        "ACCOUNT_RESTRICTION",
        r.id,
      );
      return r;
    });
  }
  async revoke(actor: string, userId: string, id: string) {
    return db.transaction(async (tx: any) => {
      const [r] = await tx
        .update(accountRestrictions)
        .set({ status: "REVOKED", revokedBy: actor, revokedAt: new Date() })
        .where(
          and(
            eq(accountRestrictions.id, id),
            eq(accountRestrictions.userId, userId),
            eq(accountRestrictions.status, "ACTIVE"),
          ),
        )
        .returning();
      if (!r) throw new NotFoundException("Active restriction not found");
      await this.reconcileRestrictionState(tx, userId);
      await this.audit(
        tx,
        actor,
        r.restrictionType === "ACCOUNT_SUSPENDED"
          ? "USER_UNSUSPENDED"
          : "RESTRICTION_REVOKED",
        "ACCOUNT_RESTRICTION",
        id,
      );
      return r;
    });
  }
  async expire(now = new Date()) {
    return db.transaction(async (tx: any) => {
      const rows = await tx
        .update(accountRestrictions)
        .set({ status: "EXPIRED" })
        .where(
          and(
            eq(accountRestrictions.status, "ACTIVE"),
            lt(accountRestrictions.expiresAt, now),
          ),
        )
        .returning({ userId: accountRestrictions.userId });
      for (const userId of new Set<string>(
        rows.map((row: any) => String(row.userId)),
      ))
        await this.reconcileRestrictionState(tx, userId);
      return { expired: rows.length };
    });
  }
  async metrics() {
    const r = await db.execute(
      sql`select (select count(*)::int from safety_report where status='SUBMITTED') new_reports,(select count(*)::int from safety_report where severity='CRITICAL' and status not in ('RESOLVED','DISMISSED')) critical_reports,(select count(*)::int from moderation_case where status not in ('RESOLVED','DISMISSED')) open_cases,(select count(*)::int from account_restriction where status='ACTIVE') active_restrictions,(select count(*)::int from moderation_case where status='ACTION_REQUIRED') awaiting_action,(select count(*)::int from "user" where account_status='SUSPENDED') suspended_users`,
    );
    return r.rows[0];
  }
  auditLogs() {
    return db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(200);
  }
  private audit(tx: any, actor: string, action: any, type: string, id: string) {
    return tx.insert(auditLogs).values({
      actorUserId: actor,
      action,
      resourceType: type,
      resourceId: id,
      metadata: { context: "MODERATION" },
    });
  }
  private async reconcileRestrictionState(tx: any, userId: string) {
    const active = await tx
      .select({ type: accountRestrictions.restrictionType })
      .from(accountRestrictions)
      .where(
        and(
          eq(accountRestrictions.userId, userId),
          eq(accountRestrictions.status, "ACTIVE"),
        ),
      );
    const types = new Set(active.map((row: any) => row.type));
    if (!types.has("ACCOUNT_SUSPENDED"))
      await tx
        .update(users)
        .set({ accountStatus: "ACTIVE", updatedAt: new Date() })
        .where(and(eq(users.id, userId), eq(users.accountStatus, "SUSPENDED")));
    const matchingBlocked = [
      "MATCHING_DISABLED",
      "TRAVEL_PLAN_DISABLED",
      "VERIFICATION_REVIEW_REQUIRED",
      "ACCOUNT_SUSPENDED",
    ].some((type) => types.has(type));
    if (!matchingBlocked)
      await tx
        .update(matchingRestrictions)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(
            eq(matchingRestrictions.userId, userId),
            eq(matchingRestrictions.active, true),
          ),
        );
  }
}
