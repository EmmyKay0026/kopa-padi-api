import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { db, pool } from './database.js';
import { lgas, orientationCamps, states } from './schema.js';

type CampSource = {
  state: string;
  stateCode: string;
  campType: 'permanent' | 'temporary' | null;
  locality: string;
  lga: string;
  address: string;
  latitude: number;
  longitude: number;
  image?: string | null;
  googleMapsUrl?: string | null;
};

const normalize = (value: string) => value
  .toLowerCase()
  .replace(/\b(local government area|local government council|metropolitan council|area council|lga)\b/g, '')
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]/g, '');

const lgaAliases: Record<string, string> = {
  sagamu: 'shagamu',
  wamakko: 'wamako',
};

const stateAliases: Record<string, string> = {
  fctabuja: 'federalcapitalterritory',
  abujafct: 'federalcapitalterritory',
  fct: 'federalcapitalterritory',
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sourceUrl = new URL('../../nysc_orientation_camps_enriched.json', import.meta.url);
  const source = JSON.parse(await readFile(sourceUrl, 'utf8')) as CampSource[];
  if (source.length !== 37) throw new Error(`Expected 37 camps, received ${source.length}`);

  const [stateRows, lgaRows, existing] = await Promise.all([
    db.select().from(states),
    db.select().from(lgas),
    db.select().from(orientationCamps),
  ]);
  const stateByName = new Map(stateRows.map((state) => [normalize(state.name), state]));
  const lgasByState = new Map<string, typeof lgaRows>();
  for (const lga of lgaRows) {
    const rows = lgasByState.get(lga.stateId) ?? [];
    rows.push(lga);
    lgasByState.set(lga.stateId, rows);
  }

  const resolved = source.map((item) => {
    const stateKey = stateAliases[normalize(item.state)] ?? normalize(item.state);
    const state = stateByName.get(stateKey);
    if (!state) throw new Error(`State not found: ${item.state}`);
    const lga = (lgasByState.get(state.id) ?? []).find((row) => normalize(row.name) === (lgaAliases[normalize(item.lga)] ?? normalize(item.lga)));
    if (!lga) throw new Error(`LGA not found in ${state.name}: ${item.lga}`);
    const prefix = item.campType === 'temporary' ? 'NYSC Temporary Orientation Camp' : item.campType === 'permanent' ? 'NYSC Permanent Orientation Camp' : 'NYSC Orientation Camp';
    return {
      source: item,
      state,
      lga,
      values: {
        stateName: state.name,
        campName: `${prefix}, ${item.locality}`,
        officialAddress: item.address,
        lgaName: lga.name,
        stateId: state.id,
        lgaId: lga.id,
        latitude: String(item.latitude),
        longitude: String(item.longitude),
        sourceReference: item.googleMapsUrl || 'nysc_orientation_camps_enriched.json',
        lastVerifiedAt: new Date(),
        status: item.campType === 'temporary' ? 'TEMPORARY' as const : 'ACTIVE' as const,
        updatedAt: new Date(),
      },
    };
  });

  const duplicateStates = resolved.filter((item, index) => resolved.findIndex((other) => other.state.id === item.state.id) !== index);
  if (duplicateStates.length) throw new Error(`Duplicate camp states in source: ${duplicateStates.map((x) => x.state.name).join(', ')}`);

  console.log(`Validated ${resolved.length} camps against ${stateRows.length} states and ${lgaRows.length} LGAs.`);
  if (dryRun) {
    console.log('Dry run complete; no database rows were changed.');
    return;
  }

  await db.transaction(async (tx) => {
    for (const item of resolved) {
      const current = existing.find((camp) => camp.stateId === item.state.id)
        ?? existing.find((camp) => normalize(camp.stateName) === normalize(item.state.name));
      if (current) {
        await tx.update(orientationCamps).set(item.values).where(eq(orientationCamps.id, current.id));
      } else {
        await tx.insert(orientationCamps).values(item.values);
      }
    }
  });
  console.log(`Imported ${resolved.length} orientation camps (${resolved.filter((x) => x.values.status === 'TEMPORARY').length} temporary).`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await pool.end(); });