import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
const dirs:string[]=[];
async function service(){const dir=await mkdtemp(join(tmpdir(),'kopa-storage-'));dirs.push(dir);process.env.PRIVATE_UPLOAD_ROOT=dir;const {PrivateStorageService}=await import('./storage.service.js');return new PrivateStorageService();}
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
describe('private storage validation',()=>{
  it('accepts a genuine PNG and uses a generated key',async()=>{const s=await service();const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082','hex');const v=await s.store('11111111-1111-4111-8111-111111111111',png,'callup.png');expect(v.storageKey).toMatch(/^[0-9a-f-]+\/[0-9a-f-]+\.png$/);expect(await s.load(v.storageKey)).toEqual(png);},15000);
  it('rejects extension/content mismatch',async()=>{const s=await service();await expect(s.validate(Buffer.from('not a pdf'),'letter.pdf')).rejects.toThrow();});
  it('rejects path traversal storage keys',async()=>{const s=await service();await expect(s.load('../../secret.pdf')).rejects.toThrow();});
  it('rejects oversized files',async()=>{process.env.MAX_UPLOAD_BYTES='10';const s=await service();await expect(s.validate(Buffer.alloc(11),'letter.pdf')).rejects.toThrow();delete process.env.MAX_UPLOAD_BYTES;});
});
