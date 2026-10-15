process.env.P2_TEST_PHASE='2.2-final';
const {connect,environment,record}=await import('../p2/support.mjs');
const client=await connect(); await client.end(); Object.assign(process.env,environment());
const {NestFactory,BaseExceptionFilter}=await import('@nestjs/core');
const {Controller,Get,Post,Req,Module,Logger,UnauthorizedException,BadRequestException}=await import('@nestjs/common');
const {FastifyAdapter}=await import('@nestjs/platform-fastify');
const {inspect}=await import('node:util');
const assert=(await import('node:assert/strict')).default;
const {db,pool}=await import('../../dist/src/db/database.js');
const {sql}=await import('drizzle-orm');
const {SafeExceptionFilter,handleRequestError,safeNestLogger,errorMetadata,SafeLogController,withErrorContext}=await import('../../dist/src/common/safe-errors.js');
const {auth}=await import('../../dist/src/auth.js');
process.env.NODE_ENV="production";
const secret='P22_SYNTHETIC_PASSWORD_COOKIE_TOKEN_DOCUMENT_LOCATION_14';
let databaseError;try{await db.execute(sql`select ${secret}::integer`);}catch(error){databaseError=error;}
assert.ok(databaseError);
const captured=[];
Logger.overrideLogger({log(){},warn(){},error(...args){captured.push(inspect(args,{depth:10}));}});
const fakeReply={};new BaseExceptionFilter({isHeadersSent:()=>false,reply(){}}).catch(databaseError,{getArgByIndex:()=>fakeReply});
const reproduced=captured.some(line=>line.includes(secret));assert.ok(reproduced,'Default Nest filter must reproduce parameter leak');
const logs=[];const adapter=new FastifyAdapter({logController:new SafeLogController(),logger:{level:'info',stream:{write(line){logs.push(line);}}}});
await adapter.getInstance().register((await import('@fastify/multipart')).default,{limits:{fileSize:16}});
adapter.getInstance().addHook('onRequest',async(request,reply)=>{reply.header('x-request-id',request.id);});
const {betterAuth}=await import('better-auth');const failingAuth=betterAuth({...auth.options,database:context=>({...auth.options.database(context),findOne:async()=>{throw databaseError;}})});
class SyntheticController { framework(){throw Object.assign(new Error(secret),{statusCode:429});} async authAdapter(){return failingAuth.handler(new Request('http://localhost:4100/api/auth/sign-in/email',{method:'POST',headers:{origin:'http://localhost:3100','content-type':'application/json'},body:JSON.stringify({email:'auth-failure@p2.invalid',password:secret})}));} async upload(request){const file=await request.file();await file.toBuffer();return {ok:true};} database(){throw databaseError;} nested(){throw new Error(secret,{cause:databaseError});} authentication(){throw new UnauthorizedException(secret);} multipart(){throw new BadRequestException({message:secret,issues:[secret]});} async safety(){const {SafetyService}=await import('../../dist/src/safety/safety.service.js');return new SafetyService().submit(secret,{category:'OTHER',description:secret});} }
Controller('synthetic')(SyntheticController);
for(const key of ['database','nested','authentication','multipart','safety','authAdapter','framework'])Get(key)(SyntheticController.prototype,key,Object.getOwnPropertyDescriptor(SyntheticController.prototype,key));
Post('multipart-upload')(SyntheticController.prototype,'upload',Object.getOwnPropertyDescriptor(SyntheticController.prototype,'upload'));Req()(SyntheticController.prototype,'upload',0);
class TestModule{} Module({controllers:[SyntheticController]})(TestModule);
const app=await NestFactory.create(TestModule,adapter,{logger:safeNestLogger});app.useGlobalFilters(new SafeExceptionFilter());await app.init();await adapter.getInstance().ready();
const results=[];
for(const route of ['database','nested','authentication','multipart','safety','authAdapter','framework']){const before=logs.length;const response=await adapter.getInstance().inject({url:'/synthetic/'+route+'?token='+secret,headers:{authorization:'Bearer '+secret,cookie:'session='+secret,'x-request-id':secret}});assert.ok(response.statusCode>=400);if(route==='framework')assert.equal(response.statusCode,429);assert.ok(!response.body.includes(secret));const entries=logs.slice(before).map(line=>JSON.parse(line));const failure=entries.find(row=>row.msg==='request_failed');assert.ok(failure);assert.equal(failure.request_id,response.headers['x-request-id']);assert.equal(failure.route,'/synthetic/'+route);assert.ok(!JSON.stringify(entries).includes(secret));results.push({scenario:route,status:'passed',httpStatus:response.statusCode,requestIdCorrelated:true});}
const boundary='p22syntheticboundary';const upload=await adapter.getInstance().inject({method:'POST',url:'/synthetic/multipart-upload',headers:{'content-type':'multipart/form-data; boundary='+boundary},payload:`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${secret}.png"\r\nContent-Type: image/png\r\n\r\n${secret}\r\n--${boundary}--\r\n`});assert.equal(upload.statusCode,413);assert.ok(!upload.body.includes(secret));results.push({scenario:'actual multipart size rejection',status:'passed'});
assert.ok(!JSON.stringify(logs).includes(secret));
const saved=console.error;const workerLogs=[];console.error=(...args)=>workerLogs.push(args);
try{const {runExclusiveJob}=await import('../../dist/src/jobs/job-runner.js');await assert.rejects(runExclusiveJob('synthetic-security-test',async()=>{throw databaseError;}));}finally{console.error=saved;}
assert.ok(!JSON.stringify(workerLogs).includes(secret));assert.ok(JSON.stringify(workerLogs).includes('22P02'));
results.push({scenario:'background worker',status:'passed'});
const {spawnSync}=await import('node:child_process');
for(const mode of ['exception','rejection']){
 const code=`import {installFatalErrorHandlers} from './dist/src/common/safe-errors.js';installFatalErrorHandlers();${mode==='exception'?'setImmediate(()=>{throw new Error('+JSON.stringify(secret)+');});':'Promise.reject(new Error('+JSON.stringify(secret)+'));'}`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',windowsHide:true});
 assert.equal(child.status,1);assert.ok(!child.stderr.includes(secret));assert.ok(child.stderr.includes(mode==='exception'?'uncaught_exception':'unhandled_rejection'));results.push({scenario:'fatal '+mode,status:'passed'});
}
const transportLogs=[];new SafeLogController().streamError(databaseError,{id:'synthetic-correlation',routeOptions:{url:'/synthetic/stream'},log:{error(...args){transportLogs.push(args);}}},{statusCode:500});assert.ok(!JSON.stringify(transportLogs).includes(secret));assert.ok(JSON.stringify(transportLogs).includes('22P02'));results.push({scenario:'transport failure',status:'passed'});
await app.close();await pool.end();
record('logging-results.json',{defaultNestParameterLeakReproduced:reproduced,syntheticOnly:true,results});console.log(JSON.stringify({reproduced,passed:results.length,failed:0}));
