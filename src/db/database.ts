import { databaseOptions } from '../config/database-options.js';
import { safeDiagnostic } from "../common/safe-errors.js";
import '../config/environment.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
import { validateEnvironment } from '../config/runtime.js';
// Import-time validation occurs before main/job bootstrap catch handlers.
// Keep that early boundary structured as well, including direct compiled entrypoints.
export const pool = (() => {
  try { validateEnvironment(); return new Pool(databaseOptions()); }
  catch (error) {
    console.error(JSON.stringify(safeDiagnostic('database_startup_failed', error)));
    process.exit(1);
  }
})();
pool.on('error', error => console.error(JSON.stringify(safeDiagnostic('database_pool_error', error))));
export const db = drizzle({ client: pool, schema });
export type Database = typeof db;
