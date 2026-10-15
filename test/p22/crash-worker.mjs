process.env.P2_TEST_PHASE ||= '2.2';
const {connect,environment}=await import('../p2/support.mjs');
const checked=await connect();await checked.end();Object.assign(process.env,environment());
const {runExclusiveJob}=await import('../../dist/src/jobs/job-runner.js');
await runExclusiveJob('p22-crash',async()=>{process.stdout.write('P22_LOCK_HELD\n');await new Promise(()=>{});});
