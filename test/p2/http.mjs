import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { apiOrigin, webOrigin, artifacts, connect, command, passwordFor, record } from './support.mjs';

const db = await connect();
const results = [];
const accounts = {};
let serial = 1, camp, intake, origin, otherOrigin, circleId, alicePlan, bobPlan, originalPlans;
const document = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082','hex');
record('results.json', { status: 'running', results });
writeFileSync(resolve(artifacts, 'synthetic-callup.png'), document);
class Client {
  constructor(name) { this.name = name; this.cookie = ''; this.ip = `127.0.0.${++serial}`; }
  async call(method, path, body, expected = method === 'POST' ? 201 : 200) {
    const headers = { origin: webOrigin, 'x-forwarded-for': this.ip, ...(this.cookie ? { cookie: this.cookie } : {}) };
    if (body !== undefined && !(body instanceof FormData)) headers['content-type'] = 'application/json';
    const response = await fetch(apiOrigin + '/api' + path, { method, headers, redirect: 'manual', ...(body !== undefined ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
    for (const cookie of response.headers.getSetCookie()) {
      if (cookie.startsWith('better-auth.session_token=')) this.cookie = cookie.split(';')[0];
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    let data; try { data = JSON.parse(buffer.toString()); } catch { data = null; }
    const allowed = Array.isArray(expected) ? expected : [expected];
    assert.ok(allowed.includes(response.status), `${method} ${path.split('?')[0].replace(/\/journey-share\/.*/, '/journey-share/[redacted]')}: expected ${allowed}, got ${response.status}`);
    return { status: response.status, data, buffer, headers: response.headers };
  }
}
async function scenario(name, work) {
  try { await work(); results.push({ name, status: 'passed' }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, status: 'failed', reason: String(error.message).split('\n')[0] }); console.log('FAIL ' + name + ': ' + String(error.message).split('\n')[0]); }
  record('results.json', { status: 'running', results });
}
async function emailUrl(userId, intent = 'ACCOUNT_VERIFICATION') {
  for (let attempt = 0; attempt < 30; attempt++) {
    const { rows: [row] } = await db.query('select payload from notification_outbox where user_id=$1 and type=$2 order by created_at desc limit 1', [userId, intent]);
    if (row?.payload.actionUrl) return row.payload.actionUrl;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Controlled email intent was not created');
}
async function register(name) {
  const user = new Client(name); user.email = `${name}@p2.invalid`;
  await user.call('POST', '/auth/sign-up/email', { name: `P2 ${name}`, email: user.email, password: passwordFor(name) }, 200);
  const { rows: [row] } = await db.query('select id,email_verified from "user" where email=$1', [user.email]);
  user.id = row.id; assert.equal(row.email_verified, false);
  const url = new URL(await emailUrl(user.id));
  assert.equal(url.origin, apiOrigin);
  const verified = await fetch(url, { redirect: 'manual', headers: { 'x-forwarded-for': user.ip } }); assert.equal(verified.status, 302);
  await user.call('POST', '/auth/sign-in/email', { email: user.email, password: passwordFor(name) }, 200);
  assert.ok(user.cookie); accounts[name] = user;
  return user;
}
async function submit(user) {
  await user.call('PUT', '/me/profile', { firstName: 'Synthetic', lastNamePrivate: user.name, displayName: `P2 ${user.name}` });
  const form = new FormData(); form.set('nyscIntakeId', intake.id); form.set('orientationCampId', camp.id);
  form.set('document', new Blob([document], { type: 'image/png' }), 'synthetic-callup.png');
  const { data } = await user.call('POST', '/verification', form);
  user.verificationId = data.id; return data;
}
async function review(user, action = 'approve') {
  await accounts.admin.call('POST', `/admin/verifications/${user.verificationId}/start-review`, { expectedStatus: 'SUBMITTED' });
  return accounts.admin.call('POST', `/admin/verifications/${user.verificationId}/${action}`, {
    expectedStatus: 'UNDER_REVIEW', ...(action !== 'approve' ? { reasonCode: 'DOCUMENT_UNREADABLE', userSafeReason: 'Synthetic regression review' } : {}),
  });
}
const planInput = (overrides = {}) => ({ destinationCampId: camp.id, originStateId: origin.state_id, originLgaId: origin.id, originTownId: null,
  intendedTravelDate: '2099-01-14', dateFlexibilityDays: 1, departureWindow: 'MORNING', transportMode: 'COMMERCIAL_BUS',
  transportFlexible: false, nearbyMatchingEnabled: true, groupPreference: 'ANY_VERIFIED_PCM', ...overrides });
async function plan(user, overrides = {}) {
  const { data } = await user.call('POST', '/travel-plans', planInput(overrides)); user.planId = data.plan.id; return data;
}
async function worker() { await command(['--import','tsx','src/jobs/process-matching.ts'], { quiet: true }); }
function persistState() { record('state.json', { accounts: Object.fromEntries(Object.entries(accounts).map(([key, user]) => [key, { id: user.id, email: user.email, verificationId: user.verificationId, planId: user.planId }])), camp, intake, origin, otherOrigin, circleId }); }

try {
  await scenario('localhost health, database readiness and credentialed CORS', async () => {
    const anon = new Client('anonymous'); await anon.call('GET','/health'); await anon.call('GET','/health/ready');
    const response = await fetch(apiOrigin + '/api/health', { headers: { origin: webOrigin } });
    assert.equal(response.headers.get('access-control-allow-origin'), webOrigin);
    const hostile = await fetch(apiOrigin + '/api/health', { headers: { origin: 'https://untrusted.invalid' } });
    assert.notEqual(hostile.headers.get('access-control-allow-origin'), 'https://untrusted.invalid');
    await anon.call('GET','/me',undefined,401);
  });
  await scenario('actual registration, controlled verification tokens and login', async () => {
    for (const name of ['admin','alice','bob','solo','outsider','badadmin','rejected','resubmit','browser']) await register(name);
    await db.query(`update "user" set role='ADMIN' where id=any($1::uuid[]) and email_verified=true`, [[accounts.admin.id, accounts.badadmin.id]]);
    await db.query(`insert into admin_capability_grant(admin_user_id,capability,granted_by) select $1, unnest(enum_range(null::admin_capability)), $1 on conflict do nothing`, [accounts.admin.id]);
    const { data: catalog } = await accounts.alice.call('GET','/catalog'); intake = catalog.intakes[0]; camp = catalog.camps[0];
    assert.ok(camp && intake);
    ({ rows: [origin] } = await db.query("select id,state_id from lga where name='Owerri Municipal' limit 1"));
    if (!origin) ({ rows: [origin] } = await db.query('select id,state_id from lga order by id limit 1'));
    ({ rows: [otherOrigin] } = await db.query('select id,state_id from lga where state_id<>$1 order by id limit 1',[origin.state_id]));
    persistState();
  });
  if (!accounts.admin || !origin) throw new Error('Account bootstrap failed; dependent scenarios cannot execute');
  await scenario('session persistence, logout, revocation and database expiry', async () => {
    const user = accounts.outsider; const oldCookie = user.cookie;
    await user.call('GET','/me'); await user.call('POST','/auth/sign-out', {}, 200);
    user.cookie = oldCookie; await user.call('GET','/me',undefined,401);
    await user.call('POST','/auth/sign-in/email',{email:user.email,password:passwordFor(user.name)},200);
    await db.query('update session set expires_at=now()-interval \'1 minute\' where user_id=$1',[user.id]);
    await user.call('GET','/me',undefined,401);
    await user.call('POST','/auth/sign-in/email',{email:user.email,password:passwordFor(user.name)},200);
    await new Client('anonymous').call('GET','/auth/verify-email?token=invalid',undefined,[400,401,302]);
  });
  await scenario('multipart verification, administrator approval and eligibility gate', async () => {
    await accounts.browser.call('POST','/travel-plans', planInput(),403);
    for (const name of ['alice','bob','solo','outsider']) { await submit(accounts[name]); await review(accounts[name]); }
  });
  await scenario('independent rejection and resubmission review branches', async () => {
    await submit(accounts.rejected); await review(accounts.rejected,'reject');
    assert.equal((await accounts.rejected.call('GET','/verification/status')).data.verification.status,'REJECTED');
    await submit(accounts.resubmit); await review(accounts.resubmit,'request-resubmission');
    assert.equal((await accounts.resubmit.call('GET','/verification/status')).data.verification.status,'RESUBMISSION_REQUIRED');
    await submit(accounts.resubmit); await review(accounts.resubmit);
  });
  await scenario('private document download bytes, capability denial and audit', async () => {
    const { data: detail } = await accounts.admin.call('GET',`/admin/verifications/${accounts.alice.verificationId}`);
    const documentId = detail.documents[0].id;
    const path = `/admin/verifications/${accounts.alice.verificationId}/documents/${documentId}`;
    await new Client('anonymous').call('GET',path,undefined,401);
    await accounts.bob.call('GET',path,undefined,403);
    await accounts.badadmin.call('GET',path,undefined,403);
    const downloaded = await accounts.admin.call('GET',path);
    assert.deepEqual(downloaded.buffer,document); assert.equal(downloaded.headers.get('cache-control'),'no-store');
    const { rows:[audit] } = await db.query("select count(*)::int count from audit_log where action='VIEWED_VERIFICATION_DOCUMENT' and resource_id=$1 and actor_user_id=$2",[documentId,accounts.admin.id]); assert.ok(audit.count>0);
  });
  await scenario('Travel Plan create/edit/cancel, duplicate active and cross-user isolation', async () => {
    const item = await plan(accounts.solo);
    await accounts.solo.call('POST','/travel-plans',planInput(),409);
    await accounts.alice.call('GET',`/travel-plans/${item.plan.id}`,undefined,404);
    await accounts.alice.call('PATCH',`/travel-plans/${item.plan.id}`,planInput(),404);
    await accounts.solo.call('PATCH',`/travel-plans/${item.plan.id}`,planInput({intendedTravelDate:'2099-04-14'}));
    await accounts.solo.call('POST',`/travel-plans/${item.plan.id}/cancel`,{});
    await accounts.solo.call('POST',`/travel-plans/${item.plan.id}/cancel`,{});
    await plan(accounts.solo,{intendedTravelDate:'2099-04-14'});
    await accounts.outsider.call('POST','/travel-plans',planInput({originStateId:otherOrigin.state_id}),400);
  });
  await scenario('actual outbox worker matches overlapping dates without changing plan preferences', async () => {
    alicePlan=await plan(accounts.alice,{intendedTravelDate:'2099-01-14',departureWindow:'MORNING',transportMode:'COMMERCIAL_BUS'});
    bobPlan=await plan(accounts.bob,{intendedTravelDate:'2099-01-15',departureWindow:'FLEXIBLE',transportMode:'UNDECIDED'});
    originalPlans=[alicePlan.plan,bobPlan.plan].map(p=>({id:p.id,intended_travel_date:p.intendedTravelDate,departure_window:p.departureWindow,transport_mode:p.transportMode}));
    await worker();
    const a=(await accounts.alice.call('GET','/travel-circles/current')).data;
    const b=(await accounts.bob.call('GET','/travel-circles/current')).data;
    assert.ok(a?.circle); assert.equal(a.circle.id,b.circle.id); circleId=a.circle.id;
    const {rows:plans}=await db.query('select id,intended_travel_date,departure_window,transport_mode from travel_plan where id=any($1::uuid[]) order by id',[originalPlans.map(p=>p.id)]);
    assert.deepEqual(plans,originalPlans.sort((a,b)=>a.id.localeCompare(b.id)));
    persistState();
  });
  await scenario('PRIORITY: both Circle Journeys use agreed date/window/mode; SOLO uses plan', async () => {
    assert.ok(circleId,'Matching did not establish Circle');
    const {rows:[circle]}=await db.query('select * from travel_circle where id=$1',[circleId]);
    for (const name of ['alice','bob']) {
      const {data}=await accounts[name].call('POST','/journeys/prepare',{});
      assert.equal(data.journey.travelDate,circle.travel_date,`${name} Journey travelDate differs from Circle`);
      assert.equal(data.journey.departureWindow,circle.departure_window,`${name} Journey departureWindow differs from Circle`);
      assert.equal(data.journey.transportMode,circle.transport_mode,`${name} Journey transportMode differs from Circle`);
    }
    const {data:solo}=await accounts.solo.call('POST','/journeys/prepare',{});
    assert.equal(solo.journey.journeyMode,'SOLO');assert.equal(solo.journey.travelDate,'2099-04-14');assert.equal(solo.journey.transportMode,'COMMERCIAL_BUS');
  });
  await scenario('Circle privacy, messages, read cursor, confirmations and meetup consensus', async () => {
    assert.equal((await accounts.outsider.call('GET','/travel-circles/current')).data,null);
    await accounts.outsider.call('GET','/travel-circles/current/messages',undefined,[403,404]);
    const {data:message}=await accounts.alice.call('POST','/travel-circles/current/messages',{body:'Synthetic P2 coordination message'});
    const messages=(await accounts.bob.call('GET','/travel-circles/current/messages')).data;
    assert.ok(JSON.stringify(messages).includes('Synthetic P2 coordination message'));
    await accounts.bob.call('POST','/travel-circles/current/messages/read',{messageId:message.id});
    for(const name of ['alice','bob'])await accounts[name].call('POST','/travel-circles/current/confirm');
    const {data:meetup}=await accounts.alice.call('POST','/travel-circles/current/meetup',{areaLabel:'Synthetic public pickup',locationDescription:'Generated test meeting point; not real travel advice'});
    for(const name of ['alice','bob'])await accounts[name].call('POST',`/travel-circles/current/meetup/${meetup.id}/confirm`);
    assert.equal((await accounts.alice.call('GET','/travel-circles/current/meetup')).data.status,'AGREED');
  });
  await scenario('worker idempotency, capacity invariants and incompatible third-party requests', async () => {
    await plan(accounts.outsider,{intendedTravelDate:'2099-01-14',originStateId:otherOrigin.state_id,originLgaId:otherOrigin.id,nearbyMatchingEnabled:false});
    await worker();await worker();
    assert.equal((await accounts.outsider.call('GET','/travel-circles/current')).data,null);
    const {rows:[counts]}=await db.query("select (select count(*)::int from travel_circle where member_count>6 or member_count<2) overflow,(select count(*)::int from (select user_id from travel_circle_member where membership_status in ('JOINED','CONFIRMED') group by user_id having count(*)>1) x) duplicates");
    assert.deepEqual(counts,{overflow:0,duplicates:0});
    await accounts.outsider.call('POST',`/travel-circles/${circleId}/join`,{},404);
  });
  await scenario('Circle locking via actual lifecycle; start rules and member journeys', async () => {
    await accounts.alice.call('POST','/journeys/current/start',undefined,409);
    await import('reflect-metadata');
    const {CircleLifecycleService}=await import('../../dist/src/circles/circle-lifecycle.service.js');
    const lifecycle=new CircleLifecycleService();await lifecycle.requestConfirmations(new Date('2099-01-14T23:59:00Z'));await lifecycle.lockDue(new Date('2099-01-14T23:59:00Z'));
    for(const name of ['alice','bob']) {
      const current=(await accounts[name].call('GET','/journeys/current')).data;
      for(const item of current.checklist)await accounts[name].call('PATCH',`/journeys/current/checklist/${item.itemKey}`,{completed:true});
      await accounts[name].call('POST','/journeys/current/ready');
      await accounts[name].call('POST','/journeys/current/start');
    }
  });
  await scenario('trusted contacts, sharing privacy, revocation, expiry and explicit consent', async () => {
    const user=accounts.alice;
    const {data:contact}=await user.call('POST','/trusted-contacts',{name:'Synthetic Contact',relationship:'Test contact',email:'trusted@p2.invalid'});
    await accounts.bob.call('PATCH',`/trusted-contacts/${contact.id}`,{name:'Synthetic Other',relationship:'Test',email:'other@p2.invalid'},404);
    let {data:share}=await user.call('POST','/journeys/current/share',{trustedContactId:contact.id});
    let path='/journey-share/'+new URL(share.url).pathname.split('/').pop();
    const publicData=(await new Client('public').call('GET',path)).data;
    for(const key of ['email','contacts','members','documents','tokenHash'])assert.equal(Object.hasOwn(publicData,key),false);
    await user.call('POST','/journeys/current/share/revoke');await new Client('public').call('GET',path,undefined,404);
    ({data:share}=await user.call('POST','/journeys/current/share',{trustedContactId:contact.id}));path='/journey-share/'+new URL(share.url).pathname.split('/').pop();
    await db.query("update journey_share set expires_at=now()-interval '1 minute' where trusted_contact_id=$1",[contact.id]);await new Client('public').call('GET',path,undefined,404);
    await user.call('POST','/journeys/current/share',{trustedContactId:contact.id});
    await user.call('POST','/journeys/current/emergency/location',{latitude:0,longitude:0,audience:'TRUSTED_CONTACT'},400);
    await user.call('POST','/journeys/current/emergency/location',{latitude:0,longitude:0,audience:'TRUSTED_CONTACT',consent:true});
  });
  await scenario('check-in idempotency, simulated attention and safe recovery', async () => {
    const requestId=randomUUID(),user=accounts.alice;
    const input={type:'SAFE',clientRequestId:requestId,includeLocation:false};
    await user.call('POST','/journeys/current/check-ins',input);await user.call('POST','/journeys/current/check-ins',input);
    const {rows:[count]}=await db.query('select count(*)::int count from journey_check_in where client_request_id=$1',[requestId]);assert.equal(count.count,1);
    await user.call('POST','/journeys/current/check-ins',{type:'NEED_HELP',clientRequestId:randomUUID(),includeLocation:false});
    assert.equal((await user.call('GET','/journeys/current')).data.journey.status,'NEEDS_ATTENTION');
    await user.call('POST','/journeys/current/emergency/alert-trusted');
    await user.call('POST','/journeys/current/check-ins',{type:'SAFE',clientRequestId:randomUUID(),includeLocation:false});
  });
  await scenario('moderation report, capability controls, restriction and active safety access', async () => {
    const {data:report}=await accounts.alice.call('POST','/safety-reports',{reportedUserId:accounts.bob.id,travelCircleId:circleId,category:'OTHER',description:'Synthetic report for integration coverage'});
    await accounts.badadmin.call('GET','/admin/safety/reports',undefined,403);
    await accounts.bob.call('GET',`/safety-reports/${report.id}/status`,undefined,404);
    await accounts.admin.call('POST',`/admin/safety/reports/${report.id}/triage`,{severity:'LOW',openCase:true});
    const {data:restriction}=await accounts.admin.call('POST',`/admin/safety/users/${accounts.alice.id}/restrictions`,{restrictionType:'ACCOUNT_SUSPENDED',reasonCode:'P2_SYNTHETIC_TEST'});
    await accounts.alice.call('POST','/travel-plans',planInput(),403);
    await accounts.alice.call('POST','/journeys/current/check-ins',{type:'SAFE',clientRequestId:randomUUID(),includeLocation:false});
    await accounts.admin.call('POST',`/admin/safety/users/${accounts.alice.id}/restrictions/${restriction.id}/revoke`);
  });
  await scenario('arrival, completion, duplicate requests and blocked post-completion actions', async () => {
    for(const name of ['alice','bob']){
      const user=accounts[name],key=randomUUID();
      await user.call('POST','/journeys/current/arrive',{clientRequestId:key});await user.call('POST','/journeys/current/arrive',{clientRequestId:key});
      await user.call('POST','/journeys/current/complete');await user.call('POST','/journeys/current/complete');
      await user.call('POST','/journeys/current/check-ins',{type:'SAFE',clientRequestId:randomUUID(),includeLocation:false},409);
      await user.call('PATCH','/journeys/current/checklist/PHONE_CHARGED',{completed:false},404);
    }
  });
  await scenario('fixed dates, alternative offers, ownership, leave and dissolution', async () => {
    for (const name of ['offer-a','offer-b','fixed-a','fixed-b']) { await register(name); await submit(accounts[name]); await review(accounts[name]); }
    for (const name of ['fixed-a','fixed-b']) await plan(accounts[name], { intendedTravelDate: name === 'fixed-a' ? '2099-08-14' : '2099-08-15', dateFlexibilityDays: 0 });
    await plan(accounts['offer-a'], { intendedTravelDate: '2099-09-14', dateFlexibilityDays: 0, departureWindow: 'EARLY_MORNING' });
    await plan(accounts['offer-b'], { intendedTravelDate: '2099-09-14', dateFlexibilityDays: 0, departureWindow: 'AFTERNOON' });
    await worker();
    for (const name of ['fixed-a','fixed-b']) assert.equal((await accounts[name].call('GET','/travel-circles/current')).data,null);
    const {data:offers}=await accounts['offer-a'].call('GET','/match-offers');
    assert.ok(offers.length); const offer=offers[0].match_offer ?? offers[0];
    await accounts.outsider.call('GET',`/match-offers/${offer.id}`,undefined,404);
    await accounts.outsider.call('POST',`/match-offers/${offer.id}/accept`,undefined,404);
    await accounts['offer-a'].call('POST',`/match-offers/${offer.id}/accept`);
    await accounts['offer-b'].call('POST',`/match-offers/${offer.id}/accept`,undefined,404);
    const {data:circle}=await accounts['offer-a'].call('GET','/travel-circles/current'); assert.ok(circle);
    await accounts['offer-a'].call('POST','/travel-circles/current/leave',{stillTravelling:true});
    assert.equal((await accounts['offer-b'].call('GET','/travel-circles/current')).data,null);
  });
  await scenario('actual matching processor retains failed work and retries successfully', async () => {
    const {processMatchingOutbox}=await import('../../dist/src/matching/matching.worker.js');
    await accounts['fixed-a'].call('POST','/matching/rematch');
    await assert.rejects(processMatchingOutbox({processBatch:async()=>{throw new Error('controlled worker failure');}}));
    const {rows:[pending]}=await db.query("select count(*)::int count from domain_outbox where processed_at is null and attempts>0"); assert.ok(pending.count>0);
    await db.query("update domain_outbox set available_at=now() where processed_at is null and attempts>0");
    await worker();
  });
  await scenario('controlled email outage preserves writes and retry worker recovers', async () => {
    await fetch('http://127.0.0.1:4101/fail-on');
    await accounts.solo.call('POST','/journeys/current/share',{trustedContactId:randomUUID()},404);
    const {queueEmail,retryQueuedEmails}=await import('../../dist/src/email/email.service.js');
    await queueEmail({userId:accounts.solo.id,to:'retry@p2.invalid',intent:'JOURNEY_SAFETY',subject:'Synthetic retry',text:'Controlled test only'});
    for(let attempt=0;attempt<100;attempt++) {
      const {rows:[pending]}=await db.query("select count(*)::int count from notification_outbox where last_error is not null and sent_at is null");
      if(pending.count>0)break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    const {rows:[failed]}=await db.query("select count(*)::int count from notification_outbox where last_error is not null and sent_at is null");assert.ok(failed.count>0);
    await fetch('http://127.0.0.1:4101/fail-off');await retryQueuedEmails(100);
    const {rows:[remaining]}=await db.query("select count(*)::int count from notification_outbox where last_error is not null and sent_at is null");assert.equal(remaining.count,0);
  });
  persistState();
} finally {
  await fetch('http://127.0.0.1:4101/fail-off').catch(()=>{});
  const sink=await fetch('http://127.0.0.1:4101/status').then(r=>r.json()).catch(()=>null);
  record('results.json',{status:results.some(r=>r.status==='failed')?'failed':'passed',results,sink});
  console.log(JSON.stringify({passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,sink}));
  await db.end();
  const {pool}=await import('../../dist/src/db/database.js');await pool.end();
  if(results.some(r=>r.status==='failed'))process.exitCode=1;
}
