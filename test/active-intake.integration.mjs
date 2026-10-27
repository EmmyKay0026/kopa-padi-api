// Only the guarded local test database is used. Original intake state is restored.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connect, environment } from './p2/support.mjs';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const client = await connect();
Object.assign(process.env, environment());
const { db, pool } = await import('../dist/src/db/database.js');
const { IntakeService } = await import('../dist/src/intakes/intake.service.js');
const { VerificationService } = await import('../dist/src/verification/verification.service.js');
const { TravelPlanService } = await import('../dist/src/travel-plans/travel-plan.service.js');
const service = new IntakeService();
const actor = randomUUID(), user = randomUUID(), verification = randomUUID();
const created = [], checks = [];
let baseline = [];
let planId;
const record = (message) => { checks.push(message); console.log(`PASS ${message}`); };
const out = new URL('../test-results/active-intake/', import.meta.url);
mkdirSync(out, { recursive: true });

try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle/', import.meta.url)) });
  baseline = (await client.query('select id,status,updated_at from nysc_intake')).rows;
  const previous = await service.active();
  const years = new Set((await service.list()).map((row) => row.serviceYear));
  const year = Array.from({ length: 100 }, (_, index) => String(2099 - index)).find((value) => !years.has(value));
  assert.ok(year);
  for (const [id, role] of [[actor, 'ADMIN'], [user, 'USER']]) {
    await client.query('insert into "user"(id,name,email,role) values($1,$2,$3,$4)', [id, 'Intake Test User', `${id}@intake.invalid`, role]);
  }
  for (const [batch, stream] of [['Batch A', 'Stream 1'], ['Batch A', 'Stream 2'], ['Batch B', 'Stream 1']]) {
    created.push(await service.create(actor, { serviceYear: year, batch, stream, orientationStartDate: null, orientationEndDate: null }));
  }
  assert.ok(created.every((row) => row.status === 'UPCOMING'));
  assert.equal((await service.active())?.id ?? null, previous?.id ?? null);
  await service.activate(actor, created[0].id, previous?.id ?? null);
  assert.equal((await service.active()).id, created[0].id);
  assert.equal((await client.query("select count(*)::int total from nysc_intake where status='ACTIVE'")).rows[0].total, 1);
  record('Creating an intake leaves it closed; activation atomically selects exactly one active batch/stream');

  const raced = await Promise.allSettled(created.slice(1).map((row) => service.activate(actor, row.id, created[0].id)));
  assert.equal(raced.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(raced.filter((result) => result.status === 'rejected').length, 1);
  const current = await service.active();
  await assert.rejects(service.activate(actor, created[0].id, previous?.id ?? null), /active NYSC intake has changed/);
  assert.equal((await service.active()).id, current.id);
  await assert.rejects(client.query("update nysc_intake set status='ACTIVE' where id=$1", [created[0].id]), (error) => error.code === '23505');
  record('Concurrent/stale admin changes and direct duplicate activation cannot create two active intakes');

  const storage = { store: async () => { throw new Error('Inactive-intake documents must not be stored'); } };
  const verifications = new VerificationService(storage, {});
  const catalog = await verifications.catalog();
  assert.equal(catalog.activeIntake.id, current.id);
  assert.deepEqual(catalog.intakes.map((row) => row.id), [current.id]);
  const { rows: [seed] } = await client.query('select p.origin_state_id,p.origin_lga_id,p.destination_camp_id,v.nysc_intake_id from travel_plan p join pcm_verification v on v.id=p.pcm_verification_id limit 1');
  assert.ok(seed);
  await client.query('insert into pcm_profile(user_id,first_name,last_name_private,display_name) values($1,$2,$3,$4)', [user, 'Intake', 'Test', 'Intake Test']);
  await assert.rejects(verifications.submit(user, { nyscIntakeId: created[0].id, orientationCampId: seed.destination_camp_id }, { buffer: Buffer.from('synthetic'), filename: 'synthetic.pdf' }), /active NYSC intake has changed/);
  record('Verification exposes only the active assignment and rejects forged inactive intake IDs');

  let removed = false;
  const changingStorage = {
    store: async () => {
      await service.activate(actor, created[0].id, current.id);
      return { storageKey: 'synthetic-intake-race' };
    },
    remove: async (key) => { assert.equal(key, 'synthetic-intake-race'); removed = true; },
  };
  await assert.rejects(new VerificationService(changingStorage, {}).submit(user, { nyscIntakeId: current.id, orientationCampId: seed.destination_camp_id }, { buffer: Buffer.from('synthetic'), filename: 'synthetic.pdf' }), /active NYSC intake has changed/);
  assert.equal(removed, true);
  assert.equal((await client.query('select count(*)::int total from pcm_verification where user_id=$1', [user])).rows[0].total, 0);
  await service.activate(actor, current.id, created[0].id);
  record('An intake switch during document upload rejects the stale assignment and removes the temporary document');

  await client.query("insert into pcm_verification(id,user_id,nysc_intake_id,orientation_camp_id,verification_status,verified_at,reviewed_by) values($1,$2,$3,$4,'VERIFIED',now(),$5)", [verification, user, created[0].id, seed.destination_camp_id, actor]);
  const trips = new TravelPlanService({});
  const input = { destinationCampId: seed.destination_camp_id, originStateId: seed.origin_state_id, originLgaId: seed.origin_lga_id, intendedTravelDate: '2099-12-01', dateFlexibilityDays: 0, departureWindow: 'MORNING', transportMode: 'COMMERCIAL_BUS', transportFlexible: false, nearbyMatchingEnabled: false, groupPreference: 'ANY_VERIFIED_PCM' };
  await assert.rejects(trips.create(user, input), /verified NYSC intake is not open/);
  await service.close(actor, current.id, current.id);
  assert.equal(await service.active(), null);
  assert.deepEqual((await verifications.catalog()).intakes, []);
  await assert.rejects(trips.create(user, input), /No NYSC batch and stream/);
  await service.activate(actor, created[0].id, null);
  const trip = await trips.create(user, input);
  planId = trip.plan.id;
  assert.equal(trip.plan.pcmVerificationId, verification);
  await service.activate(actor, created[1].id, created[0].id);
  assert.equal((await trips.active(user)).plan.id, planId);
  assert.equal((await trips.active(user)).plan.pcmVerificationId, verification);
  assert.equal((await client.query('select nysc_intake_id from pcm_verification where id=$1', [verification])).rows[0].nysc_intake_id, created[0].id);
  record('Only verified users in the active intake can create new trips; closing/switching preserves existing trip and verification identities');

  await client.query("update pcm_verification set verification_status='RESUBMISSION_REQUIRED' where id=$1", [verification]);
  await assert.rejects(verifications.submit(user, { nyscIntakeId: created[1].id, orientationCampId: seed.destination_camp_id }, { buffer: Buffer.from('synthetic'), filename: 'synthetic.pdf' }), /assignment must be preserved/);
  const syntheticStorage = { store: async () => ({ storageKey: randomUUID(), originalName: 'synthetic.pdf', mimeType: 'application/pdf', sizeBytes: 9, sha256: '0'.repeat(64) }), remove: async () => {} };
  const senateDetails = { dateOfBirth: '2000-02-29', matriculationNumber: '001/ENG/2020' };
  const resubmitted = await new VerificationService(syntheticStorage, { dispatch: async () => {} }).submit(user, { nyscIntakeId: created[0].id, orientationCampId: seed.destination_camp_id, ...senateDetails }, { buffer: Buffer.from('synthetic'), filename: 'synthetic.pdf' });
  assert.equal(resubmitted.id, verification);
  assert.equal(resubmitted.nyscIntakeId, created[0].id);
  assert.equal(resubmitted.status, 'SUBMITTED');
  for (const [key, value] of Object.entries(senateDetails)) {
    assert.equal(resubmitted[key], value);
    assert.equal((await verifications.status(user)).verification[key], value);
    assert.equal((await verifications.detail(verification)).verification[key], value);
    assert.equal((await verifications.queue('SUBMITTED')).find(row => row.verification.id === verification).verification[key], value);
  }
  record('Existing resubmissions retain their historical intake and cannot be silently reassigned');
  const audit = (await client.query("select action from audit_log where actor_user_id=$1 and resource_type='NYSC_INTAKE'", [actor])).rows;
  assert.ok(audit.some((row) => row.action === 'NYSC_INTAKE_CREATED'));
  assert.ok(audit.some((row) => row.action === 'NYSC_INTAKE_ACTIVATED'));
  assert.ok(audit.some((row) => row.action === 'NYSC_INTAKE_CLOSED'));
  record('All intake creation, activation and closure actions are audited');
  writeFileSync(new URL('report.json', out), JSON.stringify({ checks }, null, 2));
} finally {
  await client.query('begin');
  try {
    await client.query("select pg_advisory_xact_lock(hashtext('nysc-active-intake'))");
    await client.query("update nysc_intake set status='COMPLETED' where id=any($1::uuid[])", [created.map((row) => row.id)]);
    for (const row of baseline) await client.query('update nysc_intake set status=$2,updated_at=$3 where id=$1', [row.id, row.status, row.updated_at]);
    await client.query('commit');
  } catch (error) { await client.query('rollback'); throw error; }
  if (planId) await client.query('delete from domain_outbox where aggregate_id=$1', [planId]);
  await client.query('delete from audit_log where actor_user_id=any($1::uuid[])', [[actor, user]]);
  await client.query('delete from travel_plan where user_id=$1', [user]);
  await client.query('delete from verification_document where verification_id=$1', [verification]);
  await client.query('delete from pcm_verification where user_id=$1', [user]);
  await client.query('delete from pcm_profile where user_id=$1', [user]);
  await client.query('delete from nysc_intake where id=any($1::uuid[])', [created.map((row) => row.id)]);
  await client.query('delete from "user" where id=any($1::uuid[])', [[actor, user]]);
  await client.end();
  await pool.end();
}
