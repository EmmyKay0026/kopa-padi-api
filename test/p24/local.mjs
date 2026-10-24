// All commands are refused until the unchanged P2 URL AND live identity guards pass.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {parse} from 'dotenv';
import {root,assertTarget,connect,environment} from '../p2/support.mjs';
try {
  const local=parse(readFileSync(resolve(root,'../../kopa-padi-api/.env')));
  assertTarget(local.DATABASE_URL);
  process.env.P2_E2E_DATABASE_URL=local.DATABASE_URL;
  process.env.P2_TEST_PHASE='2.2-final';
  const connection=await connect(); await connection.end();
  Object.assign(process.env,environment());
  // Integration fixtures must never fall through to an operator's SMTP relay.
  process.env.SMTP_FALLBACK_ENABLED='false';
  const args=process.argv.slice(2);
  if(!args.length) {console.log('P2.4 configured target and actual loopback database identity: PASS');process.exit(0);}
  const child=spawn(process.execPath,args,{cwd:root,env:process.env,windowsHide:true,stdio:'inherit'});
  child.on('exit',code=>{process.exitCode=code??1});
  child.on('error',()=>{console.error('Guarded child failed to start');process.exitCode=1});
} catch {console.error('P2.4 isolation preflight FAILED; no writes authorized');process.exitCode=1;}
