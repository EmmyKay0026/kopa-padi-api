import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {connect,environment,readState,record,apiOrigin,webOrigin,passwordFor,command} from '../p2/support.mjs';
const db=await connect();Object.assign(process.env,environment());
const {JourneyService}=await import('../../dist/src/journeys/journey.service.js');
const {enqueueEmail,deliverQueuedEmail,retryQueuedEmails}=await import('../../dist/src/email/email.service.js');
const {pool}=await import('../../dist/src/db/database.js');
const service=new JourneyService({});const state=readState(),results=[];
async function test(name,work){try{await work();results.push({name,status:'passed'});console.log('PASS '+name);}catch(error){const location=String(error.stack).match(/safety.mjs:\d+:\d+/)?.[0]??'unknown';results.push({name,status:'failed',location});console.log('FAIL '+name+' at '+location);process.exitCode=1;}}
async function client(name){const r=await fetch(apiOrigin+'/api/auth/sign-in/email',{method:'POST',headers:{origin:webOrigin,'content-type':'application/json','x-forwarded-for':'127.0.0.240'},body:JSON.stringify({email:name+'@p2.invalid',password:passwordFor(name)})});assert.equal(r.status,200);const cookie=r.headers.getSetCookie().find(x=>x.startsWith('better-auth.session_token=')).split(';')[0];return async(method,path,body,base=apiOrigin)=>fetch(base+'/api'+path,{method,headers:{origin:webOrigin,cookie,'content-type':'application/json','x-forwarded-for':'127.0.0.240'},...(body?{body:JSON.stringify(body)}:{})});}
const alice=state.accounts.alice.id,bob=state.accounts.bob.id;
let contact,journey,rawToken,shareId;
async function share(){await db.query("update journey_share set status='REVOKED',revoked_at=now() where journey_id=$1 and trusted_contact_id=$2 and status='ACTIVE'",[journey.id,contact.id]);rawToken=randomBytes(32).toString('base64url');const hash=createHash('sha256').update(rawToken).digest('hex');const {rows:[row]}=await db.query("insert into journey_share(journey_id,trusted_contact_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 day') returning id",[journey.id,contact.id,hash]);shareId=row.id;return row.id;}
async function intent(){return enqueueEmail({userId:alice,to:contact.email,intent:'JOURNEY_SAFETY',subject:'Synthetic safety',text:'Synthetic only',safety:{journeyId:journey.id,shareId,contactId:contact.id}});}
try{
 const owner=await client('alice'),other=await client('bob'); await service.withdrawLocation(alice); await service.withdrawLocation(bob);
 journey=(await db.query('select * from journey where user_id=$1 order by created_at desc limit 1',[alice])).rows[0];assert.ok(journey);
 contact=await service.createContact(alice,{name:'Synthetic P24',relationship:'Test',email:'p24-contact@p2.invalid',phone:null});
 await test('completion owner revocation is idempotent and cross-user isolated',async()=>{
  await share();await service.publicShare(rawToken);await service.revokeShares(bob);await service.publicShare(rawToken);
  assert.equal((await owner('POST','/journeys/sharing/revoke')).status,201);
  await assert.rejects(service.publicShare(rawToken));assert.equal((await service.revokeShares(alice)).revoked,0);
 });
 await test('restricted completed owner can revoke without broader access',async()=>{
  await share();await db.query("update \"user\" set account_status='SUSPENDED' where id=$1",[alice]);
  try{assert.equal((await owner('GET','/journeys/sharing')).status,200);assert.equal((await owner('POST','/journeys/sharing/revoke')).status,201);assert.equal((await owner('GET','/me')).status,403);}finally{await db.query("update \"user\" set account_status='ACTIVE' where id=$1",[alice]);}
 });
 await test('public valid revoked and expired responses are no-store and private',async()=>{
  await share();let r=await fetch(apiOrigin+'/api/journey-share/'+rawToken);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  await db.query("update journey_share set expires_at=now()-interval '1 second' where id=$1",[shareId]);r=await fetch(apiOrigin+'/api/journey-share/'+rawToken);assert.equal(r.status,404);assert.match(r.headers.get('cache-control'),/no-store/);
 });
 await test('real maintenance HTTP server permits owner withdrawal and blocks new writes',async()=>{
  const child=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../../',import.meta.url),env:{...environment(),PORT:'4102',MAINTENANCE_MODE:'true'},windowsHide:true,stdio:'ignore'});
  try {
   let ready=false;for(let n=0;n<300;n++){try{const r=await fetch('http://localhost:4102/api/health');if(r.ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
   const login=await fetch('http://localhost:4102/api/auth/sign-in/email',{method:'POST',headers:{origin:webOrigin,'content-type':'application/json'},body:JSON.stringify({email:'alice@p2.invalid',password:passwordFor('alice')})});assert.equal(login.status,200);
   assert.equal((await owner('POST','/journeys/sharing/revoke',undefined,'http://localhost:4102')).status,201);
   assert.equal((await owner('POST','/journeys/sharing/location/revoke',undefined,'http://localhost:4102')).status,201);
   assert.equal((await owner('POST','/journeys/current/start',undefined,'http://localhost:4102')).status,503);
  } finally {child.kill();await new Promise(r=>child.once('exit',r));}
 });
 await test('location withdrawal after completion excludes coordinates from public response',async()=>{
  await share();await db.query("insert into journey_location_share(journey_id,latitude,longitude,audience,expires_at) values($1,0,0,'TRUSTED_CONTACT',now()+interval '1 hour')",[journey.id]);
  assert.ok((await service.publicShare(rawToken)).currentLocation);assert.equal((await other('POST','/journeys/sharing/location/revoke')).status,201);assert.ok((await service.publicShare(rawToken)).currentLocation);
  assert.equal((await owner('POST','/journeys/sharing/location/revoke')).status,201);assert.equal((await service.publicShare(rawToken)).currentLocation,null);
 });
 await test('Circle readers cannot access trusted-contact audience or nonmember locations',async()=>{
  await db.query("update journey set status='IN_PROGRESS' where user_id=any($1::uuid[])",[[alice,bob]]);
  await service.shareLocation(alice,{latitude:0,longitude:0,audience:'TRUSTED_CONTACT'});assert.equal((await service.circleLocations(bob)).length,0);
  await service.shareLocation(alice,{latitude:0,longitude:0,audience:'CIRCLE'});assert.equal((await service.circleLocations(bob)).length,1);
  const {rows:[member]}=await db.query('select id,membership_status from travel_circle_member where user_id=$1 and travel_circle_id=$2',[bob,journey.travel_circle_id]);
  await db.query("update travel_circle_member set membership_status='LEFT',left_at=now() where id=$1",[member.id]);try{await assert.rejects(service.circleLocations(bob));}finally{await db.query('update travel_circle_member set membership_status=$2,left_at=null where id=$1',[member.id,member.membership_status]);}
  await service.withdrawLocation(alice);assert.equal((await service.circleLocations(bob)).length,0);
 });
 await test('no-recipient and phone-only alert outcomes never claim delivery',async()=>{
  await service.revokeShares(alice);await assert.rejects(service.shareLocation(alice,{latitude:0,longitude:0,audience:'TRUSTED_CONTACT'}));let r=await service.alertTrusted(alice);assert.equal(r.status,'NO_ELIGIBLE_RECIPIENTS');
  const phone=await service.createContact(alice,{name:'Synthetic phone',relationship:'Test',phone:'+2340000000000',email:null});await service.createShare(alice,phone.id);
  r=await service.alertTrusted(alice);assert.equal(r.status,'NO_ELIGIBLE_RECIPIENTS');assert.equal(r.providerAccepted,0);
 });
 await test('reminder periods transactionally persist intents and repeated runs deduplicate',async()=>{
  await share();await db.query('delete from journey_reminder where journey_id=$1',[journey.id]);
  await db.query("update journey set started_at=now()-interval '7 hours',last_check_in_at=now()-interval '7 hours' where id=$1",[journey.id]);
  const before=(await db.query("select count(*)::int n from notification_outbox where user_id=$1 and type='JOURNEY_SAFETY'",[alice])).rows[0].n;
  const now=new Date();await service.processReminders(now);await service.processReminders(now);
  assert.equal((await db.query('select count(*)::int n from journey_reminder where journey_id=$1',[journey.id])).rows[0].n,3);
  const after=(await db.query("select count(*)::int n from notification_outbox where user_id=$1 and type='JOURNEY_SAFETY'",[alice])).rows[0].n;assert.equal(after-before,2);
 });
 await test('a later check-in resets elapsed periods without an early second alert',async()=>{
  const before=(await db.query("select count(*)::int n from notification_outbox where user_id=$1 and type='JOURNEY_SAFETY'",[alice])).rows[0].n;
  await db.query("update journey set last_check_in_at=now()-interval '3 hours' where id=$1",[journey.id]);
  await service.processReminders(new Date());await service.processReminders(new Date());
  const after=(await db.query("select count(*)::int n from notification_outbox where user_id=$1 and type='JOURNEY_SAFETY'",[alice])).rows[0].n;assert.equal(after,before);
 });
 await test('reminder transaction failure rolls back dedupe event and notification intent',async()=>{
  await db.query('delete from journey_reminder where journey_id=$1',[journey.id]);
  await db.query("update journey set last_check_in_at=now()-interval '8 hours' where id=$1",[journey.id]);
  await db.query("create function p24_fail_email() returns trigger language plpgsql as $$ begin raise exception 'synthetic transaction failure'; end $$");
  await db.query('create trigger p24_fail_email before insert on notification_outbox for each row execute function p24_fail_email()');
  try{await assert.rejects(service.processReminders(new Date()));assert.equal((await db.query('select count(*)::int n from journey_reminder where journey_id=$1',[journey.id])).rows[0].n,0);}finally{await db.query('drop trigger p24_fail_email on notification_outbox');await db.query('drop function p24_fail_email()');}
  await service.processReminders(new Date());
 });
 await test('revoked recipient and deleted contact intents cancel without provider I/O',async()=>{
  await share();const id=await intent();await service.revokeShares(alice);assert.equal(await deliverQueuedEmail(id),'cancelled');
  await share();const second=await intent();await service.deleteContact(alice,contact.id);assert.equal(await deliverQueuedEmail(second),'cancelled');
  contact=await service.createContact(alice,{name:'Synthetic P24 replacement',relationship:'Test',email:'p24-replacement@p2.invalid',phone:null});await share();
 });
 await test('malformed queued payloads terminate and do not poison retry selection',async()=>{
  const {rows:[row]}=await db.query("insert into notification_outbox(user_id,type,payload) values($1,'JOURNEY_SAFETY','{}') returning id",[alice]);assert.equal(await deliverQueuedEmail(row.id),'cancelled');assert.equal((await db.query('select attempts from notification_outbox where id=$1',[row.id])).rows[0].attempts,'5');
 });
 await test('invalid safety consent metadata is terminal before database casts',async()=>{
  const id=await enqueueEmail({userId:alice,to:contact.email,intent:'JOURNEY_SAFETY',subject:'Synthetic',text:'Synthetic',safety:{journeyId:'------------------------------------',shareId:'invalid',contactId:'invalid'}});
  assert.equal(await deliverQueuedEmail(id),'cancelled');
 });
 await test('committed reminder survives child exit and a fresh retry worker',async()=>{
  await share();await db.query('delete from journey_reminder where journey_id=$1',[journey.id]);
  await db.query("update journey set last_check_in_at=now()-interval '9 hours' where id=$1",[journey.id]);
  const child=spawn(process.execPath,['test/p24/crash-reminder.mjs'],{cwd:new URL('../../',import.meta.url),env:environment(),windowsHide:true,stdio:'ignore'});
  const code=await new Promise(r=>child.once('exit',r));assert.equal(code,17);
  const pending=(await db.query("select count(*)::int n from notification_outbox where user_id=$1 and type='JOURNEY_SAFETY' and sent_at is null and attempts='0'",[alice])).rows[0].n;assert.ok(pending>=2);
  for(let n=0;n<10;n++){await command(['dist/src/jobs/retry-notifications.js']);const left=(await db.query("select count(*)::int n from notification_outbox where user_id=$1 and type='JOURNEY_SAFETY' and sent_at is null and attempts='0'",[alice])).rows[0].n;if(!left)break;}
  assert.equal((await db.query("select count(*)::int n from notification_outbox where user_id=$1 and type='JOURNEY_SAFETY' and sent_at is null and attempts='0'",[alice])).rows[0].n,0);
 });
 await test('real capture-sink HTTP timeout and 429 retain retryable intents',async()=>{
  await share();const id=await intent();process.env.ZEPTO_MAIL_TIMEOUT_MS='100';
  await fetch('http://127.0.0.1:4101/hang-on');const start=Date.now();
  try{assert.equal(await deliverQueuedEmail(id),'failed');assert.ok(Date.now()-start<3000);}finally{await fetch('http://127.0.0.1:4101/fail-off');delete process.env.ZEPTO_MAIL_TIMEOUT_MS;}
  await fetch('http://127.0.0.1:4101/rate-limit-on');try{assert.equal(await deliverQueuedEmail(id),'failed');}finally{await fetch('http://127.0.0.1:4101/fail-off');}
  assert.equal(await deliverQueuedEmail(id),'accepted');
 });
 await test('provider outage exhaustion restart and concurrent claims use local sink only',async()=>{
  await fetch('http://127.0.0.1:4101/fail-on');const id=await intent();
  try{for(let n=0;n<5;n++)assert.equal(await deliverQueuedEmail(id),'failed');assert.equal(await deliverQueuedEmail(id),'skipped');}finally{await fetch('http://127.0.0.1:4101/fail-off');}
  const next=await intent();const before=await (await fetch('http://127.0.0.1:4101/status')).json();
  await Promise.all([deliverQueuedEmail(next),deliverQueuedEmail(next),deliverQueuedEmail(next)]);
  const after=await (await fetch('http://127.0.0.1:4101/status')).json();assert.equal(after.accepted-before.accepted,1);
  assert.ok((await db.query('select sent_at from notification_outbox where id=$1',[next])).rows[0].sent_at);
 });
} finally {
 await db.query("update journey set status='COMPLETED' where user_id=any($1::uuid[]) and status='IN_PROGRESS'",[[alice,bob]]);
 record('p24-results.json',{results});await db.end();await pool.end();
}
