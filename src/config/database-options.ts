import type { PoolConfig } from 'pg';

// pg parses SSL URL flags after the explicit ssl option. Refuse all driver
// overrides rather than allowing a URL to silently weaken certificate checks.
export function databaseOptions(env = process.env): PoolConfig {
  const raw = env.DATABASE_URL;
  if (!raw) throw new Error('Database configuration is required');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Invalid database configuration'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('PostgreSQL configuration required');
  if (!url.hostname || !url.pathname.slice(1)) throw new Error('Explicit database host and name required');
  for (const [key] of url.searchParams) {
    if (!['application_name'].includes(key.toLowerCase())) throw new Error('Database URL connection overrides are forbidden');
  }
  if (env.NODE_ENV === 'production' && env.DATABASE_SSL !== 'true') throw new Error('Database TLS is required');
  return {
    connectionString: raw,
    ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    max: Number(env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: Number(env.DATABASE_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMillis: Number(env.DATABASE_CONNECT_TIMEOUT_MS ?? 5_000),
  };
}
