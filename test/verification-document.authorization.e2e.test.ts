import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/database.js";
import { adminCapabilityGrants, users } from "../src/db/schema.js";

const base = process.env.TEST_BASE_URL;
const enabled = Boolean(base) && process.env.RUN_VERIFICATION_AUTHZ === "true";

describe.skipIf(!enabled)("Verification document authorization", () => {
  const email = `authz-${crypto.randomUUID()}@test.invalid`;
  const password = "Authorization-Test-Password-123!";

  const verificationId = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  const url =
    `${base}/api/admin/verifications/${verificationId}` +
    `/documents/${documentId}`;

  beforeAll(() => {
    const database = new URL(process.env.DATABASE_URL ?? "");
    if (
      database.hostname !== "localhost" ||
      database.pathname !== "/kopa_padi_phase5"
    ) {
      throw new Error("Expected isolated Phase 5 test database");
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  async function request(cookie?: string) {
    return fetch(url, {
      headers: {
        origin: "http://localhost:3000",
        ...(cookie ? { cookie } : {}),
      },
    });
  }

  async function signIn() {
    const response = await fetch(`${base}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ email, password }),
    });

    expect(response.status).toBe(200);

    const cookies = response.headers.get("set-cookie") ?? "";
    const session = cookies
      .split(/,(?=[^;]+?=)/)
      .find((value) => value.includes("session_token"));

    expect(session).toBeTruthy();
    return session!.split(";")[0]!.trim();
  }

  it("requires verification.review before document access", async () => {
    const registration = await fetch(`${base}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        name: "Authorization Test",
        email,
        password,
      }),
    });

    expect(registration.status).toBe(200);

    const [user] = await db.select().from(users).where(eq(users.email, email));

    expect(user).toBeDefined();

    await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, user.id));

    expect((await request()).status).toBe(401);

    const regularCookie = await signIn();
    expect((await request(regularCookie)).status).toBe(403);

    await db.update(users).set({ role: "ADMIN" }).where(eq(users.id, user.id));

    const adminCookie = await signIn();

    expect((await request(adminCookie)).status).toBe(403);

    try {
      await db.insert(adminCapabilityGrants).values({
        adminUserId: user.id,
        grantedBy: user.id,
        capability: "verification.review",
      });

      // Access should pass authorization and reach
      // the document lookup, where the fake IDs return 404.
      expect((await request(adminCookie)).status).toBe(404);
    } finally {
      await db
        .delete(adminCapabilityGrants)
        .where(eq(adminCapabilityGrants.adminUserId, user.id));
    }
  }, 30_000);
});
