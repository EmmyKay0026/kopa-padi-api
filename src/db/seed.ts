import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { ADMIN_CAPABILITIES } from '../domain.js';
import { db, pool } from './database.js';
import { adminCapabilityGrants, nyscIntakes, orientationCamps, users } from './schema.js';

async function seed() {
  await db.insert(nyscIntakes).values({ serviceYear: '2026', batch: 'Batch B', stream: 'Stream 1', status: 'ACTIVE' }).onConflictDoNothing();
  await db.insert(orientationCamps).values([
    { stateName: 'Lagos', campName: 'NYSC Permanent Orientation Camp, Iyana Ipaja', lgaName: 'Agege', status: 'ACTIVE' },
    { stateName: 'Ogun', campName: 'NYSC Permanent Orientation Camp, Sagamu', lgaName: 'Sagamu', status: 'ACTIVE' },
    { stateName: 'FCT', campName: 'NYSC Permanent Orientation Camp, Kubwa', lgaName: 'Bwari', status: 'ACTIVE' },
  ]).onConflictDoNothing();
  if (process.env.FIRST_ADMIN_EMAIL) {
    await db.transaction(async (tx) => {
      const [account] = await tx.select({ id: users.id, emailVerified: users.emailVerified }).from(users).where(eq(users.email, process.env.FIRST_ADMIN_EMAIL!.toLowerCase())).limit(1);
      if (!account?.emailVerified) throw new Error('FIRST_ADMIN_EMAIL must already belong to a registered, email-verified account');
      await tx.update(users).set({ role: 'ADMIN', updatedAt: new Date() }).where(eq(users.id, account.id));
      await tx.insert(adminCapabilityGrants).values(ADMIN_CAPABILITIES.map((capability) => ({ adminUserId: account.id, capability, grantedBy: account.id }))).onConflictDoNothing();
    });
  }
}
seed().then(() => pool.end()).catch(async (error) => { console.error(error); await pool.end(); process.exitCode = 1; });
