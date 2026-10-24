import {afterEach,describe,it,expect,vi} from 'vitest';
vi.mock('../db/database.js',()=>({db:{}}));
import {mailTimeoutMs,sendZeptoMail,validQueuedEmail} from './email.service.js';
afterEach(()=>{vi.unstubAllGlobals();delete process.env.ZEPTO_MAIL_TIMEOUT_MS;delete process.env.ZEPTO_MAIL_API_KEY;});
describe('bounded private email transport',()=>{
 it('rejects malformed queued data',()=>{for(const p of [null,{}, {to:1,subject:'s',text:'s'},{to:'invalid',subject:'s',text:'s'}])expect(validQueuedEmail(p)).toBe(false)});
 it('clamps timeout configuration',()=>{process.env.ZEPTO_MAIL_TIMEOUT_MS='Infinity';expect(mailTimeoutMs()).toBe(10000);process.env.ZEPTO_MAIL_TIMEOUT_MS='999999';expect(mailTimeoutMs()).toBe(30000)});
 it.each([429,500,503])('does not expose provider body for %s',async status=>{
  process.env.ZEPTO_MAIL_API_KEY='synthetic-local-only';
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('SENTINEL_PRIVATE_PROVIDER_BODY',{status})));
  await expect(sendZeptoMail({to:'sink@p2.invalid',intent:'JOURNEY_SAFETY',subject:'Synthetic',text:'Synthetic'})).rejects.toThrow('Email provider did not accept the request');
 });
 it('passes a bounded abort signal and aborts a hung synthetic transport',async()=>{
  process.env.ZEPTO_MAIL_API_KEY='synthetic-local-only';process.env.ZEPTO_MAIL_TIMEOUT_MS='100';
  vi.stubGlobal('fetch',vi.fn((_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('Synthetic timeout'))))));
  await expect(sendZeptoMail({to:'sink@p2.invalid',intent:'JOURNEY_SAFETY',subject:'Synthetic',text:'Synthetic'})).rejects.toThrow('Synthetic timeout');
 });
});
