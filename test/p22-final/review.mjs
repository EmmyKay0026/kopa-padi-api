import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(), evidence=resolve(root,'.p22-final-e2e');
const sha=data=>createHash('sha256').update(data).digest('hex');
const reviewed={};
for(const [name,directory,paths] of [['backend',root,['.gitignore','src','test/p2','test/p22','test/p22-final']],['frontend',resolve(root,'../kopa-padi-web'),['app','components','lib','tests','cloudflare.config.ts','package.json','package-lock.json','.nvmrc','tsconfig.json','next-env.d.ts']]]){
 const prefix=['-c','safe.directory='+directory.replaceAll('\\','/')];
 const git=(args,env=process.env)=>execFileSync('git',[...prefix,...args],{cwd:directory,env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const before=sha(git(['diff','--cached','--binary']));git(['diff','--cached','--check']);git(['diff','--check']);
 const objects=resolve(evidence,name+'-review-objects');mkdirSync(objects,{recursive:true});
 const env={...process.env,GIT_INDEX_FILE:resolve(evidence,name+'-review-index'),GIT_OBJECT_DIRECTORY:objects,GIT_ALTERNATE_OBJECT_DIRECTORIES:resolve(directory,git(['rev-parse','--git-path','objects']).trim())};
 git(['read-tree','HEAD'],env);git(['add','--',...paths],env);git(['diff','--cached','--check'],env);
 const patch=git(['diff','--cached','--binary'],env);writeFileSync(resolve(evidence,name+'-review.patch'),patch);
 const tree=git(['write-tree'],env).trim();const changed=git(['diff','--cached','--name-only'],env).trim().split('\n').filter(Boolean);
 if(before!==sha(git(['diff','--cached','--binary'])))throw new Error('Actual index changed');
 reviewed[name]={head:git(['rev-parse','HEAD']).trim(),reviewedTree:tree,patchSha256:sha(patch),realIndexUnchanged:true,stagedWhitespaceCheck:'passed',changedFiles:changed};
}
writeFileSync(resolve(evidence,'reviewed-source-trees.json'),JSON.stringify(reviewed,null,2));console.log(JSON.stringify(reviewed));
