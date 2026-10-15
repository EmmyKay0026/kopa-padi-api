import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createEmailVerificationToken } from 'better-auth/api';
import { apiOrigin, webOrigin, environment, connect, passwordFor, readState, record } from '../p2/support.mjs';
const db=await connect(), state=readState(), results=[];
let serial=60;
class Client {
  constructor(name){this.name=name;this.cookie='';this.ip=`127.0.0.${++serial}`;}
  async call(method,path,body,expected=200,extra={}) {
    const response=await fetch(apiOrigin+'/api'+path,{method,redirect:'manual',headers:{origin:webOrigin,'x-forwarded-for':this.ip,...(this.cookie?{cookie:this.cookie}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    const cookies=response.headers.getSetCookie();for(const c of cookies)if(c.startsWith('better-auth.session_token='))this.cookie=c.split(';')[0];
    let data;try{data=await response.json();}catch{}
    assert.ok((Array.isArray(expected)?expected:[expected]).includes(response.status),`${method} ${path.split('?')[0].replace(/reset-password\/.*/, 'reset-password/[token]')}: expected ${expected}, got ${response.status}`);
    return {data,headers:response.headers,cookies,status:response.status};
  }
  async login(){return this.call('POST','/auth/sign-in/email',{email:`${this.name}@p2.invalid`,password:passwordFor(this.name)});}
}
async function test(name,fn){try{await fn();results.push({name,status:'passed'});console.log('PASS '+name);}catch(e){results.push({name,status:'failed',reason:String(e.message).split('\n')[0]});console.log('FAIL '+name+': '+String(e.message).split('\n')[0]);}}
const admin=new Client('admin'), bob=new Client('bob');
try{
  await admin.login();const login=await bob.login();
  await test('session cookies are HttpOnly, Lax and root-scoped in local test mode',async()=>{
    const session=login.cookies.find(c=>c.startsWith('better-auth.session_token='));assert.ok(session);assert.match(session,/HttpOnly/i);assert.match(session,/SameSite=Lax/i);assert.match(session,/Path=\//i);
  });
  await test('HTTPS authentication emits Secure HttpOnly cookies',async()=>{
    const {betterAuth}=await import('better-auth');const {auth}=await import('../../dist/src/auth.js');
    const secure=betterAuth({...auth.options,baseURL:'https://api.staging.invalid',trustedOrigins:['https://app.staging.invalid'],advanced:{...auth.options.advanced,useSecureCookies:true}});
    const response=await secure.handler(new Request('https://api.staging.invalid/api/auth/sign-in/email',{method:'POST',headers:{origin:'https://app.staging.invalid','content-type':'application/json'},body:JSON.stringify({email:'bob@p2.invalid',password:passwordFor('bob')})}));
    assert.equal(response.status,200);const cookie=response.headers.getSetCookie().find(c=>c.startsWith('__Secure-better-auth.session_token='));assert.ok(cookie);assert.match(cookie,/; Secure/i);assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=Lax/i);
  });
  await test('foreign Origin cannot perform authenticated application writes',async()=>{
    await bob.call('PUT','/me/profile',{firstName:'Synthetic',lastNamePrivate:'bob',displayName:'CSRF probe'},403,{origin:'https://hostile.invalid'});
    assert.notEqual((await bob.call('GET','/me/profile')).data.profile?.displayName,'CSRF probe');
  });
  await test('cross-site opaque Origin writes are refused',async()=>{
    await bob.call('PUT','/me/profile',{firstName:'Synthetic',lastNamePrivate:'bob',displayName:'CSRF opaque probe'},403,{origin:'null','sec-fetch-site':'cross-site'});
  });
  await test('auth hostile callback and origin are rejected',async()=>{
    await bob.call('POST','/auth/request-password-reset',{email:'bob@p2.invalid',redirectTo:'https://hostile.invalid/reset'},403);
    await bob.call('POST','/auth/sign-in/email',{email:'bob@p2.invalid',password:passwordFor('bob')},403,{origin:'https://hostile.invalid'});
  });
  await test('admin capability revocation and role demotion affect an existing session immediately',async()=>{
    const id=state.accounts.admin.id;
    await admin.call('GET','/admin/verifications');
    const {rows:[doc]}=await db.query('select id,verification_id from verification_document limit 1');
    await db.query("delete from admin_capability_grant where admin_user_id=$1 and capability='verification.review'",[id]);
    try{await admin.call('GET',`/admin/verifications/${doc.verification_id}/documents/${doc.id}`,undefined,403);}finally{await db.query("insert into admin_capability_grant(admin_user_id,capability,granted_by) values($1,'verification.review',$1) on conflict do nothing",[id]);}
    await db.query("update \"user\" set role='USER' where id=$1",[id]);
    try{await admin.call('GET','/admin/verifications',undefined,403);}finally{await db.query("update \"user\" set role='ADMIN' where id=$1",[id]);}
  });
  await test('suspended account loses ordinary access using its existing session',async()=>{
    await db.query("update \"user\" set account_status='SUSPENDED' where id=$1",[state.accounts.bob.id]);
    try{await bob.call('GET','/me',undefined,403);}finally{await db.query("update \"user\" set account_status='ACTIVE' where id=$1",[state.accounts.bob.id]);}
  });
  await test('email verification expiry, tamper and server-owned roles',async()=>{
    const {rows:[count]}=await db.query("select count(*)::int count from \"user\" where email like 'p22-expiry%@p2.invalid'");
    const user=new Client('p22-expiry-'+count.count), email=user.name+'@p2.invalid';
    await user.call('POST','/auth/sign-up/email',{name:'Synthetic expiry',email,password:passwordFor(user.name),role:'ADMIN',accountStatus:'ACTIVE'});
    const {rows:[row]}=await db.query('select id,role,email_verified from "user" where email=$1',[email]);assert.equal(row.role,'USER');assert.equal(row.email_verified,false);
    await user.call('POST','/auth/sign-in/email',{email,password:passwordFor(user.name)},403);
    const expired=await createEmailVerificationToken(environment().BETTER_AUTH_SECRET,email,undefined,-60);
    const response=await user.call('GET','/auth/verify-email?token='+encodeURIComponent(expired),undefined,[400,401,302]);
    if(response.status===302)assert.match(response.headers.get('location'),/error=/);
    const {rows:[unchanged]}=await db.query('select email_verified from "user" where id=$1',[row.id]);assert.equal(unchanged.email_verified,false);
    await user.call('GET','/auth/verify-email?token='+encodeURIComponent(expired.slice(0,-5)+'tampr'),undefined,[400,401,302]);
    const {rows:[outbox]}=await db.query("select payload from notification_outbox where user_id=$1 and type='ACCOUNT_VERIFICATION' order by created_at desc limit 1",[row.id]);
    const url=new URL(outbox.payload.actionUrl);assert.equal(url.origin,apiOrigin);const positive=await fetch(url,{redirect:'manual',headers:{'x-forwarded-for':user.ip}});assert.equal(positive.status,302);
    await user.login();
  });
  await test('password-reset expiry, replay denial and session revocation',async()=>{
    const user=new Client('outsider');
    // Repetition may follow a prior successful reset in this disposable fixture.
    try{await user.login();}catch{await user.call('POST','/auth/sign-in/email',{email:'outsider@p2.invalid',password:passwordFor('reset-after')});}
    async function token(){await user.call('POST','/auth/request-password-reset',{email:'outsider@p2.invalid',redirectTo:webOrigin+'/reset-password'});for(let i=0;i<50;i++){const {rows:[row]}=await db.query("select payload from notification_outbox where user_id=$1 and type='PASSWORD_RESET' order by created_at desc limit 1",[state.accounts.outsider.id]);if(row){const url=new URL(row.payload.actionUrl);assert.equal(url.origin,apiOrigin);return url.pathname.split('/').pop();}await new Promise(r=>setTimeout(r,50));}throw new Error('No local reset intent');}
    const expired=await token();await db.query("update verification set expires_at=now()-interval '1 minute' where identifier=$1",['reset-password:'+expired]);
    await user.call('POST','/auth/reset-password',{token:expired,newPassword:passwordFor('reset-after')},400);
    await db.query("delete from notification_outbox where user_id=$1 and type='PASSWORD_RESET'",[state.accounts.outsider.id]);
    const valid=await token();const oldCookie=user.cookie;
    await user.call('POST','/auth/reset-password',{token:valid,newPassword:passwordFor('reset-after')});
    user.cookie=oldCookie;await user.call('GET','/me',undefined,401);
    await user.call('POST','/auth/reset-password',{token:valid,newPassword:passwordFor('reset-after')},400);
    await user.call('POST','/auth/sign-in/email',{email:'outsider@p2.invalid',password:passwordFor('outsider')},401);
    await user.call('POST','/auth/sign-in/email',{email:'outsider@p2.invalid',password:passwordFor('reset-after')});
  });
  await test('expired precise locations remain stored but are never returned to public shares',async()=>{
    // No deletion policy has been approved: access expiry and physical retention are distinct.
    await db.query("update journey_location_share set expires_at=now()-interval '1 minute'");
    const {rows:[row]}=await db.query("select count(*)::int count from journey_location_share where expires_at<now()");assert.ok(row.count>0);
    const {JourneyService}=await import('../../dist/src/journeys/journey.service.js');
    const service=new JourneyService({resolve:async()=>({})});
    const id=state.accounts.alice.id;
    // Finished Journeys retain the record; create a controlled active share through the service.
    const {rows:[contact]}=await db.query('select id from trusted_contact where user_id=$1 limit 1',[id]);
    const {rows:[journey]}=await db.query('select id from journey where user_id=$1 order by created_at desc limit 1',[id]);
    const token=randomBytes(32).toString('hex');
    await db.query("update journey_share set status='REVOKED' where journey_id=$1 and trusted_contact_id=$2",[journey.id,contact.id]);
    await db.query("insert into journey_share(journey_id,trusted_contact_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 hour')",[journey.id,contact.id,createHash('sha256').update(token).digest('hex')]);
    const data=await service.publicShare(token);assert.equal(data.currentLocation,null);
    await db.query("update journey_share set expires_at=now()-interval '1 minute' where trusted_contact_id=$1",[contact.id]);
    await assert.rejects(service.publicShare(token));
  });
}finally{
  record('security-results.json',{results});await db.end();
  const {pool}=await import('../../dist/src/db/database.js');await pool.end();
  if(results.some(r=>r.status==='failed'))process.exitCode=1;
}
