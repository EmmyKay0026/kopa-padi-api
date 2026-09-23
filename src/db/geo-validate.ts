import 'dotenv/config';
import { sql } from 'drizzle-orm'; import { db,pool } from './database.js';
async function validate(){
  const checks = await db.execute(sql`
    select
      (select count(*) from state) as states,
      (select count(*) from lga) as lgas,
      (select count(*) from lga l left join state s on s.id=l.state_id where s.id is null) as orphan_lgas,
      (select count(*) from orientation_camp c left join state s on s.id=c.state_id where c.state_id is not null and s.id is null) as invalid_camps,
      (select count(*) from lga_proximity where lga_a_id >= lga_b_id or estimated_road_minutes < 0 or (estimated_road_distance_km is not null and estimated_road_distance_km < 0)) as invalid_pairs,
      (select count(*) from travel_hub_lga h left join travel_hub t on t.id=h.travel_hub_id left join lga l on l.id=h.lga_id where t.id is null or l.id is null or h.estimated_minutes < 0) as invalid_hub_coverage`);
  const row=checks.rows[0] as Record<string,string>; if(Number(row.states)!==37||Number(row.lgas)!==774||['orphan_lgas','invalid_camps','invalid_pairs','invalid_hub_coverage'].some(k=>Number(row[k])!==0)) throw new Error(`Geography validation failed: ${JSON.stringify(row)}`); console.log(`Geography valid: ${JSON.stringify(row)}`);
}
validate().then(()=>pool.end()).catch(async error=>{console.error(error);await pool.end();process.exitCode=1;});
