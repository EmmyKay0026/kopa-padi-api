// Run only through test/p24/local.mjs. No fixture reset, mail or hosted access.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect } from './p2/support.mjs';
const client = await connect(); // URL AND actual PostgreSQL identity verified before writes.
let pool;
const userId = randomUUID();
try {
  // Apply the complete migration chain using the existing ledger, only to guarded localhost.
  const database = await import('../dist/src/db/database.js'); pool = database.pool;
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  await migrate(database.db, { migrationsFolder: './drizzle' });
  await client.query('insert into "user" (id,name,email,email_verified,role,account_status) values ($1,$2,$3,true,$4,$5)', [userId, 'Synthetic bug reporter', `${userId}@p2.invalid`, 'USER', 'ACTIVE']);
  const { BugReportsService } = await import('../dist/src/bug-reports/bug-reports.service.js');
  const service = new BugReportsService();
  const title = 'Synthetic bug report';
  const description = '<script>synthetic-only</script> steps to reproduce.';
  const { id } = await service.create(userId, { title, description });
  const report = (await service.list()).find(row => row.id === id);
  assert.equal(report.description, description); assert.equal(report.status, 'OPEN'); assert.equal(report.reporterUserId, userId);
  assert.equal((await service.update(id, 'RESOLVED')).status, 'RESOLVED');
  assert.equal((await service.update(id, 'OPEN')).status, 'OPEN');
  await assert.rejects(service.update(randomUUID(), 'OPEN'), /Bug report not found/);
  await assert.rejects(client.query('insert into bug_report (reporter_user_id,title,description,status) values ($1,$2,$3,$4)', [userId, title, description, 'INVALID']));
  await client.query('delete from "user" where id=$1', [userId]);
  assert.equal((await client.query('select count(*)::int n from bug_report where reporter_user_id=$1', [userId])).rows[0].n, 0);
  console.log('PASS: guarded migration, persistence, inbox, resolve/reopen, unknown ID, database constraints and fixture cleanup');
} finally {
  await client.query('delete from "user" where id=$1', [userId]);
  await client.end(); if (pool) await pool.end();
}
