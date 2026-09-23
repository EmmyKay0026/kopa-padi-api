import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileTypeFromBuffer } from 'file-type';

const allowed = new Map([['application/pdf', '.pdf'], ['image/jpeg', '.jpg'], ['image/png', '.png']]);
@Injectable()
export class PrivateStorageService {
  private readonly root = resolve(process.env.PRIVATE_UPLOAD_ROOT ?? './private/verification');
  private readonly maxBytes = Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024);

  async validate(buffer: Buffer, originalName: string) {
    if (!buffer.length || buffer.length > this.maxBytes) throw new BadRequestException(`File must be between 1 and ${this.maxBytes} bytes`);
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !allowed.has(detected.mime)) throw new BadRequestException('Only genuine PDF, JPEG, or PNG files are accepted');
    const suppliedExtension = extname(originalName).toLowerCase();
    const compatible = detected.mime === 'image/jpeg' ? ['.jpg', '.jpeg'] : [allowed.get(detected.mime)!];
    if (!compatible.includes(suppliedExtension)) throw new BadRequestException('Filename extension does not match file contents');
    return { mimeType: detected.mime, extension: allowed.get(detected.mime)!, safeOriginalName: originalName.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) };
  }
  async store(verificationId: string, buffer: Buffer, originalName: string) {
    const checked = await this.validate(buffer, originalName);
    const key = `${verificationId}/${randomUUID()}${checked.extension}`;
    const path = this.resolveKey(key);
    await mkdir(resolve(path, '..'), { recursive: true });
    const handle = await open(path, 'wx', 0o600);
    try { await handle.writeFile(buffer); } finally { await handle.close(); }
    return { storageKey: key, originalName: checked.safeOriginalName, mimeType: checked.mimeType, sizeBytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') };
  }
  async load(key: string) {
    try { return await readFile(this.resolveKey(key)); } catch { throw new NotFoundException('Document not found'); }
  }
  async remove(key: string) { await unlink(this.resolveKey(key)).catch(() => undefined); }
  private resolveKey(key: string) {
    if (!/^[0-9a-f-]+\/[0-9a-f-]+\.(pdf|jpg|png)$/.test(key)) throw new BadRequestException('Invalid storage key');
    const target = resolve(this.root, key);
    if (!target.startsWith(`${this.root}${sep}`)) throw new BadRequestException('Invalid storage key');
    return target;
  }
}
