import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../src/db/database.js";
import {
  matchOffers,
  matchingRestrictions,
  nyscIntakes,
  orientationCamps,
  pcmVerifications,
  travelCircleMembers,
  travelCircles,
  travelPlans,
  userBlocks,
  users,
} from "../src/db/schema.js";
import { GeographyService } from "../src/geography/geography.service.js";
import { MatchingService } from "../src/matching/matching.service.js";
const enabled = Boolean(process.env.DATABASE_URL?.includes("kopa_padi_phase4"));
const suite = enabled ? describe : describe.skip;
const matching = new MatchingService(new GeographyService());
let campId = "";
let intakeId = "";
let reviewerId = "";
let serial = 0;
const simulation =
  process.env.RUN_MATCHING_SIMULATION === "true" ? it : it.skip;
async function makePlan(
  options: {
    date?: string;
    flex?: 0 | 1 | 2;
    lga?: string;
    town?: string | null;
    nearby?: boolean;
    mode?:
      | "COMMERCIAL_BUS"
      | "TRAIN"
      | "FLIGHT"
      | "PRIVATE_VEHICLE"
      | "UNDECIDED";
    transportFlexible?: boolean;
    departure?:
      | "EARLY_MORNING"
      | "MORNING"
      | "LATE_MORNING"
      | "AFTERNOON"
      | "FLEXIBLE";
    status?: "SEARCHING";
  } = {},
) {
  serial++;
  const userId = crypto.randomUUID();
  const verificationId = crypto.randomUUID();
  const planId = crypto.randomUUID();
  await db.insert(users).values({
    id: userId,
    name: `PCM ${serial}`,
    email: `phase4-${serial}-${userId}@test.invalid`,
    emailVerified: true,
  });
  await db.insert(pcmVerifications).values({
    id: verificationId,
    userId,
    nyscIntakeId: intakeId,
    orientationCampId: campId,
    status: "VERIFIED",
    submittedAt: new Date(),
    reviewedAt: new Date(),
    verifiedAt: new Date(),
    reviewedBy: reviewerId,
  });
  await db.insert(travelPlans).values({
    id: planId,
    userId,
    pcmVerificationId: verificationId,
    originStateId: "NG017",
    originLgaId: options.lga ?? "NG017025",
    originTownId: options.town ?? null,
    destinationCampId: campId,
    intendedTravelDate: options.date ?? "2098-01-14",
    dateFlexibilityDays: options.flex ?? 0,
    departureWindow: options.departure ?? "MORNING",
    transportMode: options.mode ?? "COMMERCIAL_BUS",
    transportFlexible: options.transportFlexible ?? false,
    nearbyMatchingEnabled: options.nearby ?? true,
    groupPreference: "ANY_VERIFIED_PCM",
    status: "SEARCHING",
    expiresAt: new Date("2099-01-01"),
  });
  return { userId, planId };
}
suite.sequential("Matching PostgreSQL integration", () => {
  beforeAll(async () => {
    reviewerId = crypto.randomUUID();
    await db.insert(users).values({
      id: reviewerId,
      name: "Reviewer",
      email: `reviewer-${reviewerId}@test.invalid`,
      emailVerified: true,
      role: "ADMIN",
    });
    const [intake] = await db.select().from(nyscIntakes).limit(1);
    intakeId = intake.id;
    const [camp] = await db.select().from(orientationCamps).limit(1);
    campId = camp.id;
  });
  afterAll(async () => {
    await pool.end();
  });
  it("forms deterministic 6+6+6+2 circles for 20 users, then fills the 2-member Circle first", async () => {
    const plans = [];
    for (let i = 0; i < 20; i++) plans.push(await makePlan());
    for (const plan of plans) await matching.processPlan(plan.planId);
    let circles = await db
      .select()
      .from(travelCircles)
      .where(eq(travelCircles.travelDate, "2098-01-14"))
      .orderBy(travelCircles.createdAt);
    expect(circles.map((circle) => circle.memberCount)).toEqual([6, 6, 6, 2]);
    expect(circles.map((circle) => circle.status)).toEqual([
      "FULL",
      "FULL",
      "FULL",
      "FORMING",
    ]);
    const next = await makePlan();
    await matching.processPlan(next.planId);
    circles = await db
      .select()
      .from(travelCircles)
      .where(eq(travelCircles.travelDate, "2098-01-14"))
      .orderBy(travelCircles.createdAt);
    expect(circles.map((circle) => circle.memberCount)).toEqual([6, 6, 6, 3]);
    expect(circles[3]!.status).toBe("READY");
  }, 30_000);
  it("creates one pair Circle under concurrent and duplicate worker processing", async () => {
    const a = await makePlan({ date: "2098-02-14" });
    const b = await makePlan({ date: "2098-02-14" });
    await Promise.all([
      matching.processPlan(a.planId),
      matching.processPlan(b.planId),
      matching.processPlan(b.planId),
    ]);
    const circles = await db
      .select()
      .from(travelCircles)
      .where(eq(travelCircles.travelDate, "2098-02-14"));
    expect(circles).toHaveLength(1);
    expect(circles[0]!.memberCount).toBe(2);
    expect(
      await db
        .select()
        .from(travelCircleMembers)
        .where(
          and(
            eq(travelCircleMembers.travelCircleId, circles[0]!.id),
            inArray(travelCircleMembers.membershipStatus, [
              "JOINED",
              "CONFIRMED",
            ]),
          ),
        ),
    ).toHaveLength(2);
  });
  it("never exceeds six when two workers race for the last seat", async () => {
    const initial = [];
    for (let i = 0; i < 5; i++)
      initial.push(await makePlan({ date: "2098-03-14" }));
    for (const plan of initial) await matching.processPlan(plan.planId);
    const [a, b] = await Promise.all([
      makePlan({ date: "2098-03-14" }),
      makePlan({ date: "2098-03-14" }),
    ]);
    await Promise.all([
      matching.processPlan(a.planId),
      matching.processPlan(b.planId),
    ]);
    const circles = await db
      .select()
      .from(travelCircles)
      .where(eq(travelCircles.travelDate, "2098-03-14"));
    expect(Math.max(...circles.map((circle) => circle.memberCount))).toBe(6);
    expect(circles.every((circle) => circle.memberCount <= 6)).toBe(true);
  });

  it("directly matches overlapping flexible dates", async () => {
    const flexible = await makePlan({
      date: "2098-04-14",
      flex: 1,
    });
    const exact = await makePlan({
      date: "2098-04-15",
    });

    await matching.processPlan(flexible.planId);
    await matching.processPlan(exact.planId);

    const plans = await db
      .select()
      .from(travelPlans)
      .where(inArray(travelPlans.id, [flexible.planId, exact.planId]));

    expect(plans.map((p) => p.status)).toEqual(["IN_CIRCLE", "IN_CIRCLE"]);

    const offers = await db
      .select()
      .from(matchOffers)
      .where(
        inArray(matchOffers.travelPlanId, [flexible.planId, exact.planId]),
      );

    expect(offers).toHaveLength(0);

    const circles = await db
      .select()
      .from(travelCircles)
      .where(eq(travelCircles.travelDate, "2098-04-15"));

    expect(circles.some((c) => c.memberCount === 2)).toBe(true);
  });

  it("enforces offer ownership and accepts a time alternative", async () => {
    const morning = await makePlan({
      date: "2098-04-20",
      departure: "MORNING",
    });
    const afternoon = await makePlan({
      date: "2098-04-20",
      departure: "AFTERNOON",
    });

    await matching.processPlan(morning.planId);
    await matching.processPlan(afternoon.planId);

    const [offer] = await db
      .select()
      .from(matchOffers)
      .where(eq(matchOffers.travelPlanId, afternoon.planId));

    expect(offer).toBeDefined();
    expect(offer!.offerType).toBe("ALTERNATIVE_TIME");

    await expect(matching.offer(morning.userId, offer!.id)).rejects.toThrow(
      "Match Offer not found",
    );

    const accepted = await matching.accept(afternoon.userId, offer!.id);

    expect(accepted.status).toBe("ACCEPTED");

    const [updated] = await db
      .select()
      .from(travelPlans)
      .where(eq(travelPlans.id, afternoon.planId));

    expect(updated.status).toBe("IN_CIRCLE");
    expect(updated.departureWindow).toBe("MORNING");
  });

  it("allows a traveller to decline a time alternative", async () => {
    const morning = await makePlan({
      date: "2098-04-22",
      departure: "MORNING",
    });
    const afternoon = await makePlan({
      date: "2098-04-22",
      departure: "AFTERNOON",
    });

    await matching.processPlan(morning.planId);
    await matching.processPlan(afternoon.planId);

    const [offer] = await db
      .select()
      .from(matchOffers)
      .where(eq(matchOffers.travelPlanId, afternoon.planId));

    expect(offer).toBeDefined();

    await matching.decline(afternoon.userId, offer!.id);

    const [declined] = await db
      .select()
      .from(matchOffers)
      .where(eq(matchOffers.id, offer!.id));

    expect(declined.status).toBe("DECLINED");
  });

  it("expires outdated alternative offers", async () => {
    const morning = await makePlan({
      date: "2098-04-25",
      departure: "MORNING",
    });
    const afternoon = await makePlan({
      date: "2098-04-25",
      departure: "AFTERNOON",
    });

    await matching.processPlan(morning.planId);
    await matching.processPlan(afternoon.planId);

    const [offer] = await db
      .select()
      .from(matchOffers)
      .where(eq(matchOffers.travelPlanId, afternoon.planId));

    expect(offer).toBeDefined();

    await db
      .update(matchOffers)
      .set({ expiresAt: new Date("2020-01-01") })
      .where(eq(matchOffers.id, offer!.id));

    await matching.expireOffers();

    const [expired] = await db
      .select()
      .from(matchOffers)
      .where(eq(matchOffers.id, offer!.id));

    expect(expired.status).toBe("EXPIRED");
  });

  it("dissolves a two-member Circle and returns the survivor to SEARCHING", async () => {
    const a = await makePlan({ date: "2098-05-14" });
    const b = await makePlan({ date: "2098-05-14" });
    await matching.processPlan(a.planId);
    await matching.processPlan(b.planId);
    await db.transaction((tx) => matching.detachPlan(tx, a.planId));
    const [circle] = await db
      .select()
      .from(travelCircles)
      .where(eq(travelCircles.travelDate, "2098-05-14"));
    expect(circle.status).toBe("DISSOLVED");
    expect(circle.memberCount).toBe(0);
    expect(
      (
        await db.select().from(travelPlans).where(eq(travelPlans.id, b.planId))
      )[0]!.status,
    ).toBe("SEARCHING");
  });
  it("respects blocks and private vehicle exclusion", async () => {
    const a = await makePlan({ date: "2098-06-14" });
    const b = await makePlan({ date: "2098-06-14" });
    await db
      .insert(userBlocks)
      .values({ blockerUserId: a.userId, blockedUserId: b.userId });
    await matching.processPlan(a.planId);
    await matching.processPlan(b.planId);
    expect(
      await db
        .select()
        .from(travelCircles)
        .where(eq(travelCircles.travelDate, "2098-06-14")),
    ).toHaveLength(0);
    const privatePlan = await makePlan({
      date: "2098-06-20",
      mode: "PRIVATE_VEHICLE",
    });
    expect((await matching.processPlan(privatePlan.planId)).result).toBe(
      "INELIGIBLE",
    );
  });

  it("prevents joining a Circle outside the agreed date window", async () => {
    const first = await makePlan({
      date: "2098-08-14",
      flex: 2,
    });

    const second = await makePlan({
      date: "2098-08-15",
      flex: 2,
    });

    await matching.processPlan(first.planId);
    await matching.processPlan(second.planId);

    const [circle] = await db
      .select()
      .from(travelCircles)
      .where(eq(travelCircles.travelDate, "2098-08-14"));

    expect(circle).toBeDefined();
    expect(circle!.memberCount).toBe(2);

    const third = await makePlan({
      date: "2098-08-16",
      flex: 0,
    });

    await matching.processPlan(third.planId);

    const [updatedCircle] = await db
      .select()
      .from(travelCircles)
      .where(eq(travelCircles.id, circle!.id));

    expect(updatedCircle.memberCount).toBe(2);

    const [thirdPlan] = await db
      .select()
      .from(travelPlans)
      .where(eq(travelPlans.id, third.planId));

    expect(thirdPlan.status).toBe("SEARCHING");
  });

  it("respects reusable matching restrictions", async () => {
    const restricted = await makePlan({ date: "2098-07-14" });
    const peer = await makePlan({ date: "2098-07-14" });
    await db.insert(matchingRestrictions).values({
      userId: restricted.userId,
      type: "MATCHING_DISABLED",
      active: true,
    });
    expect((await matching.processPlan(restricted.planId)).result).toBe(
      "INELIGIBLE",
    );
    await matching.processPlan(peer.planId);
    expect(
      await db
        .select()
        .from(travelCircles)
        .where(eq(travelCircles.travelDate, "2098-07-14")),
    ).toHaveLength(0);
  });
  simulation(
    "matches indexed populations of 100 and 1,000 without fragmentation",
    async () => {
      for (const [count, date] of [
        [100, "2097-01-14"],
        [1000, "2097-02-14"],
      ] as const) {
        const planIds: string[] = [];
        const started = performance.now();
        for (let i = 0; i < count; i++)
          planIds.push((await makePlan({ date })).planId);
        const seeded = performance.now();
        await matching.processBatch(planIds);
        const completed = performance.now();
        const circles = await db
          .select()
          .from(travelCircles)
          .where(eq(travelCircles.travelDate, date));
        const counts = circles
          .map((circle) => circle.memberCount)
          .sort((a, b) => b - a);
        expect(counts.reduce((sum, value) => sum + value, 0)).toBe(count);
        expect(counts.every((value) => value >= 2 && value <= 6)).toBe(true);
        expect(circles).toHaveLength(Math.ceil(count / 6));
        console.log(
          JSON.stringify({
            population: count,
            seedMs: Math.round(seeded - started),
            matchingMs: Math.round(completed - seeded),
            circles: circles.length,
            full: counts.filter((value) => value === 6).length,
            forming: counts.filter((value) => value === 2).length,
          }),
        );
      }
    },
    600_000,
  );
});
