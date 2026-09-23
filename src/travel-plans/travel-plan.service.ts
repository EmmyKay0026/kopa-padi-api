import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/database.js";
import {
  accountRestrictions,
  auditLogs,
  domainOutbox,
  lgas,
  orientationCamps,
  pcmVerifications,
  states,
  towns,
  travelPlans,
} from "../db/schema.js";
import { calculateExpiry } from "./travel-plan.domain.js";
import { MatchingService } from "../matching/matching.service.js";
import { enabled } from '../config/runtime.js';
type Input = {
  originStateId: string;
  originLgaId: string;
  originTownId?: string | null;
  intendedTravelDate: string;
  dateFlexibilityDays: 0 | 1 | 2;
  departureWindow:
    "EARLY_MORNING" | "MORNING" | "LATE_MORNING" | "AFTERNOON" | "FLEXIBLE";
  transportMode:
    "COMMERCIAL_BUS" | "TRAIN" | "FLIGHT" | "PRIVATE_VEHICLE" | "UNDECIDED";
  transportFlexible: boolean;
  nearbyMatchingEnabled: boolean;
  groupPreference: "ANY_VERIFIED_PCM";
};
function hasDatabaseCode(error: unknown, code: string) {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 4 && current && typeof current === "object";
    depth++
  ) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === code) return true;
    current = candidate.cause;
  }
  return false;
}
@Injectable()
export class TravelPlanService {
  constructor(private readonly matching: MatchingService) {}
  async create(userId: string, input: Input) {
    if(!enabled('TRAVEL_PLAN_CREATION_ENABLED',true))throw new ForbiddenException('Travel Plan creation is temporarily unavailable during the pilot');
    const [restriction]=await db.select({id:accountRestrictions.id}).from(accountRestrictions).where(and(eq(accountRestrictions.userId,userId),inArray(accountRestrictions.restrictionType,['TRAVEL_PLAN_DISABLED','VERIFICATION_REVIEW_REQUIRED','ACCOUNT_SUSPENDED']),eq(accountRestrictions.status,'ACTIVE'))).limit(1);
    if(restriction)throw new ForbiddenException('Travel Plan creation is unavailable for this account');
    const geography = await this.validateGeography(input);
    const [verification] = await db
      .select()
      .from(pcmVerifications)
      .innerJoin(
        orientationCamps,
        eq(orientationCamps.id, pcmVerifications.orientationCampId),
      )
      .where(eq(pcmVerifications.userId, userId))
      .orderBy(desc(pcmVerifications.updatedAt))
      .limit(1);
    if (!verification || verification.pcm_verification.status !== "VERIFIED")
      throw new ConflictException({
        code: "VERIFICATION_REQUIRED",
        message: "A current VERIFIED PCM posting is required",
      });
    const id = crypto.randomUUID();
    const now = new Date();
    try {
      await db.transaction(async (tx) => {
        await tx
          .insert(travelPlans)
          .values({
            id,
            userId,
            pcmVerificationId: verification.pcm_verification.id,
            originStateId: geography.state.id,
            originLgaId: geography.lga.id,
            originTownId: geography.town?.id ?? null,
            destinationCampId: verification.pcm_verification.orientationCampId,
            intendedTravelDate: input.intendedTravelDate,
            dateFlexibilityDays: input.dateFlexibilityDays,
            departureWindow: input.departureWindow,
            transportMode: input.transportMode,
            transportFlexible: input.transportFlexible,
            nearbyMatchingEnabled: input.nearbyMatchingEnabled,
            groupPreference: input.groupPreference,
            status: "SEARCHING",
            submittedAt: now,
            expiresAt: calculateExpiry(input.intendedTravelDate),
            createdAt: now,
            updatedAt: now,
          });
        await this.event(tx, "TravelPlanCreated", id, userId, now);
        await tx
          .insert(auditLogs)
          .values({
            actorUserId: userId,
            action: "TRAVEL_PLAN_CREATED",
            resourceType: "TRAVEL_PLAN",
            resourceId: id,
            metadata: { status: "SEARCHING" },
          });
      });
    } catch (error) {
      if (hasDatabaseCode(error, "23505"))
        throw new ConflictException("You already have an active Travel Plan");
      throw error;
    }
    return this.ownedDetail(userId, id);
  }
  async active(userId: string) {
    const [row] = await db
      .select({ id: travelPlans.id })
      .from(travelPlans)
      .where(
        and(
          eq(travelPlans.userId, userId),
          inArray(travelPlans.status, [
            "DRAFT",
            "SEARCHING",
            "MATCHED",
            "IN_CIRCLE",
            "LOCKED",
            "IN_JOURNEY",
          ]),
        ),
      )
      .limit(1);
    return row ? this.ownedDetail(userId, row.id) : null;
  }
  async history(userId: string) {
    return db
      .select()
      .from(travelPlans)
      .where(eq(travelPlans.userId, userId))
      .orderBy(desc(travelPlans.createdAt));
  }
  async ownedDetail(userId: string, id: string) {
    const [row] = await db
      .select({
        plan: travelPlans,
        originState: states,
        originLga: lgas,
        originTown: towns,
        destination: orientationCamps,
      })
      .from(travelPlans)
      .innerJoin(states, eq(states.id, travelPlans.originStateId))
      .innerJoin(lgas, eq(lgas.id, travelPlans.originLgaId))
      .leftJoin(towns, eq(towns.id, travelPlans.originTownId))
      .innerJoin(
        orientationCamps,
        eq(orientationCamps.id, travelPlans.destinationCampId),
      )
      .where(and(eq(travelPlans.id, id), eq(travelPlans.userId, userId)));
    if (!row) throw new NotFoundException("Travel Plan not found");
    return row;
  }
  async update(userId: string, id: string, input: Input) {
    const current = await this.ownedDetail(userId, id);
    if (!["SEARCHING", "IN_CIRCLE"].includes(current.plan.status))
      throw new ConflictException("This Travel Plan cannot be edited");
    const geography = await this.validateGeography(input);
    const values = {
      originStateId: geography.state.id,
      originLgaId: geography.lga.id,
      originTownId: geography.town?.id ?? null,
      intendedTravelDate: input.intendedTravelDate,
      dateFlexibilityDays: input.dateFlexibilityDays,
      departureWindow: input.departureWindow,
      transportMode: input.transportMode,
      transportFlexible: input.transportFlexible,
      nearbyMatchingEnabled: input.nearbyMatchingEnabled,
      groupPreference: input.groupPreference,
      expiresAt: calculateExpiry(input.intendedTravelDate),
    };
    const changed = Object.entries(values).some(
      ([key, value]) =>
        String((current.plan as any)[key] ?? "") !== String(value ?? ""),
    );
    if (!changed) return current;
    const now = new Date();
    await db.transaction(async (tx) => {
      if (current.plan.status === "IN_CIRCLE")
        await this.matching.detachPlan(tx, id);
      const [updated] = await tx
        .update(travelPlans)
        .set({ ...values, status: "SEARCHING", updatedAt: now })
        .where(
          and(
            eq(travelPlans.id, id),
            eq(travelPlans.userId, userId),
            eq(travelPlans.status, current.plan.status),
          ),
        )
        .returning();
      if (!updated)
        throw new ConflictException("Travel Plan changed; refresh and retry");
      await this.event(tx, "TravelPlanUpdated", id, userId, now);
      await tx
        .insert(auditLogs)
        .values({
          actorUserId: userId,
          action: "TRAVEL_PLAN_UPDATED",
          resourceType: "TRAVEL_PLAN",
          resourceId: id,
          metadata: {},
        });
    });
    return this.ownedDetail(userId, id);
  }
  async cancel(
    userId: string,
    id: string,
    reason?:
      | "TRAVEL_NO_LONGER_NEEDED"
      | "TRAVEL_DATE_CHANGED"
      | "TRANSPORT_CHANGED"
      | "CREATED_BY_MISTAKE"
      | "OTHER",
  ) {
    const current = await this.ownedDetail(userId, id);
    if (current.plan.status === "CANCELLED") return current;
    if (!["SEARCHING", "DRAFT", "IN_CIRCLE", "LOCKED"].includes(current.plan.status))
      throw new ConflictException("This Travel Plan cannot be cancelled");
    const now = new Date();
    await db.transaction(async (tx) => {
      if (["IN_CIRCLE", "LOCKED"].includes(current.plan.status))
        await this.matching.detachPlan(tx, id);
      const [updated] = await tx
        .update(travelPlans)
        .set({
          status: "CANCELLED",
          cancelledAt: now,
          cancellationReason: reason,
          updatedAt: now,
        })
        .where(
          and(
            eq(travelPlans.id, id),
            eq(travelPlans.userId, userId),
            eq(travelPlans.status, current.plan.status),
          ),
        )
        .returning();
      if (!updated)
        throw new ConflictException("Travel Plan changed; refresh and retry");
      await this.event(tx, "TravelPlanCancelled", id, userId, now);
      await tx
        .insert(auditLogs)
        .values({
          actorUserId: userId,
          action: "TRAVEL_PLAN_CANCELLED",
          resourceType: "TRAVEL_PLAN",
          resourceId: id,
          metadata: { reason },
        });
    });
    return this.ownedDetail(userId, id);
  }
  private async validateGeography(input: Input) {
    const [[state], [lga], [town]] = await Promise.all([
      db
        .select()
        .from(states)
        .where(
          and(eq(states.id, input.originStateId), eq(states.isActive, true)),
        )
        .limit(1),
      db
        .select()
        .from(lgas)
        .where(and(eq(lgas.id, input.originLgaId), eq(lgas.isActive, true)))
        .limit(1),
      input.originTownId
        ? db
            .select()
            .from(towns)
            .where(
              and(eq(towns.id, input.originTownId), eq(towns.isActive, true)),
            )
            .limit(1)
        : Promise.resolve([]),
    ]);
    if (!state || !lga)
      throw new NotFoundException("Active State or LGA not found");
    if (lga.stateId !== state.id)
      throw new BadRequestException("LGA does not belong to selected State");
    if (input.originTownId && (!town || town.lgaId !== lga.id))
      throw new BadRequestException("Town does not belong to selected LGA");
    return { state, lga, town };
  }
  private event(
    tx: any,
    eventType: string,
    travelPlanId: string,
    userId: string,
    occurredAt: Date,
  ) {
    return tx
      .insert(domainOutbox)
      .values({
        aggregateType: "TRAVEL_PLAN",
        aggregateId: travelPlanId,
        eventType,
        payload: { travelPlanId, userId, occurredAt: occurredAt.toISOString() },
      });
  }
}
