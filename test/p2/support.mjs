import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parse } from 'dotenv';
import pg from 'pg';
pg.types.setTypeParser(1082, value => value);

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const artifacts = resolve(root, process.env.P2_TEST_PHASE === '2.2-final' ? '.p22-final-e2e' : process.env.P2_TEST_PHASE === '2.2' ? '.p22-e2e' : '.p2-e2e');
export const apiOrigin = 'http://localhost:4100';
export const webOrigin = 'http://localhost:3100';
export function assertTarget(raw) {
  const url = new URL(raw);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'PostgreSQL URL required');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Refusing non-local database');
  assert.equal(decodeURIComponent(url.pathname.slice(1)), 'kopa_padi_p2_e2e', 'Refusing wrong database');
  assert.equal(url.port || '5432', '5432', 'Refusing unexpected PostgreSQL port');
  for (const key of url.searchParams.keys()) assert.ok(['sslmode', 'application_name'].includes(key), 'Refusing connection override parameter');
  return url;
}
export function environment() {
  const local = existsSync(resolve(root, '.env')) ? parse(readFileSync(resolve(root, '.env'))) : {};
  const raw = process.env.P2_E2E_DATABASE_URL || process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || local.P2_E2E_DATABASE_URL || local.TEST_DATABASE_URL || local.DATABASE_URL;
  assertTarget(raw);
  return { ...process.env, DATABASE_URL: raw, TEST_DATABASE_URL: '', RUN_AUTH_INTEGRATION: '', RUN_PHASE5_INTEGRATION: '',
    NODE_ENV: 'test', DATABASE_SSL: 'false', BETTER_AUTH_SECRET: createHash('sha256').update('isolated-p2-e2e-test-only-auth-secret').digest('hex'),
    BETTER_AUTH_URL: apiOrigin, WEB_URL: webOrigin, NEXT_PUBLIC_API_URL: apiOrigin, PORT: '4100', HOST: '127.0.0.1', TRUST_PROXY: '127.0.0.1,::1',
    ZEPTO_MAIL_API_URL: 'http://127.0.0.1:4101/email', ZEPTO_MAIL_API_KEY: 'synthetic-local-sink-only',
    ZEPTO_MAIL_FROM_ADDRESS: 'sender@p2.invalid', FIRST_ADMIN_EMAIL: '', PRIVATE_UPLOAD_ROOT: resolve(artifacts, 'uploads'),
    REGISTRATION_ENABLED: 'true', TRAVEL_PLAN_CREATION_ENABLED: 'true', MATCHING_ENABLED: 'true', MESSAGING_ENABLED: 'true', JOURNEY_START_ENABLED: 'true', MAINTENANCE_MODE: 'false',
  };
}
export async function connect() {
  const env = environment();
  const target = assertTarget(env.DATABASE_URL);
  const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  const { rows: [identity] } = await client.query("select current_database() as database, inet_server_addr()::text as address, inet_server_port() as port, current_user as role");
  try {
    assert.equal(identity.database, 'kopa_padi_p2_e2e');
    assert.equal(identity.port, 5432, 'Refusing unexpected PostgreSQL instance');
    if (target.username) assert.equal(identity.role, decodeURIComponent(target.username), 'Connection role differs from configured identity');
    assert.ok(['::1', '::1/128', '127.0.0.1', '127.0.0.1/32'].includes(identity.address), 'Refusing non-loopback PostgreSQL server');
  } catch (error) { await client.end(); throw error; }
  return client;
}
export function passwordFor(name) { return 'P2-synthetic-only-' + createHash('sha256').update(name).digest('hex').slice(0, 20); }
export function record(file, data) { mkdirSync(artifacts, { recursive: true }); writeFileSync(resolve(artifacts, file), JSON.stringify(data, null, 2)); }
export function readState() { return JSON.parse(readFileSync(resolve(artifacts, 'state.json'), 'utf8')); }
export async function command(args, { cwd = root, quiet = false } = {}) {
  const client = await connect(); await client.end();
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, { cwd, env: environment(), windowsHide: true, stdio: quiet ? 'ignore' : 'inherit' });
    child.on('error', () => reject(new Error('Child process failed to start')));
    child.on('exit', code => code === 0 ? resolvePromise() : reject(new Error(`Guarded command exited ${code}`)));
  });
}
