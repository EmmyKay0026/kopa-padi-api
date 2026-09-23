import { describe,expect,it } from 'vitest'; import { gunzipSync } from 'node:zlib'; import { readFile } from 'node:fs/promises';
async function data(){const encoded=await readFile(new URL('../../data/nigeria-admin.snapshot.b64',import.meta.url),'utf8');return JSON.parse(gunzipSync(Buffer.from(encoded.trim(),'base64')).toString('utf8')) as {states:Array<{id:string;n:string}>;lgas:Array<{id:string;p:string;n:string;s:string}>;license:string;updated:string}}
describe('canonical geography snapshot',()=>{
  it('contains 37 State/FCT and 774 unique LGAs',async()=>{const x=await data();expect(x.states).toHaveLength(37);expect(x.lgas).toHaveLength(774);expect(new Set(x.states.map(s=>s.id)).size).toBe(37);expect(new Set(x.lgas.map(l=>l.id)).size).toBe(774)});
  it('links every LGA to a canonical State',async()=>{const x=await data();const stateIds=new Set(x.states.map(s=>s.id));expect(x.lgas.every(l=>stateIds.has(l.p))).toBe(true)});
  it('has no duplicate State/LGA name pair or slug',async()=>{const x=await data();expect(new Set(x.lgas.map(l=>`${l.p}:${l.n}`)).size).toBe(774);expect(new Set(x.lgas.map(l=>l.s)).size).toBe(774)});
  it('retains source license and review date',async()=>{const x=await data();expect(x.license).toBe('CC-BY-4.0');expect(x.updated).toBe('2026-06-01')});
});
