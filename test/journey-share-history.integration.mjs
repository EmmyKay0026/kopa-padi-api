// Self-contained fixtures in the guarded local kopa_padi_p2_e2e database only.
import assert from 'node:assert/strict';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { connect, environment } from './p2/support.mjs';

const client = await connect();
const env = environment();
const ids = Object.fromEntries(['user', 'verification', 'plan', 'journey', 'otherJourney', 'contact', 'share', 'foreignCheckIn'].map((key) => [key, randomUUID()]));
const checkInIds = Array.from({ length: 45 }, () => randomUUID());
const token = randomBytes(32).toString('base64url');
const origin = 'http://127.0.0.1:4106';
const checks = [];
let server;
const out = new URL('../test-results/journey-share-history/', import.meta.url);
mkdirSync(out, { recursive: true });
const log = createWriteStream(new URL('api.log', out));
const record = (message) => { checks.push(message); console.log(`PASS ${message}`); };
const url = (path = '') => `${origin}/api/journey-share/${token}${path}`;

try {
  const { rows: [seed] } = await client.query('select p.origin_state_id,p.origin_lga_id,p.destination_camp_id,v.nysc_intake_id from travel_plan p join pcm_verification v on v.id=p.pcm_verification_id limit 1');
  assert.ok(seed, 'An existing geography/intake seed is required in the isolated test database');
  await client.query('insert into "user"(id,name,email) values($1,$2,$3)', [ids.user, 'History Test Traveller', `history-${ids.user}@history.invalid`]);
  await client.query('insert into pcm_verification(id,user_id,nysc_intake_id,orientation_camp_id) values($1,$2,$3,$4)', [ids.verification, ids.user, seed.nysc_intake_id, seed.destination_camp_id]);
  await client.query("insert into travel_plan(id,user_id,pcm_verification_id,origin_state_id,origin_lga_id,destination_camp_id,intended_travel_date,departure_window,transport_mode,status,expires_at) values($1,$2,$3,$4,$5,$6,'2099-01-01','MORNING','COMMERCIAL_BUS','IN_JOURNEY',now()+interval '1 day')", [ids.plan, ids.user, ids.verification, seed.origin_state_id, seed.origin_lga_id, seed.destination_camp_id]);
  for (const [journey, status] of [[ids.journey, 'IN_PROGRESS'], [ids.otherJourney, 'COMPLETED']]) {
    await client.query("insert into journey(id,user_id,travel_plan_id,origin_state_id,origin_lga_id,destination_camp_id,travel_date,departure_window,transport_mode,journey_mode,status,started_at,arrived_at) values($1,$2,$3,$4,$5,$6,'2099-01-01','MORNING','COMMERCIAL_BUS','SOLO',$7,now(),case when $8::boolean then now() else null end)", [journey, ids.user, ids.plan, seed.origin_state_id, seed.origin_lga_id, seed.destination_camp_id, status, status === 'COMPLETED']);
  }
  await client.query('insert into trusted_contact(id,user_id,name,relationship,email) values($1,$2,$3,$4,$5)', [ids.contact, ids.user, 'History Test Contact', 'Test', 'contact@history.invalid']);
  await client.query("insert into journey_share(id,journey_id,trusted_contact_id,token_hash,expires_at) values($1,$2,$3,$4,now()+interval '1 hour')", [ids.share, ids.journey, ids.contact, createHash('sha256').update(token).digest('hex')]);
  for (let index = 0; index < checkInIds.length; index++) {
    // Different microseconds within one millisecond catch timestamp-truncation pagination bugs.
    const timestamp = `2026-10-25T08:00:00.000${String(index + 100)}Z`;
    const type = index === 0 ? 'STARTED' : index === 44 ? 'ARRIVED' : index === 20 ? 'CONNECTION_REACHED' : index === 30 ? 'NEED_HELP' : 'SAFE';
    await client.query('insert into journey_check_in(id,journey_id,user_id,type,client_request_id,message,created_at,latitude,longitude) values($1,$2,$3,$4,$5,$6,$7,6.5,3.3)', [checkInIds[index], ids.journey, ids.user, type, randomUUID(), index === 21 ? '<script>unsafe text</script>' : `Synthetic update ${index}`, timestamp]);
  }
  await client.query("insert into journey_check_in(id,journey_id,user_id,type,client_request_id,message) values($1,$2,$3,'SAFE',$4,'OTHER JOURNEY')", [ids.foreignCheckIn, ids.otherJourney, ids.user, randomUUID()]);

  server = spawn(process.execPath, ['dist/src/main.js'], { cwd: new URL('../', import.meta.url), env: { ...env, PORT: '4106', WEB_URL: 'http://127.0.0.1:3105' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.pipe(log, { end: false });
  server.stderr.pipe(log, { end: false });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await fetch(`${origin}/api/health`)).ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Synthetic API did not start; see test-results/journey-share-history/api.log');
  const response = await fetch(url());
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const shared = await response.json();
  assert.equal(shared.checkInHistory.items.length, 20);
  assert.equal(shared.lastCheckIn.id, checkInIds.at(-1));
  const pages = {};
  const all = [...shared.checkInHistory.items];
  let cursor = shared.checkInHistory.nextCursor;
  while (cursor) {
    const pageResponse = await fetch(url(`/check-ins?before=${cursor}`));
    assert.equal(pageResponse.status, 200);
    assert.match(pageResponse.headers.get('cache-control'), /no-store/);
    assert.equal(pageResponse.headers.get('referrer-policy'), 'no-referrer');
    const page = await pageResponse.json();
    pages[cursor] = page;
    all.push(...page.items);
    cursor = page.nextCursor;
  }
  assert.deepEqual(all.map((item) => item.id), [...checkInIds].reverse());
  assert.equal(new Set(all.map((item) => item.id)).size, 45);
  assert.ok(all.filter((item) => item.type === 'SAFE').length > 30);
  for (const item of all) assert.deepEqual(Object.keys(item).sort(), ['createdAt', 'id', 'message', 'type']);
  assert.ok(!JSON.stringify(all).includes('OTHER JOURNEY'));
  record('Real API/PostgreSQL returns all 45 records across pages without duplicates, microsecond gaps or coordinates');
  assert.equal((await fetch(url(`/check-ins?before=${ids.foreignCheckIn}`))).status, 400);
  assert.equal((await fetch(url('/check-ins?before=invalid'))).status, 400);
  assert.equal((await fetch(url('/check-ins?limit=100000'))).status, 400);
  record('Cross-journey cursors and invalid or unbounded query parameters are rejected');
  writeFileSync(new URL('fixture.json', out), JSON.stringify({ shared, pages, total: 45 }, null, 2));

  for (const scenario of ['revoked', 'expired', 'inactive contact']) {
    if (scenario === 'revoked') await client.query("update journey_share set status='REVOKED' where id=$1", [ids.share]);
    if (scenario === 'expired') await client.query("update journey_share set expires_at=now()-interval '1 second' where id=$1", [ids.share]);
    if (scenario === 'inactive contact') await client.query('update trusted_contact set is_active=false where id=$1', [ids.contact]);
    for (const path of ['', `/check-ins?before=${shared.checkInHistory.nextCursor}`]) {
      const blocked = await fetch(url(path));
      assert.equal(blocked.status, 404, scenario);
      assert.match(blocked.headers.get('cache-control'), /no-store/);
    }
    await client.query("update journey_share set status='ACTIVE',expires_at=now()+interval '1 hour' where id=$1", [ids.share]);
    await client.query('update trusted_contact set is_active=true where id=$1', [ids.contact]);
  }
  record('Revoked, expired and inactive-contact links cannot read either the summary or older history');
  writeFileSync(new URL('report.json', out), JSON.stringify({ checks }, null, 2));
} finally {
  if (server && server.exitCode === null) { server.kill(); await new Promise((resolve) => server.once('exit', resolve)); }
  log.end();
  // Only the new UUID-scoped fixture records are removed; seed records stay untouched.
  await client.query('delete from journey_check_in where journey_id=any($1::uuid[])', [[ids.journey, ids.otherJourney]]);
  await client.query('delete from journey_share where id=$1', [ids.share]);
  await client.query('delete from trusted_contact where id=$1', [ids.contact]);
  await client.query('delete from journey where id=any($1::uuid[])', [[ids.journey, ids.otherJourney]]);
  await client.query('delete from travel_plan where id=$1', [ids.plan]);
  await client.query('delete from pcm_verification where id=$1', [ids.verification]);
  await client.query('delete from "user" where id=$1', [ids.user]);
  await client.end();
}
