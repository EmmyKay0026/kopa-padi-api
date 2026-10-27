// Synthetic records only, guarded local database, and no outbound messaging.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { serializeSignedCookie } from 'better-call';
import { connect, environment, webOrigin } from './p2/support.mjs';

const client = await connect();
Object.assign(process.env, environment());
const { pool } = await import('../dist/src/db/database.js');
const { StateGuideService } = await import('../dist/src/state-guides/state-guide.service.js');
const service = new StateGuideService();
const stateId = `GUIDE-TEST-${randomUUID()}`;
const ids = [randomUUID(), randomUUID()];
let server;
const baseline = (await client.query('select (select count(*)::int from state) states,(select count(*)::int from lga) lgas')).rows[0];
const seed = JSON.parse(readFileSync(new URL('../data/state-guide-content.json', import.meta.url))).states.NG008;
const input = { ...seed, version: 0 };
const checks = [];
const pass = text => { checks.push(text); console.log(`PASS ${text}`); };
try {
  await client.query('insert into state(id,name,code) values($1,$2,$3)', [stateId, stateId, stateId]);
  for (let index = 0; index < ids.length; index++) await client.query('insert into "user"(id,name,email,email_verified,role,account_status) values($1,$2,$3,true,$4,$5)', [ids[index], 'Synthetic guide tester', `${ids[index]}@guide.invalid`, index ? 'ADMIN' : 'USER', 'ACTIVE']);
  const empty = await service.read(stateId);
  assert.equal(empty.version, 0);
  await assert.rejects(service.read(stateId, true), /State guide not found/);
  await assert.rejects(service.save('missing-state', input, ids[1]), /State not found/);
  const first = await service.save(stateId, input, ids[1]);
  assert.equal(first.version, 1);
  const loaded = await service.read(stateId, true);
  assert.deepEqual(loaded.information, seed.information);
  assert.deepEqual(loaded.secretariat, seed.secretariat);
  assert.deepEqual(loaded.photos, seed.photos);
  assert.deepEqual(loaded.expectations, seed.expectations);
  pass('Profile, contacts, local life, travel, photos, expectations and sources persist through existing state IDs');
  await assert.rejects(service.save(stateId, input, ids[1]), /state guide changed/);
  const racing = await Promise.allSettled(['first writer', 'second writer'].map(marker => service.save(stateId, { ...input, version: 1, information: { ...input.information, overview: marker } }, ids[1])));
  assert.equal(racing.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(racing.filter(result => result.status === 'rejected').length, 1);
  const current = await service.read(stateId);
  assert.equal(current.version, 2);
  assert.ok(['first writer', 'second writer'].includes(current.information.overview));
  pass('Duplicate creation and concurrent/stale saves cannot overwrite another admin');
  const replacement = { ...input, version: 2, photos: [...input.photos].reverse(), expectations: [], research: { ...input.research, sources: { pcmTips: ['https://www.nysc.gov.ng/camps.html', 'https://www.nysc.gov.ng/camps.html'] } } };
  await service.save(stateId, replacement, ids[1]);
  const after = await service.read(stateId, true);
  assert.deepEqual(after.photos, replacement.photos);
  assert.deepEqual(after.expectations, []);
  assert.deepEqual(after.research.sources.pcmTips, ['https://www.nysc.gov.ng/camps.html']);
  assert.equal((await client.query('select count(*)::int total from state_guide_expectation where state_id=$1', [stateId])).rows[0].total, 0);
  assert.equal((await client.query("select count(*)::int total from audit_log where actor_user_id=$1 and action='STATE_GUIDE_UPDATED'", [ids[1]])).rows[0].total, 3);
  pass('Ordered child rows can be replaced or cleared atomically; successful admin edits are audited');

  const reservation = createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${reservation.address().port}`; await new Promise(resolve => reservation.close(resolve));
  server = spawn(process.execPath, ['dist/src/main.js'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, PORT: new URL(base).port, HOST: '127.0.0.1', BETTER_AUTH_URL: base, SMTP_FALLBACK_ENABLED: 'false' } });
  let ready = false;
  for (let i = 0; i < 200; i++) { if (server.exitCode !== null) throw Error('Synthetic API startup failed'); try { if ((await fetch(base + '/api/health', { signal: AbortSignal.timeout(400) })).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 150)); }
  assert.ok(ready);
  const cookies = [];
  for (const id of ids) { const token = randomUUID(); await client.query("insert into session(id,token,user_id,expires_at) values($1,$2,$3,now()+interval '10 minutes')", [randomUUID(), token, id]); cookies.push((await serializeSignedCookie('better-auth.session_token', token, process.env.BETTER_AUTH_SECRET, { path: '/' })).split(';')[0]); }
  const request = (method, path, cookie, body) => fetch(base + '/api' + path, { method, headers: { origin: webOrigin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  assert.equal((await request('GET', `/state-guides/${stateId}`)).status, 200);
  assert.equal((await request('GET', '/admin/state-guides')).status, 401);
  assert.equal((await request('GET', '/admin/state-guides', cookies[0])).status, 403);
  assert.equal((await request('PUT', `/admin/state-guides/${stateId}`, cookies[0], { ...input, version: 3 })).status, 403);
  assert.equal((await request('PUT', `/admin/state-guides/${stateId}`, cookies[1], { ...input, version: 3, actorId: ids[0] })).status, 400);
  const saved = await request('PUT', `/admin/state-guides/${stateId}`, cookies[1], { ...input, version: 3, information: { ...input.information, overview: 'Saved through the admin HTTP route' } });
  assert.equal(saved.status, 200);
  assert.equal((await (await request('GET', `/state-guides/${stateId}`)).json()).information.overview, 'Saved through the admin HTTP route');
  assert.equal((await request('PUT', `/admin/state-guides/${stateId}`, cookies[1], { ...input, version: 3 })).status, 409);
  pass('Real HTTP routes enforce admin access, reject forged input, and expose saved content to anonymous public reads');
  console.log(JSON.stringify({ checks: checks.length, passed: true }));
} finally {
  if (server?.exitCode === null) { const stopped = once(server, 'exit'); server.kill(); await stopped; }
  await client.query('delete from audit_log where actor_user_id=any($1::uuid[])', [ids]);
  await client.query('delete from state_guide where state_id=$1', [stateId]);
  await client.query('delete from state where id=$1', [stateId]);
  await client.query('delete from "user" where id=any($1::uuid[])', [ids]);
  const final = (await client.query('select (select count(*)::int from state) states,(select count(*)::int from lga) lgas')).rows[0];
  assert.deepEqual(final, baseline);
  await pool.end(); await client.end();
}
