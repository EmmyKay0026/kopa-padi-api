import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn} from 'node:child_process';
const dir=await mkdtemp(join(tmpdir(),'p24-startup-'));
try{
 await writeFile(join(dir,'app.js'),await readFile(new URL('../../app.js',import.meta.url)));
 await mkdir(join(dir,'dist/src'),{recursive:true});await writeFile(join(dir,'package.json'),'{"type":"module"}');
 await writeFile(join(dir,'dist/src/main.js'),"throw new Error('SYNTHETIC_STARTUP_SENTINEL', {cause:new Error('SYNTHETIC_NESTED_SENTINEL')});");
 let output='';const child=spawn(process.execPath,['app.js'],{cwd:dir,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);const code=await new Promise(r=>child.on('exit',r));
 assert.equal(code,1);assert.ok(!output.includes('SYNTHETIC_'));const diagnostic=JSON.parse(output.trim());assert.equal(diagnostic.event_type,'api_startup_failed');console.log('PASS safe fatal startup boundary with nested synthetic errors');
}finally{await rm(dir,{recursive:true,force:true});}

// A direct compiled entrypoint must also sanitize import-time DB configuration.
const invalid=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../../',import.meta.url),env:{...process.env,DATABASE_URL:'postgresql://SYNTHETIC_STARTUP_SENTINEL:SYNTHETIC_STARTUP_SENTINEL@localhost:5432/kopa_padi_p2_e2e?sslmode=disable'},windowsHide:true,stdio:['ignore','pipe','pipe']});
let early='';invalid.stdout.on('data',x=>early+=x);invalid.stderr.on('data',x=>early+=x);const earlyCode=await new Promise(r=>invalid.once('exit',r));assert.equal(earlyCode,1);assert.ok(!early.includes('SYNTHETIC_STARTUP_SENTINEL'));assert.ok(!early.includes(' at '));assert.equal(JSON.parse(early.trim()).event_type,'database_startup_failed');console.log('PASS safe direct-entry import-time database failure');
