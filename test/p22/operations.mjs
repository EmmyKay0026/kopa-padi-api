import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect,command,record,readState,apiOrigin,webOrigin,passwordFor} from '../p2/support.mjs';
const db=await connect(),state=readState(),results=[];
async function test(name,fn){try{await fn();results.push({name,status:'passed'});console.log('PASS '+name);}catch(error){results.push({name,status:'failed',reason:String(error.message).split('\n')[0]});console.log('FAIL '+name+': '+String(error.message).split('\n')[0]);}}
async function client(name){const response=await fetch(apiOrigin+'/api/auth/sign-in/email',{method:'POST',headers:{origin:webOrigin,'content-type':'application/json','x-forwarded-for':'127.0.0.150'},body:JSON.stringify({email:name+'@p2.invalid',password:passwordFor(name)})});assert.equal(response.status,200);const cookie=response.headers.getSetCookie().find(c=>c.startsWith('better-auth.session_token=')).split(';')[0];return async(method,path,body)=>{const r=await fetch(apiOrigin+'/api'+path,{method,headers:{origin:webOrigin,cookie,'content-type':'application/json','x-forwarded-for':'127.0.0.150'},...(body!==undefined?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,`${method} ${path}: ${r.status}`);return r.json();};}
async function job(name){await command(['--import','tsx','src/jobs/'+name+'.ts']);}
try{
  await test('actual plan-expiry and offer-expiry jobs are repeatable',async()=>{
    const id=state.accounts['fixed-a'].planId;
    await db.query("update travel_plan set expires_at=now()-interval '1 minute' where id=$1",[id]);
    await job('expire-travel-plans');await job('expire-travel-plans');
    assert.equal((await db.query('select status from travel_plan where id=$1',[id])).rows[0].status,'EXPIRED');
    const {rows:[template]}=await db.query("select id from match_offer order by (status='PENDING') desc limit 1");assert.ok(template);
    const offerId=template.id;await db.query("update match_offer set status='PENDING',expires_at=now()-interval '1 minute',responded_at=null where id=$1",[offerId]);
    await job('expire-match-offers');await job('expire-match-offers');
    assert.equal((await db.query('select status from match_offer where id=$1',[offerId])).rows[0].status,'EXPIRED');
  });
  await test('actual restriction expiry reconciles account access',async()=>{
    const admin=await client('admin');const restriction=await admin('POST',`/admin/safety/users/${state.accounts.outsider.id}/restrictions`,{restrictionType:'MATCHING_DISABLED',reasonCode:'P22_EXPIRY',expiresAt:new Date(Date.now()+3600000).toISOString()});
    const {rows:[cancelled]}=await db.query('select status,cancelled_at from travel_plan where id=$1',[state.accounts.outsider.planId]);assert.equal(cancelled.status,'CANCELLED');assert.ok(cancelled.cancelled_at);
    await db.query("update account_restriction set expires_at=now()-interval '1 minute' where id=$1",[restriction.id]);
    await job('expire-restrictions');await job('expire-restrictions');
    assert.equal((await db.query('select status from account_restriction where id=$1',[restriction.id])).rows[0].status,'EXPIRED');
    assert.equal((await db.query('select account_status from "user" where id=$1',[state.accounts.outsider.id])).rows[0].account_status,'ACTIVE');
  });
  await test('actual reminder worker deduplicates overdue check-ins without declaring emergency',async()=>{
    const user=await client('solo');let current=await user('GET','/journeys/current');
    if(current.journey.status==='PREPARING'){
      for(const item of current.checklist)await user('PATCH','/journeys/current/checklist/'+item.itemKey,{completed:true});
      await user('POST','/journeys/current/ready');await user('POST','/journeys/current/start');
    }
    await db.query("update journey set started_at=now()-interval '3 hours',last_check_in_at=now()-interval '3 hours' where id=$1",[current.journey.id]);
    await job('process-journey-reminders');await job('process-journey-reminders');
    const {rows:[count]}=await db.query('select count(*)::int count from journey_reminder where journey_id=$1',[current.journey.id]);assert.equal(count.count,1);
    current=await user('GET','/journeys/current');assert.equal(current.journey.status,'IN_PROGRESS');
  });
}finally{record('operations-results.json',{results});await db.end();const {pool}=await import('../../dist/src/db/database.js');await pool.end();if(results.some(r=>r.status==='failed'))process.exitCode=1;}
