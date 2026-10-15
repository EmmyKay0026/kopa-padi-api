import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {connect,record} from '../p2/support.mjs';
import 'reflect-metadata';
const db=await connect();
const {db:orm,pool}=await import('../../dist/src/db/database.js');
const schema=await import('../../dist/src/db/schema.js');
const {MatchingService}=await import('../../dist/src/matching/matching.service.js');
const {GeographyService}=await import('../../dist/src/geography/geography.service.js');
const {processMatchingOutbox}=await import('../../dist/src/matching/matching.worker.js');
const {runExclusiveJob}=await import('../../dist/src/jobs/job-runner.js');
const matching=new MatchingService(new GeographyService()),results=[];
const {rows:[camp]}=await db.query('select id from orientation_camp order by id limit 1');
const {rows:[intake]}=await db.query('select id from nysc_intake order by id limit 1');
const {rows:[reviewer]}=await db.query("select id from \"user\" where email='admin@p2.invalid'");
let testYear=2098;
while((await db.query('select count(*)::int count from travel_circle where travel_date=$1',[`${testYear}-05-14`])).rows[0].count) testYear--;
async function fixture(date,flex=0){const userId=randomUUID(),verificationId=randomUUID(),id=randomUUID();
  date=date.replace('2098',String(testYear));
  await orm.insert(schema.users).values({id:userId,name:'Synthetic P22 concurrent',email:`p22-${userId}@p2.invalid`,emailVerified:true});
  await orm.insert(schema.pcmVerifications).values({id:verificationId,userId,nyscIntakeId:intake.id,orientationCampId:camp.id,status:'VERIFIED',submittedAt:new Date(),reviewedAt:new Date(),verifiedAt:new Date(),reviewedBy:reviewer.id});
  await orm.insert(schema.travelPlans).values({id,userId,pcmVerificationId:verificationId,originStateId:'NG017',originLgaId:'NG017025',destinationCampId:camp.id,intendedTravelDate:date,dateFlexibilityDays:flex,departureWindow:'MORNING',transportMode:'COMMERCIAL_BUS',transportFlexible:false,nearbyMatchingEnabled:false,groupPreference:'ANY_VERIFIED_PCM',status:'SEARCHING',expiresAt:new Date('2099-12-31')});return id;
}
async function test(name,fn){try{await fn();results.push({name,status:'passed'});console.log('PASS '+name);}catch(e){results.push({name,status:'failed',reason:String(e.message).split('\n')[0]});console.log('FAIL '+name+': '+String(e.message).split('\n')[0]);}}
async function invariants(){const {rows:[r]}=await db.query("select (select count(*)::int from travel_circle where member_count>max_members) overflow,(select count(*)::int from (select user_id from travel_circle_member where membership_status in ('JOINED','CONFIRMED') group by user_id having count(*)>1) x) duplicates,(select count(*)::int from travel_circle c where c.member_count<>(select count(*) from travel_circle_member m where m.travel_circle_id=c.id and m.membership_status in ('JOINED','CONFIRMED')) and c.status<>'DISSOLVED') count_mismatch");assert.deepEqual(r,{overflow:0,duplicates:0,count_mismatch:0});}
try{
  await test('capacity saturation: 20 simultaneous plans form 6+6+6+2; duplicate processing is safe',async()=>{
    const ids=[];for(let i=0;i<20;i++)ids.push(await fixture('2098-05-14'));
    await Promise.all(ids.map(id=>matching.processPlan(id)));
    let {rows}=await db.query('select member_count from travel_circle where travel_date=$1 order by member_count desc',[`${testYear}-05-14`]);assert.deepEqual(rows.map(r=>r.member_count),[6,6,6,2]);
    await Promise.all(ids.flatMap(id=>[matching.processPlan(id),matching.processPlan(id)]));
    const next=await fixture('2098-05-14');await Promise.all([matching.processPlan(next),matching.processPlan(next)]);
    ({rows}=await db.query('select member_count from travel_circle where travel_date=$1 order by member_count desc',[`${testYear}-05-14`]));assert.deepEqual(rows.map(r=>r.member_count),[6,6,6,3]);await invariants();
  });
  await test('different preferred dates race across locks without duplicate membership',async()=>{
    const ids=[];for(let i=0;i<8;i++)ids.push(await fixture(i%2?'2098-06-15':'2098-06-14',1));
    const settled=await Promise.allSettled(ids.map(id=>matching.processPlan(id)));
    for(const item of settled)if(item.status==='rejected')throw item.reason;
    await invariants();
  });
  await test('duplicate outbox consumers claim each row once',async()=>{
    const ids=[];for(let i=0;i<4;i++){const id=await fixture('2098-07-14');ids.push(id);await orm.insert(schema.domainOutbox).values({aggregateType:'TRAVEL_PLAN',aggregateId:id,eventType:'TravelPlanCreated',payload:{travelPlanId:id}});}
    let release,entered;const gate=new Promise(r=>release=r),claimed=new Promise(r=>entered=r);let calls=0;
    const first=processMatchingOutbox({processBatch:async batch=>{calls++;entered();await gate;return matching.processBatch(batch);}},100);
    await claimed;
    try{assert.equal(await processMatchingOutbox(matching,100),0);}finally{release();}
    await first;assert.equal(calls,1);await invariants();
  });
  await test('cron overlap lock and abandoned worker lease recover',async()=>{
    let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);
    const first=runExclusiveJob('p22-overlap',async()=>{entered();await gate;return 1;});await ready;
    try{assert.equal((await runExclusiveJob('p22-overlap',async()=>2)).status,'skipped_overlap');}finally{release();}await first;
    assert.equal((await runExclusiveJob('p22-overlap',async()=>3)).status,'completed');
    const id=await fixture('2098-08-14');await fixture('2098-08-14');
    const [event]=await orm.insert(schema.domainOutbox).values({aggregateType:'TRAVEL_PLAN',aggregateId:id,eventType:'TravelPlanCreated',payload:{travelPlanId:id},attempts:1,availableAt:new Date(Date.now()+300000)}).returning();
    assert.equal(await processMatchingOutbox(matching),0);
    await db.query("update domain_outbox set available_at=now()-interval '1 second' where id=$1",[event.id]);assert.equal(await processMatchingOutbox(matching),1);await invariants();
  });
  await test('terminated worker releases PostgreSQL job lock for a fresh process',async()=>{
    const child=spawn(process.execPath,['test/p22/crash-worker.mjs'],{cwd:new URL('../../',import.meta.url),env:process.env,windowsHide:true,stdio:['ignore','pipe','ignore']});
    const exited=new Promise(resolve=>child.once('exit',resolve));
    try{
      await new Promise((resolve,reject)=>{let text='';const timeout=setTimeout(()=>reject(new Error('Worker did not acquire lock')),20000);child.stdout.on('data',chunk=>{text+=chunk.toString();if(text.includes('P22_LOCK_HELD')){clearTimeout(timeout);resolve();}});child.once('error',()=>{clearTimeout(timeout);reject(new Error('Worker did not start'));});});
      assert.equal((await runExclusiveJob('p22-crash',async()=>0)).status,'skipped_overlap');
    }finally{child.kill();await exited;}
    assert.equal((await runExclusiveJob('p22-crash',async()=>1)).status,'completed');
  });
}finally{record('concurrency-results.json',{results});await db.end();await pool.end();if(results.some(r=>r.status==='failed'))process.exitCode=1;}
