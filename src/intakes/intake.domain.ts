import { eq, sql } from 'drizzle-orm';
import { db } from '../db/database.js';
import { nyscIntakes } from '../db/schema.js';

export const INTAKE_LOCK = 'nysc-active-intake';
export const NO_ACTIVE_INTAKE = 'No NYSC batch and stream are currently open for new trips.';
export const INTAKE_CHANGED = 'The active NYSC intake has changed. Refresh and try again.';
export const INTAKE_MISMATCH = 'Your verified NYSC intake is not open for new trips.';

/** Fail closed if legacy data has multiple active rows. */
export async function activeIntake(connection: Pick<typeof db, 'select'> = db) {
  const rows = await connection.select().from(nyscIntakes).where(eq(nyscIntakes.status, 'ACTIVE')).limit(2);
  return rows.length === 1 ? rows[0] : null;
}

export function lockActiveIntake(connection: Pick<typeof db, 'execute'>) {
  return connection.execute(sql`select pg_advisory_xact_lock_shared(hashtext(${INTAKE_LOCK}))`);
}
