// Run only via test/p24/local.mjs. Synthetic fixtures; no reset and no outbound messages.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect } from './p2/support.mjs';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { serializeSignedCookie } from 'better-call';
const client = await connect();
const circleIds = [], userIds = [], planIds = [], verificationIds = [];
const campId = randomUUID(), intakeId = randomUUID();
let pool, server;
const passed = [];
const test = async (name, run) => { await run(); passed.push(name); console.log('PASS: ' + name); };
try {
  const database = await import('../dist/src/db/database.js'); pool = database.pool;
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  await migrate(database.db, { migrationsFolder: './drizzle' });
  const { CircleLockService, invalidateCircleLockApprovals } = await import('../dist/src/circles/circle-lock.js');
  const { CircleLifecycleService } = await import('../dist/src/circles/circle-lifecycle.service.js');
  const { MatchingService } = await import('../dist/src/matching/matching.service.js');
  const service = new CircleLockService();
  const { rows: [origin] } = await client.query('select id,state_id from lga order by id limit 1'); assert.ok(origin);
  await client.query('insert into orientation_camp(id,state_name,camp_name) values($1,$2,$3)', [campId, 'Synthetic', 'Lock fixture '+campId]);
  await client.query('insert into nysc_intake(id,service_year,batch,stream) values($1,$2,$3,$4)', [intakeId, '2099', campId, 'synthetic']);
  async function member(circleId) {
    const user = randomUUID(), plan = randomUUID(), verification = randomUUID();
    userIds.push(user); planIds.push(plan); verificationIds.push(verification);
    await client.query('insert into "user"(id,name,email,email_verified) values($1,$2,$3,true)', [user, 'Synthetic lock tester', user+'@p2.invalid']);
    await client.query("insert into pcm_verification(id,user_id,nysc_intake_id,orientation_camp_id,verification_status,verified_at,reviewed_by) values($1,$2,$3,$4,'VERIFIED',now(),$2)", [verification,user,intakeId,campId]);
    await client.query("insert into travel_plan(id,user_id,pcm_verification_id,origin_state_id,origin_lga_id,destination_camp_id,intended_travel_date,departure_window,transport_mode,status,expires_at) values($1,$2,$3,$4,$5,$6,'2099-10-31','MORNING','COMMERCIAL_BUS','IN_CIRCLE',now()+interval '1 day')", [plan,user,verification,origin.state_id,origin.id,campId]);
    await client.query("insert into travel_circle_member(travel_circle_id,travel_plan_id,user_id,membership_status,confirmed_at) values($1,$2,$3,'CONFIRMED',now())", [circleId,plan,user]);
    return user;
  }
  async function fixture(size) {
    const id = randomUUID(); circleIds.push(id);
    await client.query("insert into travel_circle(id,origin_lga_id,destination_camp_id,travel_date,departure_window,transport_mode,member_count) values($1,$2,$3,'2099-10-31','MORNING','COMMERCIAL_BUS',$4)", [id,origin.id,campId,size]);
    const users = []; for(let i=0;i<size;i++)users.push(await member(id));
    return { id, users };
  }
  const two = await fixture(2);
  await test('two members need both approvals; duplicate votes are idempotent; withdrawal works before lock', async () => {
    const state = await service.status(two.users[0]); assert.equal(state.required,2);
    await service.approve(two.users[0], { snapshot: state.snapshot, approve:true });
    assert.equal((await service.approve(two.users[0], {snapshot:state.snapshot,approve:true})).approvals,1);
    assert.equal((await service.approve(two.users[0], {snapshot:state.snapshot,approve:false})).approvals,0);
    await service.approve(two.users[0], {snapshot:state.snapshot,approve:true});
    const locked = await service.approve(two.users[1], {snapshot:state.snapshot,approve:true}); assert.equal(locked.locked,true);
    await assert.rejects(service.approve(two.users[0], {snapshot:state.snapshot,approve:false}), /permanently locked/);
    const plans = await client.query('select status from travel_plan where id in (select travel_plan_id from travel_circle_member where travel_circle_id=$1)', [two.id]);
    assert.ok(plans.rows.every(p=>p.status==='LOCKED'));
    assert.equal((await client.query('select count(*)::int n from journey where travel_circle_id=$1',[two.id])).rows[0].n,0);
  });
  await test('a matching worker with a stale Circle snapshot cannot reopen or join a locked Circle', async () => {
    const joined = await database.db.transaction(tx => new MatchingService().joinCircle(tx, { id: randomUUID(), userId: randomUUID() }, { id: two.id, memberCount: 2, maxMembers: 6 }));
    assert.equal(joined, null);
    const {rows:[circle]}=await client.query('select status,member_count from travel_circle where id=$1',[two.id]);
    assert.equal(circle.status,'LOCKED'); assert.equal(circle.member_count,2);
  });
  const three = await fixture(3);
  await test('concurrent duplicate and distinct approvals lock exactly once', async () => {
    const state = await service.status(three.users[0]);
    await Promise.all([service.approve(three.users[0],{snapshot:state.snapshot,approve:true}),service.approve(three.users[0],{snapshot:state.snapshot,approve:true}),service.approve(three.users[1],{snapshot:state.snapshot,approve:true})]);
    assert.equal((await service.status(three.users[0])).approvals,2);
    assert.equal((await client.query("select count(*)::int n from domain_outbox where aggregate_id=$1 and event_type='TravelCircleLocked'",[three.id])).rows[0].n,1);
    assert.equal((await client.query('select count(*)::int n from circle_notification where travel_circle_id=$1',[three.id])).rows[0].n,3);
  });
  await test('leaving an early-locked Circle in progress never reopens it', async () => {
    await client.query("update travel_circle set status='IN_JOURNEY' where id=$1",[three.id]);
    await database.db.transaction(tx=>new MatchingService().detachPlan(tx,planIds[userIds.indexOf(three.users[0])]));
    const {rows:[circle]}=await client.query('select status,member_count,locked_at from travel_circle where id=$1',[three.id]);
    assert.equal(circle.status,'IN_JOURNEY');assert.equal(circle.member_count,2);assert.ok(circle.locked_at);
    assert.equal((await client.query('select jsonb_array_length(approvals)::int n from circle_lock_request where travel_circle_id=$1',[three.id])).rows[0].n,2);
    assert.equal((await client.query("select count(*)::int n from circle_message where conversation_id in(select id from circle_conversation where travel_circle_id=$1) and body like '%Earlier lock approvals%'",[three.id])).rows[0].n,0);
    assert.equal(await database.db.transaction(tx=>new MatchingService().joinCircle(tx,{id:randomUUID(),userId:randomUUID()},{id:three.id,memberCount:2,maxMembers:6})),null);
  });
  const six = await fixture(6);
  await test('six members require three approvals', async () => {
    const state = await service.status(six.users[0]); assert.equal(state.required,3);
    for(let i=0;i<2;i++)assert.equal((await service.approve(six.users[i],{snapshot:state.snapshot,approve:true})).locked,false);
    assert.equal((await service.approve(six.users[2],{snapshot:state.snapshot,approve:true})).locked,true);
  });
  const change = await fixture(3);
  await test('membership changes reset votes and stale approval is rejected', async () => {
    const old = await service.status(change.users[0]); await service.approve(change.users[0],{snapshot:old.snapshot,approve:true});
    await member(change.id); await client.query('update travel_circle set member_count=4 where id=$1',[change.id]);
    assert.equal((await service.status(change.users[0])).approvals,0);
    await assert.rejects(service.approve(change.users[1],{snapshot:old.snapshot,approve:true}), /changed/);
    const fresh = await service.status(change.users[1]); await service.approve(change.users[1],{snapshot:fresh.snapshot,approve:true});
    assert.equal((await service.status(change.users[0])).approvals,1);
  });
  await test('leaving resets pending approvals and writes a shared warning', async () => {
    await database.db.transaction(tx => new MatchingService().detachPlan(tx, planIds[userIds.indexOf(change.users[1])]));
    assert.equal((await service.status(change.users[0])).approvals,0);
    const messages=await client.query('select body from circle_message where conversation_id in (select id from circle_conversation where travel_circle_id=$1)',[change.id]);
    assert.ok(messages.rows.some(m=>m.body.includes('Earlier lock approvals no longer count')));
  });
  await test('chat preserves request, approval, withdrawal and final permanent-lock warnings', async () => {
    const {rows}=await client.query('select body from circle_message where conversation_id in (select id from circle_conversation where travel_circle_id=$1)',[two.id]);
    for(const text of ['requested a permanent','approved the permanent','withdrew their lock','permanently locked','cannot be unlocked'])assert.ok(rows.some(m=>m.body.includes(text)),text);
  });
  await test('former member cannot approve',async()=>{await assert.rejects(service.status(change.users[1]),/No active Travel Circle/)});
  await test('real HTTP routes enforce authentication, PCM verification, account restrictions, strict input and permanent locking', async () => {
    const { createServer } = await import('node:net');
    const reservation = createServer(); await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
    const port = reservation.address().port; await new Promise(resolve=>reservation.close(resolve));
    const base = `http://127.0.0.1:${port}`;
    server=spawn(process.execPath,['dist/src/main.js'],{windowsHide:true,stdio:'ignore',env:{...process.env,PORT:String(port),HOST:'127.0.0.1',BETTER_AUTH_URL:base,SMTP_FALLBACK_ENABLED:'false'}});
    let started=false;
    for(let i=0;i<200;i++){
      if(server.exitCode!==null)throw new Error('Synthetic HTTP API failed to start');
      try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(300)})).ok){started=true;break}}catch{}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(started,'HTTP startup deadline');
    const token=randomUUID();
    await client.query("insert into session(id,user_id,token,expires_at) values($1,$2,$3,now()+interval '10 minutes')",[randomUUID(),two.users[0],token]);
    const cookie=(await serializeSignedCookie('better-auth.session_token',token,process.env.BETTER_AUTH_SECRET,{path:'/'})).split(';')[0];
    const request=(method,path,body,authenticated=true)=>fetch(base+'/api/travel-circles/current/'+path,{method,headers:{origin:'http://localhost:3100','content-type':'application/json',...(authenticated?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
    assert.equal((await request('GET','lock',null,false)).status,401);
    const stateResponse=await request('GET','lock'); assert.equal(stateResponse.status,200); assert.ok(stateResponse.headers.get('x-request-id')); assert.match(stateResponse.headers.get('cache-control'),/private, no-store/);
    const state=await stateResponse.json(); assert.equal(state.locked,true);
    assert.equal((await request('POST','lock/approval',{snapshot:state.snapshot,approve:true,userId:'forged'})).status,400);
    assert.equal((await request('POST','lock/approval',{snapshot:state.snapshot,approve:false})).status,409);
    assert.equal((await request('POST','lock/approval',{snapshot:state.snapshot,approve:true})).status,201);
    await client.query("update pcm_verification set verification_status='UNVERIFIED' where user_id=$1",[two.users[0]]);
    assert.equal((await request('GET','lock')).status,403);
    await client.query("update pcm_verification set verification_status='VERIFIED' where user_id=$1",[two.users[0]]);
    await client.query('update "user" set account_status=$1 where id=$2',['RESTRICTED',two.users[0]]);
    assert.equal((await request('GET','lock')).status,403);
    await client.query("update \"user\" set account_status='ACTIVE' where id=$1",[two.users[0]]);
  });
  // Automatic worker runs at real current time only; refuse if it could affect non-fixture circles.
  await test('automatic lock still works without votes and is idempotent', async () => {
    const {circleLockAt}=await import('../dist/src/circles/circle.domain.js'); const now=new Date();
    const {rows}=await client.query("select id,travel_date::text,departure_window,member_count from travel_circle where status in ('FORMING','READY','FULL')");
    assert.ok(rows.every(c=>circleIds.includes(c.id)||c.member_count<2||circleLockAt(c.travel_date,c.departure_window)>now),'Refusing worker run affecting non-fixture Circles');
    const auto=await fixture(2); await client.query("update travel_circle set travel_date='2020-01-01' where id=$1",[auto.id]);
    assert.equal((await new CircleLifecycleService().lockDue(now)).locked,1);
    assert.equal((await new CircleLifecycleService().lockDue(now)).locked,0);
  });
  await test('automatic and manual locks racing emit one lock event and one notification per member', async () => {
    const race=await fixture(2); await client.query("update travel_circle set travel_date='2020-01-01' where id=$1",[race.id]);
    const state=await service.status(race.users[0]);
    await service.approve(race.users[0],{snapshot:state.snapshot,approve:true});
    await Promise.all([new CircleLifecycleService().lockDue(new Date()),service.approve(race.users[1],{snapshot:state.snapshot,approve:true})]);
    assert.equal((await service.status(race.users[0])).locked,true);
    assert.equal((await client.query("select count(*)::int n from domain_outbox where aggregate_id=$1 and event_type='TravelCircleLocked'",[race.id])).rows[0].n,1);
    assert.equal((await client.query('select count(*)::int n from circle_notification where travel_circle_id=$1',[race.id])).rows[0].n,2);
  });
  console.log(`PASS: ${passed.length} Circle-lock integration groups; no outbound emails`);
} finally {
  // Only exact fixture IDs; never delete/reset pre-existing records.
  if(server&&server.exitCode===null){const stopped=once(server,'exit');server.kill();await stopped;}
  await client.query('BEGIN');
  try {
    await client.query('delete from circle_notification where travel_circle_id=ANY($1::uuid[])',[circleIds]);
    await client.query('delete from domain_outbox where aggregate_id=ANY($1::uuid[])',[[...circleIds,...planIds]]);
    await client.query('delete from circle_message where conversation_id in(select id from circle_conversation where travel_circle_id=ANY($1::uuid[]))',[circleIds]);
    await client.query('delete from circle_conversation where travel_circle_id=ANY($1::uuid[])',[circleIds]);
    await client.query('delete from circle_lock_request where travel_circle_id=ANY($1::uuid[])',[circleIds]);
    await client.query('delete from travel_circle_member where travel_circle_id=ANY($1::uuid[])',[circleIds]);
    await client.query('delete from travel_circle where id=ANY($1::uuid[])',[circleIds]);
    await client.query('delete from travel_plan where id=ANY($1::uuid[])',[planIds]);
    await client.query('delete from pcm_verification where id=ANY($1::uuid[])',[verificationIds]);
    await client.query('delete from "user" where id=ANY($1::uuid[])',[userIds]);
    await client.query('delete from orientation_camp where id=$1',[campId]);
    await client.query('delete from nysc_intake where id=$1',[intakeId]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{await client.end();if(pool)await pool.end();}
}
