process.env.P2_TEST_PHASE='2.2-final';
const {connect,record,artifacts}=await import('../p2/support.mjs');
const client=await connect();await client.end();
const {spawnSync}=await import('node:child_process');
const {readFileSync}=await import('node:fs');
const results=[];
let ready=false;for(let i=0;i<60;i++){try{const response=await fetch('http://localhost:4100/api/health/ready');if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}if(!ready)throw new Error('Isolated API readiness failed');
for(const mode of ['http','security','concurrency','operations']){
 const startedAt=new Date().toISOString();
 const child=spawnSync(process.execPath,['test/p22/run.mjs',mode],{env:process.env,windowsHide:true,stdio:'inherit'});
 results.push({mode,startedAt,finishedAt:new Date().toISOString(),exitCode:child.status});record('sequential-run.json',{results});
 if(child.status!==0)process.exit(child.status??1);
}
console.log(JSON.stringify({sequentialSuites:'passed',count:results.length}));
