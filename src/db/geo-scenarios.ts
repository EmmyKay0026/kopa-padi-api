import 'dotenv/config'; import { GeographyService } from '../geography/geography.service.js'; import { pool } from './database.js';
const expected=[
  ['same LGA','NG017025','NG017025','SAME_LGA'],
  ['nearby 38 minutes','NG017025','NG017011','NEARBY_LGA'],
  ['boundary 60 minutes','NG017024','NG017026','NEARBY_LGA'],
  ['over boundary 61 minutes','NG017024','NG017020','NOT_COMPATIBLE'],
  ['common Owerri hub','NG017026','NG017011','COMMON_HUB'],
  ['missing data','NG017001','NG017005','UNKNOWN'],
] as const;
async function run(){const service=new GeographyService();for(const[label,a,b,relationship]of expected){const result=await service.evaluate(a,b);if(result.relationship!==relationship)throw new Error(`${label}: expected ${relationship}, got ${result.relationship}`);console.log(`${label}: ${JSON.stringify(result)}`)}}
run().then(()=>pool.end()).catch(async e=>{console.error(e);await pool.end();process.exitCode=1});
