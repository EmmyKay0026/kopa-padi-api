import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, artifacts, environment, connect, command, record } from './support.mjs';

const mode = process.argv[2] || 'preflight';
try {
  const client = await connect();
  const {rows:[schema]}=await client.query("select to_regclass('public.\"user\"') is not null as ready");
  const { rows: [summary] } = await client.query(`select current_database() as database, inet_server_addr()::text as address,
    ${schema.ready?'(select count(*)::int from "user")':'0'} as users,
    ${schema.ready?"(select count(*)::int from \"user\" where email not like '%@p2.invalid')":"0"} as foreign_users`);
  assert.ok(schema.ready || ['setup','preflight'].includes(mode),'Application schema absent; run guarded setup first');
  assert.equal(summary.foreign_users, 0, 'Test database contains non-P2 accounts; refusing setup/teardown');
  await client.end();
  if (mode === 'preflight') { console.log(JSON.stringify({ safety: 'passed', node: process.version, ...summary })); }
  else if (mode === 'setup') {
    const journal = JSON.parse(readFileSync(resolve(root, 'drizzle/meta/_journal.json'), 'utf8'));
    for (const entry of journal.entries) readFileSync(resolve(root, 'drizzle', entry.tag + '.sql'));
    await command(['node_modules/drizzle-kit/bin.cjs', 'migrate'], { quiet: true });
    const db = await connect();
    const { rows: [counts] } = await db.query('select (select count(*)::int from nysc_intake) as intakes, (select count(*)::int from state) as states');
    await db.end();
    if (!counts.intakes) await command(['--import', 'tsx', 'src/db/seed.ts'], { quiet: true });
    if (!counts.states) await command(['--import', 'tsx', 'src/db/geo-seed.ts'], { quiet: true });
    await command(['--import', 'tsx', 'src/db/geo-validate.ts']);
    console.log(JSON.stringify({ setup: 'complete', journalEntries: journal.entries.length }));
  } else if (mode === 'api') {
    Object.assign(process.env, environment());
    await import('../../dist/src/main.js');
  } else if (mode === 'web') {
    await command(['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3100'], { cwd: resolve(root, '../kopa-padi-web') });
  } else if (mode === 'sink') {
    let accepted = 0, rejected = 0, fail = false;
    createServer(async (req, res) => {
      if (req.url === '/status') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ accepted, rejected, fail })); return; }
      if (req.url === '/fail-on') { fail = true; res.end('controlled failure enabled'); return; }
      if (req.url === '/fail-off') { fail = false; res.end('controlled failure disabled'); return; }
      if (req.url !== '/email' || req.method !== 'POST') { res.writeHead(404).end(); return; }
      try {
        let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 100000) throw new Error(); }
        const body = JSON.parse(text);
        assert.ok(body.to.length && body.to.every(row => /^[a-z0-9._+-]+@p2\.invalid$/i.test(row.email_address.address)));
        if (fail) { res.writeHead(503).end(); return; }
        accepted++; res.setHeader('content-type', 'application/json'); res.end('{"data":[]}');
      } catch { rejected++; res.writeHead(400).end(); }
    }).listen(4101, '127.0.0.1', () => console.log('P2 local-only email sink ready; payloads are not logged.'));
  } else if (mode === 'worker') {
    await command(['--import', 'tsx', 'src/jobs/process-matching.ts']);
  } else if (mode === 'unit') {
    await command(['node_modules/vitest/vitest.mjs', 'run', 'src', '--maxWorkers=1']);
  } else if (mode === 'http') {
    Object.assign(process.env, environment());
    await import('./http.mjs');
  } else if (mode === 'teardown') {
    const db = await connect();
    const { rows: tables } = await db.query("select tablename from pg_tables where schemaname='public'");
    assert.ok(tables.length);
    // Explicitly disposable designated DB only; preserve migrations, clear all seeded/test data.
    await db.query('TRUNCATE ' + tables.map(row => 'public."' + row.tablename.replaceAll('"', '""') + '"').join(',') + ' RESTART IDENTITY CASCADE');
    await db.end(); console.log('Designated test data cleared; migrations retained.');
  } else throw new Error('Unknown P2 harness mode');
} catch (error) {
  console.error(JSON.stringify({ mode, failed: true, reason: error instanceof assert.AssertionError ? error.message.split('\n')[0] : error.code || error.message?.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]') }));
  process.exitCode = 1;
}
