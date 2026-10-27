import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { db, pool } from './database.js';
import { states, stateGuides } from './schema.js';
import { stateGuideWriteSchema } from '../state-guides/state-guide.schemas.js';
import { StateGuideService } from '../state-guides/state-guide.service.js';
import { safeDiagnostic } from '../common/safe-errors.js';

async function main() {
  const path = resolve(process.argv[2] ?? 'data/state-guide-content.json');
  const data = JSON.parse(await readFile(path, 'utf8'));
  const canonical = await db.select().from(states);
  const normalize = (name: string) => /^(fct|fct abuja|abuja fct)$/i.test(name.trim()) ? 'federalcapitalterritory' : name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const records: Record<string, unknown> = Array.isArray(data) ? Object.fromEntries(data.map(row => {
    const state = canonical.find(entry => normalize(entry.name) === normalize(row.state));
    if (!state) throw new Error(`Unknown state: ${row.state}`);
    return [state.id, { secretariat: row.stateSecretariat, information: row.stateInformation, research: row.stateInformationResearch,
      photos: (row.photo ?? []).map((photo: { src: string; alt: string; caption: string }) => ({ ...photo, illustrative: /placeholder|illustrative|sample|temporary/i.test(`${photo.alt} ${photo.caption}`) || new URL(photo.src).hostname === 'picsum.photos' })), expectations: row.expectations ?? [] }];
  })) : data.states;
  const canonicalIds = new Set(canonical.map(state => state.id));
  const validated = Object.entries(records).map(([stateId, value]) => {
    if (!canonicalIds.has(stateId)) throw new Error(`Unknown state ID: ${stateId}`);
    const result = stateGuideWriteSchema.safeParse({ ...(value as object), version: 0 });
    if (!result.success) throw new Error(`Invalid guide ${stateId}: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
    return { stateId, input: result.data };
  });
  const existing = new Set((await db.select({ stateId: stateGuides.stateId }).from(stateGuides)).map(guide => guide.stateId));
  const service = new StateGuideService();
  let imported = 0;
  for (const record of validated) {
    if (existing.has(record.stateId)) continue;
    await service.save(record.stateId, record.input, null);
    imported++;
  }
  console.log(`Imported ${imported} guides; preserved ${validated.length - imported} existing guides. States and LGAs were not changed.`);
}

main().catch(error => { console.error(JSON.stringify(safeDiagnostic('state_guide_import_failed', error))); process.exitCode = 1; }).finally(() => pool.end());
