// Guarded localhost HTTP smoke; synthetic sessions only, no outbound mail.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { serializeSignedCookie } from 'better-call';
import { connect, webOrigin } from './p2/support.mjs';
const db = await connect();
const users = [randomUUID(), randomUUID()];
const children = [];
async function start(mode, port) {
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['dist/src/main.js'], { windowsHide: true, stdio: 'ignore',
    env: { ...process.env, TEST_MODE: mode, PORT: String(port), HOST: '127.0.0.1', BETTER_AUTH_URL: base, SMTP_FALLBACK_ENABLED: 'false' } });
  children.push(child);
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Local API failed to start');
    try { const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(500) }); if (response.ok) return base; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Local API startup deadline exceeded');
}
async function call(base, method, path, cookie, body, origin = webOrigin) {
  return fetch(base + '/api' + path, { method, headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
}
try {
  const cookies = [];
  for (let i = 0; i < users.length; i++) {
    await db.query('insert into "user" (id,name,email,email_verified,role,account_status) values ($1,$2,$3,true,$4,$5)', [users[i], 'Synthetic HTTP tester', `${users[i]}@p2.invalid`, i ? 'ADMIN' : 'USER', 'ACTIVE']);
    const token = randomUUID();
    await db.query("insert into session (id,token,user_id,expires_at) values ($1,$2,$3,now()+interval '10 minutes')", [randomUUID(), token, users[i]]);
    cookies.push((await serializeSignedCookie('better-auth.session_token', token, process.env.BETTER_AUTH_SECRET, { path: '/' })).split(';')[0]);
  }
  const on = await start('true', 4103);
  const config = await call(on, 'GET', '/test-mode');
  assert.equal((await config.json()).enabled, true); assert.match(config.headers.get('cache-control'), /no-store/);
  const body = { title: 'Synthetic HTTP bug', description: 'Synthetic steps to reproduce a bug.' };
  assert.equal((await call(on, 'POST', '/bug-reports', undefined, body)).status, 401);
  assert.equal((await call(on, 'POST', '/bug-reports', cookies[0], { ...body, reporterUserId: users[1] })).status, 400);
  assert.equal((await call(on, 'POST', '/bug-reports', cookies[0], body, 'https://hostile.invalid')).status, 403);
  const created = await call(on, 'POST', '/bug-reports', cookies[0], body); assert.equal(created.status, 201);
  assert.ok(created.headers.get('x-request-id')); const { id } = await created.json();
  assert.equal((await call(on, 'GET', '/admin/bug-reports', cookies[0])).status, 403);
  assert.equal((await call(on, 'PATCH', `/admin/bug-reports/${id}`, cookies[0], { status: 'RESOLVED' })).status, 403);
  const inbox = await call(on, 'GET', '/admin/bug-reports', cookies[1]); assert.equal(inbox.status, 200);
  assert.equal((await inbox.json()).find(row => row.id === id).reporterUserId, users[0]);
  assert.equal((await call(on, 'PATCH', `/admin/bug-reports/${id}`, cookies[1], { status: 'RESOLVED' })).status, 200);
  const off = await start('false', 4104);
  assert.equal((await (await call(off, 'GET', '/test-mode')).json()).enabled, false);
  assert.equal((await call(off, 'POST', '/bug-reports', cookies[0], body)).status, 404);
  assert.equal((await call(off, 'GET', '/admin/bug-reports', cookies[1])).status, 200);
  console.log('PASS: real HTTP flag on/off, no-store, authentication, validation, origin protection, persistence, admin authorization, status update and request ID');
} finally {
  for (const child of children) { if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; } }
  await db.query('delete from "user" where id=ANY($1::uuid[])', [users]);
  await db.end();
}
