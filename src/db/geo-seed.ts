import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { db, pool } from "./database.js";
import {
  lgaProximities,
  lgas,
  orientationCamps,
  states,
  towns,
  travelHubLgas,
  travelHubs,
} from "./schema.js";

type Snapshot = {
  source: string;
  license: string;
  updated: string;
  states: Array<{ id: string; n: string; s: string; lat: string; lon: string }>;
  lgas: Array<{
    id: string;
    p: string;
    n: string;
    s: string;
    lat: string;
    lon: string;
  }>;
};
async function seedGeography() {
  const encoded = await readFile(
    new URL("../../data/nigeria-admin.snapshot.b64", import.meta.url),
    "utf8",
  );
  const snapshot = JSON.parse(
    gunzipSync(Buffer.from(encoded.trim(), "base64")).toString("utf8"),
  ) as Snapshot;
  await db.transaction(async (tx) => {
    await tx
      .insert(states)
      .values(
        snapshot.states.map((x) => ({
          id: x.id,
          code: x.id,
          name: x.n,
          latitude: x.lat,
          longitude: x.lon,
          source: `${snapshot.source} (${snapshot.license}; ${snapshot.updated})`,
        })),
      )
      .onConflictDoUpdate({
        target: states.id,
        set: {
          code: sql`excluded.code`,
          name: sql`excluded.name`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          source: sql`excluded.source`,
          updatedAt: new Date(),
        },
      });
    await tx
      .insert(lgas)
      .values(
        snapshot.lgas.map((x) => ({
          id: x.id,
          stateId: x.p,
          name: x.n,
          slug: x.s,
          latitude: x.lat,
          longitude: x.lon,
          source: `${snapshot.source} (${snapshot.license}; ${snapshot.updated})`,
        })),
      )
      .onConflictDoUpdate({ target: lgas.id, set: { updatedAt: new Date() } });
    const allStates = await tx.select().from(states);
    const allLgas = await tx.select().from(lgas);
    const normalizeStateName = (name: string) =>
      name.toLowerCase().replace(/\s+state$/, "");
    const stateByName = new Map(
      allStates.map((x) => [normalizeStateName(x.name), x]),
    );
    const lgasByStateName = new Map(
      allLgas.map((x) => [`${x.stateId}:${x.name.toLowerCase()}`, x]),
    );
    const camps = await tx.select().from(orientationCamps);
    for (const camp of camps) {
      const canonicalStateName =
        camp.stateName === "FCT" ? "Federal Capital Territory" : camp.stateName;
      const state = stateByName.get(normalizeStateName(canonicalStateName));
      if (!state) continue;
      const lga = camp.lgaName
        ? lgasByStateName.get(`${state.id}:${camp.lgaName.toLowerCase()}`)
        : undefined;
      await tx
        .update(orientationCamps)
        .set({
          stateId: state.id,
          lgaId: lga?.id ?? null,
          updatedAt: new Date(),
        })
        .where(eq(orientationCamps.id, camp.id));
    }
    const townFixtures = [
      {
        lgaId: "NG017026",
        name: "Owerri",
        slug: "owerri",
        latitude: "5.485000",
        longitude: "7.035000",
        isMajor: true,
      },
      {
        lgaId: "NG017011",
        name: "Nwaorieubi",
        slug: "nwaorieubi",
        latitude: "5.591000",
        longitude: "7.014000",
        isMajor: true,
      },
      {
        lgaId: "NG017025",
        name: "Nekede",
        slug: "nekede",
        latitude: "5.440000",
        longitude: "7.005000",
        isMajor: true,
      },
      {
        lgaId: "NG017024",
        name: "Orji",
        slug: "orji",
        latitude: "5.530000",
        longitude: "7.080000",
        isMajor: true,
      },
    ] as const;
    for (const town of townFixtures)
      await tx
        .insert(towns)
        .values({ ...town, source: "MANUAL_REVIEW" })
        .onConflictDoUpdate({
          target: [towns.lgaId, towns.name],
          set: { ...town, updatedAt: new Date() },
        });
    const imo = stateByName.get("imo")!;
    const [hub] = await tx
      .insert(travelHubs)
      .values({
        name: "Owerri",
        stateId: imo.id,
        lgaId: "NG017026",
        latitude: "5.485000",
        longitude: "7.035000",
        hubType: "INTERSTATE",
        status: "ACTIVE",
      })
      .onConflictDoUpdate({
        target: [travelHubs.stateId, travelHubs.name],
        set: { status: "ACTIVE", updatedAt: new Date() },
      })
      .returning();
    const coverage = [
      ["NG017026", 10, true],
      ["NG017024", 20, false],
      ["NG017025", 35, false],
      ["NG017011", 50, false],
    ] as const;
    for (const [lgaId, estimatedMinutes, isPrimary] of coverage)
      await tx
        .insert(travelHubLgas)
        .values({
          travelHubId: hub.id,
          lgaId,
          estimatedMinutes,
          isPrimary,
          source: "MANUAL_REVIEW",
        })
        .onConflictDoUpdate({
          target: [travelHubLgas.travelHubId, travelHubLgas.lgaId],
          set: {
            estimatedMinutes,
            isPrimary,
            source: "MANUAL_REVIEW",
            updatedAt: new Date(),
          },
        });
    const pairs = [
      {
        lgaAId: "NG017011",
        lgaBId: "NG017025",
        estimatedRoadMinutes: 38,
        estimatedRoadDistanceKm: "28.00",
      },
      {
        lgaAId: "NG017024",
        lgaBId: "NG017026",
        estimatedRoadMinutes: 60,
        estimatedRoadDistanceKm: "34.00",
      },
      {
        lgaAId: "NG017020",
        lgaBId: "NG017024",
        estimatedRoadMinutes: 61,
        estimatedRoadDistanceKm: "51.00",
      },
    ] as const;
    for (const pair of pairs)
      await tx
        .insert(lgaProximities)
        .values({
          ...pair,
          isNearby: pair.estimatedRoadMinutes <= 60,
          source: "MANUAL_REVIEW",
          lastVerifiedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [lgaProximities.lgaAId, lgaProximities.lgaBId],
          set: {
            ...pair,
            isNearby: pair.estimatedRoadMinutes <= 60,
            source: "MANUAL_REVIEW",
            updatedAt: new Date(),
          },
        });
  });
  console.log(
    `Seeded ${snapshot.states.length} states/FCT, ${snapshot.lgas.length} LGAs, 4 towns, 1 reviewed hub and 3 proximity pairs.`,
  );
}
seedGeography()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exitCode = 1;
  });
