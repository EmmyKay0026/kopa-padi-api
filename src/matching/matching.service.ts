import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../db/database.js";
import {
  circleConversations,
  domainOutbox,
  journeyCohorts,
  matchAttempts,
  matchingRestrictions,
  matchOffers,
  pcmProfiles,
  pcmVerifications,
  travelCircleMembers,
  travelCircles,
  travelPlans,
  userBlocks,
  users,
} from "../db/schema.js";
import { MATCHING_ALGORITHM_VERSION } from "../domain.js";
import { GeographyService } from "../geography/geography.service.js";
import {
  evaluatePair,
  MatchPlan,
  PairResult,
} from "./matching.compatibility.js";
import {
  circleSystemMessage,
  ensureConversation,
} from "../circles/circle-events.js";
import { matchingIsClosed } from "../circles/circle.domain.js";

const ACTIVE_MEMBERS = ["JOINED", "CONFIRMED"] as const;
const OPEN_CIRCLES = ["FORMING", "READY"] as const;
const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const asPlan = (plan: typeof travelPlans.$inferSelect): MatchPlan => ({
  ...plan,
  originTownId: plan.originTownId ?? null,
  groupPreference: "ANY_VERIFIED_PCM",
});

@Injectable()
export class MatchingService {
  constructor(private readonly geography: GeographyService) {}

  async processBatch(planIds: string[]) {
    if (!planIds.length) return [];
    const baseRows = await db
      .select({
        plan: travelPlans,
        user: users,
        verification: pcmVerifications,
      })
      .from(travelPlans)
      .innerJoin(users, eq(users.id, travelPlans.userId))
      .innerJoin(
        pcmVerifications,
        eq(pcmVerifications.id, travelPlans.pcmVerificationId),
      )
      .where(
        and(
          inArray(travelPlans.id, planIds),
          eq(travelPlans.status, "SEARCHING"),
          eq(users.accountStatus, "ACTIVE"),
          eq(pcmVerifications.status, "VERIFIED"),
          ne(travelPlans.transportMode, "PRIVATE_VEHICLE"),
        ),
      );
    const userIds = baseRows.map((row) => row.plan.userId);
    if (!userIds.length)
      return Promise.all(planIds.map((id) => this.processPlan(id)));
    const latestRows = await db
      .select({
        id: pcmVerifications.id,
        userId: pcmVerifications.userId,
        status: pcmVerifications.status,
      })
      .from(pcmVerifications)
      .where(inArray(pcmVerifications.userId, userIds))
      .orderBy(desc(pcmVerifications.updatedAt));
    const latest = new Map<string, { id: string; status: string }>();
    for (const row of latestRows)
      if (!latest.has(row.userId)) latest.set(row.userId, row);
    const restrictions = await db
      .select({ userId: matchingRestrictions.userId })
      .from(matchingRestrictions)
      .where(
        and(
          inArray(matchingRestrictions.userId, userIds),
          eq(matchingRestrictions.active, true),
          or(
            isNull(matchingRestrictions.expiresAt),
            gt(matchingRestrictions.expiresAt, new Date()),
          ),
        ),
      );
    const restricted = new Set(restrictions.map((row) => row.userId));
    const eligible = baseRows
      .map((row) => row.plan)
      .filter(
        (plan) =>
          latest.get(plan.userId)?.id === plan.pcmVerificationId &&
          latest.get(plan.userId)?.status === "VERIFIED" &&
          !restricted.has(plan.userId) &&
          !matchingIsClosed(plan.intendedTravelDate, plan.departureWindow),
      );
    const groups = new Map<string, typeof eligible>();
    for (const plan of eligible) {
      const key = [
        plan.destinationCampId,
        plan.intendedTravelDate,
        plan.originLgaId,
        plan.departureWindow,
        plan.transportMode,
        plan.groupPreference,
      ].join("|");
      const group = groups.get(key) ?? [];
      group.push(plan);
      groups.set(key, group);
    }
    const handled = new Set<string>();
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const ids = await this.allocateExactGroup(group);
      ids.forEach((id) => handled.add(id));
    }
    const remaining = planIds.filter((id) => !handled.has(id));
    const results = [];
    for (const id of remaining) results.push(await this.processPlan(id));
    return results;
  }

  async processPlan(planId: string) {
    const startedAt = new Date();
    return db.transaction(async (tx: any) => {
      const [initial] = await tx
        .select()
        .from(travelPlans)
        .where(eq(travelPlans.id, planId))
        .limit(1);
      if (!initial) return { result: "INELIGIBLE" };
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`match:${initial.destinationCampId}:${initial.intendedTravelDate}`}))`,
      );
      const plan = await this.eligiblePlan(tx, planId);
      if (!plan) {
        const [existing] = await tx
          .select()
          .from(travelCircleMembers)
          .where(
            and(
              eq(travelCircleMembers.travelPlanId, planId),
              inArray(travelCircleMembers.membershipStatus, [
                ...ACTIVE_MEMBERS,
              ]),
            ),
          )
          .limit(1);
        const result = existing ? "ALREADY_MATCHED" : "INELIGIBLE";
        await this.attempt(
          tx,
          planId,
          result,
          startedAt,
          0,
          0,
          0,
          existing?.travelCircleId,
        );
        return { result, circleId: existing?.travelCircleId };
      }
      const candidateRows = await tx
        .select()
        .from(travelPlans)
        .where(
          and(
            eq(travelPlans.status, "SEARCHING"),
            eq(travelPlans.destinationCampId, plan.destinationCampId),
            ne(travelPlans.id, plan.id),
            gteDate(
              travelPlans.intendedTravelDate,
              addDays(plan.intendedTravelDate, -2),
            ),
            lte(
              travelPlans.intendedTravelDate,
              addDays(plan.intendedTravelDate, 2),
            ),
          ),
        )
        .orderBy(asc(travelPlans.createdAt), asc(travelPlans.id))
        .limit(200);
      const direct: Array<{
        plan: typeof travelPlans.$inferSelect;
        match: PairResult;
      }> = [];
      const alternatives: Array<{
        plan: typeof travelPlans.$inferSelect;
        match: PairResult;
      }> = [];
      for (const candidate of candidateRows) {
        if (
          !(await this.eligiblePlan(tx, candidate.id)) ||
          (await this.blocked(tx, plan.userId, candidate.userId))
        )
          continue;
        const match = await evaluatePair(
          asPlan(plan),
          asPlan(candidate),
          this.geography,
        );
        if (match.kind === "DIRECT") direct.push({ plan: candidate, match });
        else if (match.kind === "ALTERNATIVE")
          alternatives.push({ plan: candidate, match });
      }
      const circles = await tx
        .select()
        .from(travelCircles)
        .where(
          and(
            eq(travelCircles.destinationCampId, plan.destinationCampId),
            inArray(travelCircles.status, [...OPEN_CIRCLES]),
            sql`${travelCircles.memberCount} < ${travelCircles.maxMembers}`,
          ),
        )
        .orderBy(asc(travelCircles.createdAt), asc(travelCircles.id));
      const viable: Array<{
        circle: typeof travelCircles.$inferSelect;
        score: number;
      }> = [];
      for (const circle of circles) {
        const members: Array<{ plan: typeof travelPlans.$inferSelect }> =
          await tx
            .select({ plan: travelPlans })
            .from(travelCircleMembers)
            .innerJoin(
              travelPlans,
              eq(travelPlans.id, travelCircleMembers.travelPlanId),
            )
            .where(
              and(
                eq(travelCircleMembers.travelCircleId, circle.id),
                inArray(travelCircleMembers.membershipStatus, [
                  ...ACTIVE_MEMBERS,
                ]),
              ),
            );
        let score = 100;
        let okay =
          members.length > 0 &&
          !(await this.blockedAny(
            tx,
            plan.userId,
            members.map((member) => member.plan.userId),
          ));
        for (const member of members) {
          if (!okay) break;
          const match = await evaluatePair(
            asPlan(plan),
            asPlan(member.plan),
            this.geography,
          );
          if (match.kind !== "DIRECT") {
            okay = false;
            break;
          }
          score = Math.min(score, match.score);
        }
        if (okay) viable.push({ circle, score });
      }
      viable.sort(
        (a, b) =>
          this.circlePriority(a.circle) - this.circlePriority(b.circle) ||
          b.score - a.score ||
          a.circle.createdAt.getTime() - b.circle.createdAt.getTime() ||
          a.circle.id.localeCompare(b.circle.id),
      );
      if (viable[0]) {
        const joined = await this.joinCircle(tx, plan, viable[0].circle);
        if (joined) {
          await this.attempt(
            tx,
            plan.id,
            "JOINED_EXISTING_CIRCLE",
            startedAt,
            candidateRows.length,
            direct.length,
            alternatives.length,
            joined.id,
          );
          return { result: "JOINED_EXISTING_CIRCLE", circleId: joined.id };
        }
      }
      direct.sort(
        (a, b) =>
          b.match.score - a.match.score ||
          a.plan.createdAt.getTime() - b.plan.createdAt.getTime() ||
          a.plan.id.localeCompare(b.plan.id),
      );
      if (direct[0]) {
        const circle = await this.createCircle(
          tx,
          plan,
          direct[0].plan,
          direct[0].match,
        );
        await this.attempt(
          tx,
          plan.id,
          "CREATED_FORMING_CIRCLE",
          startedAt,
          candidateRows.length,
          direct.length,
          alternatives.length,
          circle.id,
        );
        return { result: "CREATED_FORMING_CIRCLE", circleId: circle.id };
      }
      alternatives.sort(
        (a, b) =>
          b.match.score - a.match.score ||
          a.plan.createdAt.getTime() - b.plan.createdAt.getTime() ||
          a.plan.id.localeCompare(b.plan.id),
      );
      if (alternatives[0]) {
        const offer = await this.createOffer(
          tx,
          plan,
          alternatives[0].plan,
          alternatives[0].match,
        );
        await this.attempt(
          tx,
          plan.id,
          offer ? "ALTERNATIVE_OFFER_CREATED" : "NO_MATCH",
          startedAt,
          candidateRows.length,
          0,
          alternatives.length,
        );
        return {
          result: offer ? "ALTERNATIVE_OFFER_CREATED" : "NO_MATCH",
          offerId: offer?.id,
        };
      }
      await this.attempt(
        tx,
        plan.id,
        "NO_MATCH",
        startedAt,
        candidateRows.length,
        0,
        0,
      );
      return { result: "NO_MATCH" };
    });
  }

  private async allocateExactGroup(
    group: Array<typeof travelPlans.$inferSelect>,
  ) {
    return db.transaction(async (tx: any) => {
      const sample = group[0]!;
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`match:${sample.destinationCampId}:${sample.intendedTravelDate}`}))`,
      );
      let available: Array<typeof travelPlans.$inferSelect> = await tx
        .select()
        .from(travelPlans)
        .where(
          and(
            inArray(
              travelPlans.id,
              group.map((plan) => plan.id),
            ),
            eq(travelPlans.status, "SEARCHING"),
          ),
        )
        .orderBy(asc(travelPlans.createdAt), asc(travelPlans.id));
      if (available.length < 2) return [];
      const blocks: Array<typeof userBlocks.$inferSelect> = await tx
        .select()
        .from(userBlocks)
        .where(
          and(
            inArray(
              userBlocks.blockerUserId,
              available.map((plan) => plan.userId),
            ),
            inArray(
              userBlocks.blockedUserId,
              available.map((plan) => plan.userId),
            ),
          ),
        );
      const blocked = (a: string, b: string) =>
        blocks.some(
          (row) =>
            (row.blockerUserId === a && row.blockedUserId === b) ||
            (row.blockerUserId === b && row.blockedUserId === a),
        );
      const handled: string[] = [];
      const circles: Array<typeof travelCircles.$inferSelect> = await tx
        .select()
        .from(travelCircles)
        .where(
          and(
            eq(travelCircles.destinationCampId, sample.destinationCampId),
            eq(travelCircles.travelDate, sample.intendedTravelDate),
            eq(travelCircles.originLgaId, sample.originLgaId),
            eq(travelCircles.departureWindow, sample.departureWindow),
            eq(travelCircles.transportMode, sample.transportMode),
            inArray(travelCircles.status, [...OPEN_CIRCLES]),
            sql`${travelCircles.memberCount}<${travelCircles.maxMembers}`,
          ),
        )
        .orderBy(
          sql`case when ${travelCircles.status}='FORMING' and ${travelCircles.memberCount}=2 then 0 else 1 end`,
          asc(travelCircles.createdAt),
          asc(travelCircles.id),
        );
      for (const circle of circles) {
        const members: Array<{ userId: string }> = await tx
          .select({ userId: travelCircleMembers.userId })
          .from(travelCircleMembers)
          .where(
            and(
              eq(travelCircleMembers.travelCircleId, circle.id),
              inArray(travelCircleMembers.membershipStatus, [
                ...ACTIVE_MEMBERS,
              ]),
            ),
          );
        const chosen: Array<typeof travelPlans.$inferSelect> = [];
        for (const plan of available) {
          if (chosen.length >= circle.maxMembers - circle.memberCount) break;
          if (
            (await this.blockedAny(
              tx,
              plan.userId,
              members.map((member) => member.userId),
            )) ||
            chosen.some((member) => blocked(plan.userId, member.userId))
          )
            continue;
          chosen.push(plan);
        }
        if (!chosen.length) continue;
        const next = circle.memberCount + chosen.length;
        const status =
          next >= circle.maxMembers ? "FULL" : next >= 3 ? "READY" : "FORMING";
        const [updated] = await tx
          .update(travelCircles)
          .set({ memberCount: next, status, updatedAt: new Date() })
          .where(
            and(
              eq(travelCircles.id, circle.id),
              eq(travelCircles.memberCount, circle.memberCount),
              sql`${travelCircles.memberCount}+${chosen.length}<=${travelCircles.maxMembers}`,
            ),
          )
          .returning();
        if (!updated)
          throw new ConflictException("Circle capacity changed concurrently");
        await tx
          .insert(travelCircleMembers)
          .values(
            chosen.map((plan) => ({
              travelCircleId: circle.id,
              travelPlanId: plan.id,
              userId: plan.userId,
            })),
          );
        await tx
          .update(travelPlans)
          .set({ status: "IN_CIRCLE", updatedAt: new Date() })
          .where(
            inArray(
              travelPlans.id,
              chosen.map((plan) => plan.id),
            ),
          );
        for (const plan of chosen) {
          handled.push(plan.id);
          await this.attempt(
            tx,
            plan.id,
            "JOINED_EXISTING_CIRCLE",
            new Date(),
            0,
            1,
            0,
            circle.id,
          );
        }
        available = available.filter(
          (plan) => !chosen.some((item) => item.id === plan.id),
        );
      }
      while (available.length >= 2) {
        const first = available.shift()!;
        const chunk = [first];
        for (let index = 0; index < available.length && chunk.length < 6;) {
          const candidate = available[index]!;
          if (
            chunk.every((member) => !blocked(candidate.userId, member.userId))
          ) {
            chunk.push(candidate);
            available.splice(index, 1);
          } else index++;
        }
        if (chunk.length < 2) continue;
        const circle = await this.createCircleGroup(tx, chunk);
        for (const plan of chunk) {
          handled.push(plan.id);
          await this.attempt(
            tx,
            plan.id,
            "CREATED_FORMING_CIRCLE",
            new Date(),
            0,
            1,
            0,
            circle.id,
          );
        }
      }
      return handled;
    });
  }

  private async createCircleGroup(
    tx: any,
    plans: Array<typeof travelPlans.$inferSelect>,
  ) {
    const first = plans[0]!;
    const status =
      plans.length >= 6 ? "FULL" : plans.length >= 3 ? "READY" : "FORMING";
    const [cohort] = await tx
      .insert(journeyCohorts)
      .values({
        destinationCampId: first.destinationCampId,
        travelDate: first.intendedTravelDate,
        departureWindow: first.departureWindow,
        transportMode: first.transportMode,
      })
      .returning();
    const [circle] = await tx
      .insert(travelCircles)
      .values({
        journeyCohortId: cohort.id,
        originLgaId: first.originLgaId,
        originTownId: first.originTownId,
        destinationCampId: first.destinationCampId,
        travelDate: first.intendedTravelDate,
        departureWindow: first.departureWindow,
        transportMode: first.transportMode,
        status,
        memberCount: plans.length,
        maxMembers: 6,
      })
      .returning();
    await tx
      .insert(travelCircleMembers)
      .values(
        plans.map((plan) => ({
          travelCircleId: circle.id,
          travelPlanId: plan.id,
          userId: plan.userId,
        })),
      );
    const updated = await tx
      .update(travelPlans)
      .set({ status: "IN_CIRCLE", updatedAt: new Date() })
      .where(
        and(
          inArray(
            travelPlans.id,
            plans.map((plan) => plan.id),
          ),
          eq(travelPlans.status, "SEARCHING"),
        ),
      )
      .returning();
    if (updated.length !== plans.length)
      throw new ConflictException("A plan was matched concurrently");
    await this.outbox(
      tx,
      status === "FULL"
        ? "TravelCircleFull"
        : status === "READY"
          ? "TravelCircleReady"
          : "TravelCircleForming",
      circle.id,
      first.userId,
    );
    await circleSystemMessage(
      tx,
      circle.id,
      `circle-created:${circle.id}`,
      `Your Travel Circle has formed with ${plans.length} verified PCMs.`,
    );
    await circleSystemMessage(
      tx,
      circle.id,
      `circle-safety:${circle.id}`,
      "Meet only in public places, protect personal information, and report anything unsafe.",
      "SAFETY_NOTICE",
    );
    return circle;
  }

  async status(userId: string) {
    const [plan] = await db
      .select()
      .from(travelPlans)
      .where(
        and(
          eq(travelPlans.userId, userId),
          inArray(travelPlans.status, [
            "SEARCHING",
            "MATCHED",
            "IN_CIRCLE",
            "LOCKED",
          ]),
        ),
      )
      .limit(1);
    if (!plan) return { status: "NO_ACTIVE_PLAN" };
    const [membership] = await db
      .select({ membership: travelCircleMembers, circle: travelCircles })
      .from(travelCircleMembers)
      .innerJoin(
        travelCircles,
        eq(travelCircles.id, travelCircleMembers.travelCircleId),
      )
      .where(
        and(
          eq(travelCircleMembers.travelPlanId, plan.id),
          inArray(travelCircleMembers.membershipStatus, [...ACTIVE_MEMBERS]),
        ),
      )
      .limit(1);
    const [offer] = await db
      .select()
      .from(matchOffers)
      .where(
        and(
          eq(matchOffers.travelPlanId, plan.id),
          eq(matchOffers.status, "PENDING"),
          gt(matchOffers.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(matchOffers.createdAt))
      .limit(1);
    return {
      status: membership?.circle.status ?? plan.status,
      planId: plan.id,
      circle: membership?.circle ?? null,
      alternativeOfferAvailable: Boolean(offer),
    };
  }
  async currentCircle(userId: string) {
    const [row] = await db
      .select({ circle: travelCircles, membership: travelCircleMembers })
      .from(travelCircleMembers)
      .innerJoin(
        travelCircles,
        eq(travelCircles.id, travelCircleMembers.travelCircleId),
      )
      .where(
        and(
          eq(travelCircleMembers.userId, userId),
          inArray(travelCircleMembers.membershipStatus, [...ACTIVE_MEMBERS]),
        ),
      )
      .limit(1);
    if (!row) return null;
    const members = await db
      .select({
        displayName: pcmProfiles.displayName,
        verifiedStatus: pcmVerifications.status,
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
          eq(travelCircleMembers.travelCircleId, row.circle.id),
          inArray(travelCircleMembers.membershipStatus, [...ACTIVE_MEMBERS]),
        ),
      );
    return {
      circle: row.circle,
      members: members.map((member) => ({
        displayName: member.displayName ?? "Verified PCM",
        verified: member.verifiedStatus === "VERIFIED",
      })),
    };
  }
  async offers(userId: string) {
    return db
      .select()
      .from(matchOffers)
      .innerJoin(travelPlans, eq(travelPlans.id, matchOffers.travelPlanId))
      .where(
        and(
          eq(travelPlans.userId, userId),
          eq(matchOffers.status, "PENDING"),
          gt(matchOffers.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(matchOffers.createdAt));
  }
  async offer(userId: string, id: string) {
    const [row] = await db
      .select({ offer: matchOffers, plan: travelPlans })
      .from(matchOffers)
      .innerJoin(travelPlans, eq(travelPlans.id, matchOffers.travelPlanId))
      .where(and(eq(matchOffers.id, id), eq(travelPlans.userId, userId)))
      .limit(1);
    if (!row) throw new NotFoundException("Match Offer not found");
    return row;
  }
  async decline(userId: string, id: string) {
    await this.offer(userId, id);
    const [row] = await db
      .update(matchOffers)
      .set({ status: "DECLINED", respondedAt: new Date() })
      .where(and(eq(matchOffers.id, id), eq(matchOffers.status, "PENDING")))
      .returning();
    return row ?? this.offer(userId, id).then((value) => value.offer);
  }
  async accept(userId: string, id: string) {
    const result = await db.transaction(async (tx: any) => {
      const [owned] = await tx
        .select({ offer: matchOffers, plan: travelPlans })
        .from(matchOffers)
        .innerJoin(travelPlans, eq(travelPlans.id, matchOffers.travelPlanId))
        .where(and(eq(matchOffers.id, id), eq(travelPlans.userId, userId)))
        .limit(1);
      if (!owned) throw new NotFoundException("Match Offer not found");
      if (
        owned.offer.status !== "PENDING" ||
        owned.offer.expiresAt <= new Date() ||
        owned.plan.status !== "SEARCHING"
      )
        throw new ConflictException({ code: "OFFER_NO_LONGER_AVAILABLE" });
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`offer:${owned.plan.destinationCampId}:${owned.offer.proposedTravelDate ?? owned.plan.intendedTravelDate}`}))`,
      );
      const [candidate] = owned.offer.candidateTravelPlanId
        ? await tx
            .select()
            .from(travelPlans)
            .where(
              and(
                eq(travelPlans.id, owned.offer.candidateTravelPlanId),
                eq(travelPlans.status, "SEARCHING"),
              ),
            )
            .limit(1)
        : [];
      if (!candidate)
        throw new ConflictException({ code: "OFFER_NO_LONGER_AVAILABLE" });
      const values = {
        intendedTravelDate:
          owned.offer.proposedTravelDate ?? owned.plan.intendedTravelDate,
        departureWindow:
          owned.offer.proposedDepartureWindow ?? owned.plan.departureWindow,
        transportMode:
          owned.offer.proposedTransportMode ?? owned.plan.transportMode,
        updatedAt: new Date(),
      };
      const [updated] = await tx
        .update(travelPlans)
        .set(values)
        .where(
          and(
            eq(travelPlans.id, owned.plan.id),
            eq(travelPlans.status, "SEARCHING"),
          ),
        )
        .returning();
      if (!updated)
        throw new ConflictException({ code: "OFFER_NO_LONGER_AVAILABLE" });
      const match = await evaluatePair(
        asPlan(updated),
        asPlan(candidate),
        this.geography,
      );
      if (match.kind !== "DIRECT")
        throw new ConflictException({ code: "OFFER_NO_LONGER_AVAILABLE" });
      const circle = await this.createCircle(tx, updated, candidate, match);
      await tx
        .update(matchOffers)
        .set({ status: "ACCEPTED", respondedAt: new Date() })
        .where(eq(matchOffers.id, id));
      await tx
        .update(matchOffers)
        .set({ status: "WITHDRAWN", respondedAt: new Date() })
        .where(
          and(
            eq(matchOffers.travelPlanId, updated.id),
            eq(matchOffers.status, "PENDING"),
            ne(matchOffers.id, id),
          ),
        );
      return { offerId: id, circleId: circle.id, status: "ACCEPTED" };
    });
    return result;
  }
  async expireOffers(now = new Date()) {
    return db
      .update(matchOffers)
      .set({ status: "EXPIRED", respondedAt: now })
      .where(
        and(eq(matchOffers.status, "PENDING"), lte(matchOffers.expiresAt, now)),
      )
      .returning();
  }
  async metrics() {
    const attempts = await db.execute(
      sql`select count(*)::int as plans_processed,count(*) filter(where result_type in ('JOINED_EXISTING_CIRCLE','CREATED_FORMING_CIRCLE'))::int as plans_matched,count(*) filter(where result_type='NO_MATCH')::int as plans_unmatched,count(*) filter(where result_type='ALTERNATIVE_OFFER_CREATED')::int as alternative_offers_created from match_attempt`,
    );
    const circles = await db.execute(
      sql`select count(*)::int as circles_created,count(*) filter(where status='READY')::int as circles_ready,count(*) filter(where status='FULL')::int as circles_full,coalesce(avg(member_count) filter(where status<>'DISSOLVED'),0)::numeric(6,2) as average_circle_size from travel_circle`,
    );
    return {
      algorithmVersion: MATCHING_ALGORITHM_VERSION,
      ...attempts.rows[0],
      ...circles.rows[0],
    };
  }

  async detachPlan(tx: any, planId: string) {
    const [member] = await tx
      .select()
      .from(travelCircleMembers)
      .where(
        and(
          eq(travelCircleMembers.travelPlanId, planId),
          inArray(travelCircleMembers.membershipStatus, [...ACTIVE_MEMBERS]),
        ),
      )
      .limit(1);
    if (!member) return null;
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`circle:${member.travelCircleId}`}))`,
    );
    const [circle] = await tx
      .select()
      .from(travelCircles)
      .where(eq(travelCircles.id, member.travelCircleId))
      .limit(1);
    const [changed] = await tx
      .update(travelCircleMembers)
      .set({ membershipStatus: "LEFT", leftAt: new Date() })
      .where(
        and(
          eq(travelCircleMembers.id, member.id),
          inArray(travelCircleMembers.membershipStatus, [...ACTIVE_MEMBERS]),
        ),
      )
      .returning();
    if (!changed) return null;
    await circleSystemMessage(
      tx,
      circle.id,
      `member-left:${member.id}`,
      "A member left this Travel Circle.",
    );
    const next = circle.memberCount - 1;
    const afterCutoff =
      circle.status === "LOCKED" ||
      matchingIsClosed(circle.travelDate, circle.departureWindow);
    if (next <= 1) {
      const remaining = await tx
        .select()
        .from(travelCircleMembers)
        .where(
          and(
            eq(travelCircleMembers.travelCircleId, circle.id),
            inArray(travelCircleMembers.membershipStatus, [...ACTIVE_MEMBERS]),
          ),
        );
      for (const row of remaining) {
        await tx
          .update(travelCircleMembers)
          .set({ membershipStatus: "REMOVED", removedAt: new Date() })
          .where(eq(travelCircleMembers.id, row.id));
        await tx
          .update(travelPlans)
          .set({ status: "SEARCHING", updatedAt: new Date() })
          .where(
            and(
              eq(travelPlans.id, row.travelPlanId),
              inArray(travelPlans.status, ["IN_CIRCLE", "LOCKED"]),
            ),
          );
        if (!afterCutoff)
          await this.outbox(
            tx,
            "TravelPlanRematchRequested",
            row.travelPlanId,
            row.userId,
          );
      }
      await tx
        .update(travelCircles)
        .set({
          status: "DISSOLVED",
          memberCount: 0,
          closedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(travelCircles.id, circle.id));
      const conversation = await ensureConversation(tx, circle.id);
      await tx
        .update(circleConversations)
        .set({ closedAt: new Date() })
        .where(eq(circleConversations.id, conversation.id));
      await this.outbox(tx, "TravelCircleDissolved", circle.id, member.userId);
      return { circleId: circle.id, status: "DISSOLVED", afterCutoff };
    }
    const status = afterCutoff
      ? "LOCKED"
      : next >= 6
        ? "FULL"
        : next >= 3
          ? "READY"
          : "FORMING";
    await tx
      .update(travelCircles)
      .set({ memberCount: next, status, updatedAt: new Date() })
      .where(eq(travelCircles.id, circle.id));
    return { circleId: circle.id, status, afterCutoff };
  }

  private async eligiblePlan(tx: any, id: string) {
    const [row] = await tx
      .select({
        plan: travelPlans,
        user: users,
        verification: pcmVerifications,
      })
      .from(travelPlans)
      .innerJoin(users, eq(users.id, travelPlans.userId))
      .innerJoin(
        pcmVerifications,
        eq(pcmVerifications.id, travelPlans.pcmVerificationId),
      )
      .where(eq(travelPlans.id, id))
      .limit(1);
    if (
      !row ||
      row.plan.status !== "SEARCHING" ||
      row.user.accountStatus !== "ACTIVE" ||
      row.verification.status !== "VERIFIED" ||
      row.plan.transportMode === "PRIVATE_VEHICLE" ||
      matchingIsClosed(row.plan.intendedTravelDate, row.plan.departureWindow)
    )
      return null;
    const [latest] = await tx
      .select({ id: pcmVerifications.id, status: pcmVerifications.status })
      .from(pcmVerifications)
      .where(eq(pcmVerifications.userId, row.plan.userId))
      .orderBy(desc(pcmVerifications.updatedAt))
      .limit(1);
    if (
      !latest ||
      latest.id !== row.plan.pcmVerificationId ||
      latest.status !== "VERIFIED"
    )
      return null;
    const [restriction] = await tx
      .select({ id: matchingRestrictions.id })
      .from(matchingRestrictions)
      .where(
        and(
          eq(matchingRestrictions.userId, row.plan.userId),
          eq(matchingRestrictions.active, true),
          or(
            isNull(matchingRestrictions.expiresAt),
            gt(matchingRestrictions.expiresAt, new Date()),
          ),
        ),
      )
      .limit(1);
    return restriction ? null : row.plan;
  }
  private blocked(tx: any, a: string, b: string) {
    return tx
      .select({ id: userBlocks.id })
      .from(userBlocks)
      .where(
        or(
          and(eq(userBlocks.blockerUserId, a), eq(userBlocks.blockedUserId, b)),
          and(eq(userBlocks.blockerUserId, b), eq(userBlocks.blockedUserId, a)),
        ),
      )
      .limit(1)
      .then((rows: any[]) => rows.length > 0);
  }
  private blockedAny(tx: any, a: string, others: string[]) {
    if (!others.length) return false;
    return tx
      .select({ id: userBlocks.id })
      .from(userBlocks)
      .where(
        or(
          and(
            eq(userBlocks.blockerUserId, a),
            inArray(userBlocks.blockedUserId, others),
          ),
          and(
            eq(userBlocks.blockedUserId, a),
            inArray(userBlocks.blockerUserId, others),
          ),
        ),
      )
      .limit(1)
      .then((rows: any[]) => rows.length > 0);
  }
  private circlePriority(circle: typeof travelCircles.$inferSelect) {
    return circle.status === "FORMING" && circle.memberCount === 2
      ? 0
      : circle.status === "READY"
        ? 1
        : 2;
  }
  private async joinCircle(
    tx: any,
    plan: typeof travelPlans.$inferSelect,
    circle: typeof travelCircles.$inferSelect,
  ) {
    const next = circle.memberCount + 1;
    const status =
      next >= circle.maxMembers ? "FULL" : next >= 3 ? "READY" : "FORMING";
    const [updated] = await tx
      .update(travelCircles)
      .set({ memberCount: next, status, updatedAt: new Date() })
      .where(
        and(
          eq(travelCircles.id, circle.id),
          eq(travelCircles.memberCount, circle.memberCount),
          inArray(travelCircles.status, [...OPEN_CIRCLES]),
          sql`${travelCircles.memberCount} < ${travelCircles.maxMembers}`,
        ),
      )
      .returning();
    if (!updated) return null;
    await tx
      .insert(travelCircleMembers)
      .values({
        travelCircleId: circle.id,
        travelPlanId: plan.id,
        userId: plan.userId,
      });
    await tx
      .update(travelPlans)
      .set({ status: "IN_CIRCLE", updatedAt: new Date() })
      .where(
        and(eq(travelPlans.id, plan.id), eq(travelPlans.status, "SEARCHING")),
      );
    await this.outbox(tx, "TravelCircleMemberJoined", circle.id, plan.userId);
    await circleSystemMessage(
      tx,
      circle.id,
      `member-joined:${plan.id}`,
      "A verified PCM joined this Travel Circle.",
    );
    if (status === "READY" && circle.status === "FORMING") {
      await this.outbox(tx, "TravelCircleReady", circle.id, plan.userId);
      await circleSystemMessage(
        tx,
        circle.id,
        `circle-ready:${circle.id}`,
        "This Travel Circle is ready to coordinate.",
      );
    }
    if (status === "FULL")
      await this.outbox(tx, "TravelCircleFull", circle.id, plan.userId);
    return updated;
  }
  private async createCircle(
    tx: any,
    a: typeof travelPlans.$inferSelect,
    b: typeof travelPlans.$inferSelect,
    match: PairResult,
  ) {
    const [cohort] = await tx
      .insert(journeyCohorts)
      .values({
        originHubId: match.originHubId ?? null,
        destinationCampId: a.destinationCampId,
        travelDate: a.intendedTravelDate,
        departureWindow: match.proposedDepartureWindow ?? a.departureWindow,
        transportMode: match.proposedTransportMode ?? a.transportMode,
      })
      .returning();
    const [circle] = await tx
      .insert(travelCircles)
      .values({
        journeyCohortId: cohort.id,
        originHubId: match.originHubId ?? null,
        originLgaId: a.originLgaId,
        originTownId: a.originTownId,
        destinationCampId: a.destinationCampId,
        travelDate: a.intendedTravelDate,
        departureWindow: match.proposedDepartureWindow ?? a.departureWindow,
        transportMode: match.proposedTransportMode ?? a.transportMode,
        status: "FORMING",
        memberCount: 2,
        maxMembers: 6,
      })
      .returning();
    await tx.insert(travelCircleMembers).values([
      { travelCircleId: circle.id, travelPlanId: a.id, userId: a.userId },
      { travelCircleId: circle.id, travelPlanId: b.id, userId: b.userId },
    ]);
    const updated = await tx
      .update(travelPlans)
      .set({ status: "IN_CIRCLE", updatedAt: new Date() })
      .where(
        and(
          inArray(travelPlans.id, [a.id, b.id]),
          eq(travelPlans.status, "SEARCHING"),
        ),
      )
      .returning();
    if (updated.length !== 2)
      throw new ConflictException("Candidate was matched concurrently");
    await this.outbox(tx, "TravelCircleForming", circle.id, a.userId);
    await circleSystemMessage(
      tx,
      circle.id,
      `circle-created:${circle.id}`,
      "Your Travel Circle has formed with 2 verified PCMs.",
    );
    await circleSystemMessage(
      tx,
      circle.id,
      `circle-safety:${circle.id}`,
      "Meet only in public places, protect personal information, and report anything unsafe.",
      "SAFETY_NOTICE",
    );
    return circle;
  }
  private async createOffer(
    tx: any,
    a: typeof travelPlans.$inferSelect,
    b: typeof travelPlans.$inferSelect,
    match: PairResult,
  ) {
    const changesA =
      match.proposedTravelDate !== a.intendedTravelDate ||
      match.proposedDepartureWindow !== a.departureWindow ||
      match.proposedTransportMode !== a.transportMode;
    const changesB =
      match.proposedTravelDate !== b.intendedTravelDate ||
      match.proposedDepartureWindow !== b.departureWindow ||
      match.proposedTransportMode !== b.transportMode;
    let target = changesA ? a : b,
      candidate = changesA ? b : a;
    if (!changesA && !changesB) {
      target = a;
      candidate = b;
    }
    const [offer] = await tx
      .insert(matchOffers)
      .values({
        travelPlanId: target.id,
        candidateTravelPlanId: candidate.id,
        offerType: match.offerType ?? "ALTERNATIVE_DATE",
        proposedTravelDate: match.proposedTravelDate,
        proposedDepartureWindow: match.proposedDepartureWindow,
        proposedTransportMode: match.proposedTransportMode,
        proposedOriginHubId: match.originHubId ?? null,
        expiresAt: new Date(
          Date.now() +
            Number(process.env.MATCH_OFFER_TTL_HOURS ?? 24) * 3_600_000,
        ),
      })
      .onConflictDoNothing()
      .returning();
    if (offer)
      await this.outbox(
        tx,
        "AlternativeMatchAvailable",
        target.id,
        target.userId,
      );
    return offer;
  }
  private attempt(
    tx: any,
    travelPlanId: string,
    resultType: any,
    startedAt: Date,
    candidateCount: number,
    directCandidateCount: number,
    alternativeCandidateCount: number,
    selectedCircleId?: string,
  ) {
    return tx
      .insert(matchAttempts)
      .values({
        travelPlanId,
        algorithmVersion: MATCHING_ALGORITHM_VERSION,
        candidateCount,
        directCandidateCount,
        alternativeCandidateCount,
        resultType,
        selectedCircleId,
        startedAt,
        completedAt: new Date(),
      });
  }
  private outbox(
    tx: any,
    eventType: string,
    aggregateId: string,
    userId: string,
  ) {
    return tx
      .insert(domainOutbox)
      .values({
        aggregateType: eventType.startsWith("TravelCircle")
          ? "TRAVEL_CIRCLE"
          : "TRAVEL_PLAN",
        aggregateId,
        eventType,
        payload: { aggregateId, userId, occurredAt: new Date().toISOString() },
      });
  }
}
function gteDate(column: any, value: string) {
  return sql`${column} >= ${value}`;
}
