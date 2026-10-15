import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {connect,environment,artifacts,record,assertTarget,command} from '../p2/support.mjs';
const db=await connect(),results=[];
try{
  const {rows:[users]}=await db.query('select count(*)::int count from "user"');
  assert.equal(users.count,0,'Restore rehearsal requires cleaned seed-only disposable database');
  const url=assertTarget(environment().DATABASE_URL);
  const backup=resolve(artifacts,'seed-only-restore.dump');
  const childEnv={...process.env,PGHOST:url.hostname.replace(/^\[|\]$/g,''),PGPORT:url.port||'5432',PGDATABASE:'kopa_padi_p2_e2e',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:'disable'};
  for(const key of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS'])delete childEnv[key];
  async function pg(tool,args){
    // The guard runs immediately before each subprocess, including restore.
    const checked=await connect();await checked.end();
    await new Promise((ok,fail)=>{const child=spawn(`C:/Program Files/PostgreSQL/18/bin/${tool}.exe`,args,{env:childEnv,windowsHide:true,stdio:'ignore'});child.on('error',()=>fail(new Error(`${tool} unavailable`)));child.on('exit',code=>code===0?ok():fail(new Error(`${tool} exited ${code}; sensitive output suppressed`)));});
  }
  await db.query('begin');
  try{
    await db.query('create table public.p22_failed_migration(id integer primary key)');
    await db.query('select 1/0');
  }catch{await db.query('rollback');}
  const {rows:[absent]}=await db.query("select to_regclass('public.p22_failed_migration') as name");assert.equal(absent.name,null);
  results.push({name:'failed transactional migration leaves no partial schema',status:'passed'});
  await db.query('create table public.p22_restore_probe(id integer primary key,value text not null)');
  await db.query("insert into public.p22_restore_probe values(1,'before-migration')");
  const {rows:before}=await db.query("select (select count(*)::int from state) states,(select count(*)::int from lga) lgas,(select count(*)::int from drizzle.__drizzle_migrations) migrations");
  await pg('pg_dump',['--format=custom','--no-owner','--no-privileges','--file',backup]);
  const sha256=createHash('sha256').update(readFileSync(backup)).digest('hex');
  await pg('pg_restore',['--list',backup]);
  await db.query("alter table public.p22_restore_probe add column migrated boolean not null default true");
  await db.query("update public.p22_restore_probe set value='after-migration'");
  // Restore only to the same explicitly disposable guarded database, never a dev/prod fallback.
  try {
    // Zero-user designated disposable DB only. Rehearse the complete migration chain,
    // then restore the saved state even if migration or seed validation fails.
    const checked=await connect();await checked.end();
    await db.query('drop schema public cascade');await db.query('drop schema drizzle cascade');await db.query('create schema public');
    await command(['test/p22/run.mjs','setup']);
    assert.equal((await db.query('select count(*)::int count from drizzle.__drizzle_migrations')).rows[0].count,11);
    results.push({name:'all 11 migrations and approved seeds apply to empty disposable schemas',status:'passed'});
  } finally {
    await pg('pg_restore',['--clean','--if-exists','--no-owner','--no-privileges','--exit-on-error','--dbname','kopa_padi_p2_e2e',backup]);
  }
  const {rows:[probe]}=await db.query('select * from public.p22_restore_probe');assert.deepEqual(probe,{id:1,value:'before-migration'});
  const {rows:after}=await db.query("select (select count(*)::int from state) states,(select count(*)::int from lga) lgas,(select count(*)::int from drizzle.__drizzle_migrations) migrations");assert.deepEqual(after,before);
  results.push({name:'custom-format backup restores pre-migration schema/data and journal',status:'passed',sha256,counts:after[0]});
  await db.query('drop table public.p22_restore_probe');
}catch(error){results.push({name:'disposable backup and rollback rehearsal',status:'failed',reason:String(error.message).split('\n')[0]});process.exitCode=1;}
finally{record('restore-results.json',{results});for(const r of results)console.log(`${r.status.toUpperCase()} ${r.name}`);await db.end();}
