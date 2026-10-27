// UUID-scoped fixtures in the guarded, local kopa_padi_p2_e2e database only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect, environment } from './p2/support.mjs';

const client = await connect();
Object.assign(process.env, environment(), { JOURNEY_LOCATION_SHARE_MINUTES: '60' });
const { JourneyService } = await import('../src/journeys/journey.service.ts');
const { pool } = await import('../src/db/database.ts');
const service = new JourneyService({});
const ids = Object.fromEntries(['user', 'verification', 'plan', 'journey', 'contact'].map((key) => [key, randomUUID()]));
const location = { latitude: 6.5, longitude: 3.4, audience: 'TRUSTED_CONTACT' };
const tokenFrom = (share) => new URL(share.url).pathname.split('/').at(-1);

try {
  const { rows: [seed] } = await client.query('select p.origin_state_id,p.origin_lga_id,p.destination_camp_id,v.nysc_intake_id from travel_plan p join pcm_verification v on v.id=p.pcm_verification_id limit 1');
  assert.ok(seed, 'The isolated test database needs existing geography/intake seeds');
  await client.query('insert into "user"(id,name,email) values($1,$2,$3)', [ids.user, 'Sharing Test Traveller', `sharing-${ids.user}@sharing.invalid`]);
  await client.query('insert into pcm_verification(id,user_id,nysc_intake_id,orientation_camp_id) values($1,$2,$3,$4)', [ids.verification, ids.user, seed.nysc_intake_id, seed.destination_camp_id]);
  await client.query("insert into travel_plan(id,user_id,pcm_verification_id,origin_state_id,origin_lga_id,destination_camp_id,intended_travel_date,departure_window,transport_mode,status,expires_at) values($1,$2,$3,$4,$5,$6,'2099-01-01','MORNING','COMMERCIAL_BUS','IN_JOURNEY',now()+interval '1 day')", [ids.plan, ids.user, ids.verification, seed.origin_state_id, seed.origin_lga_id, seed.destination_camp_id]);
  await client.query("insert into journey(id,user_id,travel_plan_id,origin_state_id,origin_lga_id,destination_camp_id,travel_date,departure_window,transport_mode,journey_mode,status,started_at) values($1,$2,$3,$4,$5,$6,'2099-01-01','MORNING','COMMERCIAL_BUS','SOLO','IN_PROGRESS',now())", [ids.journey, ids.user, ids.plan, seed.origin_state_id, seed.origin_lga_id, seed.destination_camp_id]);
  await client.query('insert into trusted_contact(id,user_id,name,relationship,email) values($1,$2,$3,$4,$5)', [ids.contact, ids.user, 'Sharing Test Contact', 'Family', 'family@sharing.invalid']);

  const first = await service.createShare(ids.user, ids.contact);
  await client.query("update journey_share set expires_at=now()-interval '1 second' where journey_id=$1", [ids.journey]);
  await assert.rejects(service.publicShare(tokenFrom(first)), /invalid or expired/);
  const renewedLink = await service.createShare(ids.user, ids.contact);
  const token = tokenFrom(renewedLink);
  assert.notEqual(tokenFrom(first), token);
  assert.ok((await service.publicShare(token)).shareExpiresAt);
  console.log('PASS expired Journey links can be replaced and the new token grants access');

  for (const durationMinutes of [undefined, 1, 120]) {
    const started = Date.now();
    const result = await service.shareLocation(ids.user, { ...location, durationMinutes });
    assert.ok(Math.abs(result.expiresAt.getTime() - started - (durationMinutes ?? 60) * 60_000) < 5000);
    const { rows: [count] } = await client.query("select count(*)::int count from journey_location_share where journey_id=$1 and audience='TRUSTED_CONTACT' and expires_at>now()", [ids.journey]);
    assert.equal(count.count, 1);
    const current = await service.current(ids.user);
    assert.equal(current.locationSharing.defaultDurationMinutes, 60);
    assert.equal(current.locationShares.length, 1);
    assert.equal(current.locationShares[0].expiresAt.toISOString(), result.expiresAt.toISOString());
    assert.ok(!JSON.stringify(current.locationShares).includes('latitude'));
    assert.equal(new Date((await service.publicShare(token)).currentLocation.expiresAt).getTime(), result.expiresAt.getTime());
  }
  console.log('PASS PostgreSQL stores default/selected durations, replaces old snapshots, and returns expiry metadata');

  await client.query("update journey_location_share set expires_at=now()-interval '1 second' where journey_id=$1", [ids.journey]);
  assert.equal((await service.publicShare(token)).currentLocation, null);
  await service.shareLocation(ids.user, { ...location, durationMinutes: 30 });
  assert.ok((await service.publicShare(token)).currentLocation);
  await client.query("update journey set status='COMPLETED',arrived_at=now(),completed_at=now() where id=$1", [ids.journey]);
  await service.withdrawLocation(ids.user);
  assert.equal((await service.publicShare(token)).currentLocation, null);
  await service.revokeShares(ids.user);
  await assert.rejects(service.publicShare(token), /invalid or expired/);
  console.log('PASS expired locations disappear, renewal restores visibility, and withdrawal/revocation work after completion');
} finally {
  await client.query('delete from domain_outbox where aggregate_id=$1', [ids.journey]);
  await client.query('delete from journey_location_share where journey_id=$1', [ids.journey]);
  await client.query('delete from journey_share where journey_id=$1', [ids.journey]);
  await client.query('delete from trusted_contact where id=$1', [ids.contact]);
  await client.query('delete from journey where id=$1', [ids.journey]);
  await client.query('delete from travel_plan where id=$1', [ids.plan]);
  await client.query('delete from pcm_verification where id=$1', [ids.verification]);
  await client.query('delete from "user" where id=$1', [ids.user]);
  await client.end();
  await pool.end();
}
