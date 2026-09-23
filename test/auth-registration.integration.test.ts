import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auth } from '../src/auth.js';
import { db, pool } from '../src/db/database.js';
import { notificationOutbox, users } from '../src/db/schema.js';

const enabled = process.env.RUN_AUTH_INTEGRATION === 'true';

describe.skipIf(!enabled)('registration email failure regression', () => {
  afterAll(async () => { await pool.end(); });

  it('returns success after persisting the user when ZeptoMail is unavailable', async () => {
    const email = `registration-${crypto.randomUUID()}@test.invalid`;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousApiKey = process.env.ZEPTO_MAIL_API_KEY;
    process.env.NODE_ENV = 'production';
    delete process.env.ZEPTO_MAIL_API_KEY;
    try {
      const response = await auth.handler(new Request('http://localhost:4000/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ name: 'Registration Test', email, password: 'registration-test-password' }),
      }));
      expect(response.status).toBe(200);
      const [user] = await db.select().from(users).where(eq(users.email, email));
      expect(user?.email).toBe(email);
      const queued = await db.select().from(notificationOutbox).where(eq(notificationOutbox.userId, user.id));
      expect(queued.some((item) => item.type === 'ACCOUNT_VERIFICATION')).toBe(true);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
      if (previousApiKey === undefined) delete process.env.ZEPTO_MAIL_API_KEY; else process.env.ZEPTO_MAIL_API_KEY = previousApiKey;
    }
  });
});
