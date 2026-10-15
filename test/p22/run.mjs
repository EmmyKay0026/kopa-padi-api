// Separate evidence directory; retain every P2.1 artifact.
process.env.P2_TEST_PHASE ||= '2.2';
const { connect, environment } = await import('../p2/support.mjs');
const db = await connect();
await db.end();
Object.assign(process.env, environment());
if (process.argv[2] === 'concurrency') {
  // Test all contenders at once without mistaking pool queue admission for a matching race.
  process.env.DATABASE_POOL_MAX = '48';
  process.env.DATABASE_CONNECT_TIMEOUT_MS = '30000';
}
if (['security', 'concurrency', 'restore', 'operations'].includes(process.argv[2])) {
  await import(`./${process.argv[2]}.mjs`);
} else await import('../p2/run.mjs');
