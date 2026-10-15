process.env.P2_TEST_PHASE='2.2-final';
const {root,artifacts,record}=await import('../p2/support.mjs');
const {execFileSync}=await import('node:child_process');
const {readFileSync}=await import('node:fs');
const {resolve}=await import('node:path');
const {createHash}=await import('node:crypto');
const sha=data=>createHash('sha256').update(data).digest('hex');
function repository(directory,paths){
  const safe=directory.replaceAll('\\','/').replace(/\/$/,'');
  const git=args=>execFileSync('git',['-c','safe.directory='+safe,...args],{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','ignore']});
  const files=[...new Set(git(['ls-files','--cached','--others','--exclude-standard','-z','--',...paths]).split('\0').filter(Boolean))].sort();
  return {head:git(['rev-parse','HEAD']).trim(),trackedDiffSha256:sha(git(['diff','--no-ext-diff'])),files:files.map(path=>({path,sha256:sha(readFileSync(resolve(directory,path)))}))};
}
const repositories={backend:repository(root,['src','test/p2','test/p22','test/p22-final','drizzle','package.json','package-lock.json','tsconfig.json','tsconfig.build.json','drizzle.config.ts','.gitignore']),frontend:repository(resolve(root,'../kopa-padi-web'),['app','components','lib','tests','cloudflare.config.ts','vite.config.ts','next.config.ts','package.json','package-lock.json','tsconfig.json','next-env.d.ts','.nvmrc'])};
const sourceDigest=sha(JSON.stringify(repositories));
record('tested-source.json',{node:process.version,repositories,sourceDigest});
const groups=['results.json','security-results.json','concurrency-results.json','operations-results.json','restore-results.json','logging-results.json'].map(file=>{const data=JSON.parse(readFileSync(resolve(artifacts,file),'utf8'));return {file,passed:data.results.filter(r=>r.status==='passed').length,failed:data.results.filter(r=>r.status==='failed').length};});
record('summary.json',{groups,passed:groups.reduce((sum,g)=>sum+g.passed,0),failed:groups.reduce((sum,g)=>sum+g.failed,0),sourceDigest});
console.log(JSON.stringify({groups,sourceDigest}));
