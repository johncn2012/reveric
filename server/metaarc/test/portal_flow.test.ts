import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATABASE_URL = 'postgresql://metaarc_test:metaarc_portal_test_pw@127.0.0.1:5432/metaarc_portal_test';
process.env.NEW_API_BASE_URL = 'http://127.0.0.1:9';
process.env.NEW_API_ADMIN_KEY = '';
process.env.JWT_SECRET = 'portal-test-secret';
process.env.NODE_ENV = 'test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function migrate() {
  execFileSync('sudo', ['-u', 'postgres', 'psql', '-d', 'metaarc_portal_test', '-c', 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'], { stdio: 'pipe' });
  for (const file of ['001_init.sql', '002_audit_and_monitoring.sql', '003_session_and_audit.sql']) {
    execFileSync('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', 'metaarc_portal_test', '-f', path.join(root, 'migrations', file)], { stdio: 'pipe' });
  }
  execFileSync('sudo', ['-u', 'postgres', 'psql', '-d', 'metaarc_portal_test', '-c', `GRANT ALL ON ALL TABLES IN SCHEMA public TO metaarc_test; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO metaarc_test; DO $$ DECLARE r record; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP EXECUTE format('ALTER TABLE public.%I OWNER TO metaarc_test', r.tablename); END LOOP; END $$;`], { stdio: 'pipe' });
}

migrate();

const { createApp } = await import('../src/index.ts');
const { pool, initDbSchema } = await import('../src/db.ts');
const { signJwt } = await import('../src/middleware/auth.ts');

const stamp = Date.now().toString(36);
const userEmail = `portal-user-${stamp}@example.com`;
const adminEmail = `portal-admin-${stamp}@example.com`;
const password = `pw-${stamp}-ok`;

async function listen(): Promise<{ server: Server; base: string }> {
  const app = createApp();
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

async function send(url: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

test('startup schema upgrade can run twice', async () => {
  await initDbSchema();
  await initDbSchema();
  const column = await pool.query(
    `SELECT count(*)::int AS count FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'session_version'`,
  );
  assert.equal(column.rows[0].count, 1);
  const audit = await pool.query(`SELECT to_regclass('public.admin_audit_logs') AS name`);
  assert.equal(audit.rows[0].name, 'admin_audit_logs');
});

test.after(async () => {
  await pool.end();
});

test('public catalog, password reset and payment stay honest without a database write', async () => {
  const { server, base } = await listen();
  try {
    const catalog = await send(`${base}/api/updates/catalog`);
    assert.equal(catalog.status, 200);
    assert.equal(catalog.data.platforms.length, 3);
    for (const item of catalog.data.platforms) {
      assert.equal(item.has_update, false);
      assert.equal(item.download_url, undefined);
    }

    const forgot = await send(`${base}/api/auth/forgot-password`, { method: 'POST', body: { account: userEmail } });
    assert.equal(forgot.status, 501);
    assert.equal(forgot.data.error, 'reset_unavailable');
    assert.equal(JSON.stringify(forgot.data).includes('已发送'), false);

    const capabilities = await send(`${base}/api/portal/capabilities`);
    assert.equal(capabilities.data.payment, 'unavailable');
    assert.equal(capabilities.data.password_reset, 'unavailable');
    assert.equal(capabilities.data.diagnostics_inbox, 'not_connected');

    const anonOrder = await send(`${base}/api/orders/create`, { method: 'POST', body: { planSlug: 'free' } });
    assert.equal(anonOrder.status, 401);
    const userToken = signJwt({ userId: '00000000-0000-0000-0000-000000000099', role: 'user' });
    const closed = await send(`${base}/api/orders/create`, { method: 'POST', token: userToken, body: { planSlug: 'creator' } });
    assert.equal(closed.status, 401);
    assert.equal(closed.data.error, 'session_revoked');
    const notify = await send(`${base}/api/orders/notify/wechat`, { method: 'POST', body: { order_id: '00000000-0000-0000-0000-000000000099' } });
    assert.equal(notify.status, 403);
    assert.equal(notify.data.error, 'payment_unavailable');

    const help = await send(`${base}/help`);
    assert.equal(help.status, 200);
    const adminPage = await fetch(`${base}/admin`);
    assert.equal(adminPage.status, 200);
    assert.match(await adminPage.text(), /管理员工作台/);
  } finally {
    await close(server);
  }
});

test('login, user permissions, admin changes and empty states use the temporary database', async () => {
  const { server, base } = await listen();
  try {
    const registered = await send(`${base}/api/auth/register`, {
      method: 'POST',
      body: { email: userEmail, password, nickname: '测试创作者' },
    });
    assert.equal(registered.status, 201);
    const userToken = registered.data.token as string;
    assert.equal(registered.data.user.role, 'user');
    assert.equal(Number(registered.data.user.quota), 500);

    const profile = await send(`${base}/api/auth/profile`, { token: userToken });
    assert.equal(profile.status, 200);
    assert.equal(Number(profile.data.user.quota), 500);

    const orders = await send(`${base}/api/auth/orders`, { token: userToken });
    assert.equal(orders.status, 200);
    assert.deepEqual(orders.data.data, []);

    const pay = await send(`${base}/api/orders/create`, { method: 'POST', token: userToken, body: { planSlug: 'creator' } });
    assert.equal(pay.status, 403);
    assert.equal(pay.data.error, 'payment_unavailable');

    const forbidden = await send(`${base}/api/admin/users`, { token: userToken });
    assert.equal(forbidden.status, 403);
    const noToken = await send(`${base}/api/admin/audit`);
    assert.equal(noToken.status, 401);

    const adminRegistered = await send(`${base}/api/auth/register`, {
      method: 'POST',
      body: { email: adminEmail, password, nickname: '测试管理员' },
    });
    assert.equal(adminRegistered.status, 201);
    await pool.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [adminEmail]);
    const adminLogin = await send(`${base}/api/auth/login`, { method: 'POST', body: { account: adminEmail, password } });
    assert.equal(adminLogin.status, 200);
    assert.equal(adminLogin.data.user.role, 'admin');
    const adminToken = adminLogin.data.token as string;

    const missingReason = await send(`${base}/api/admin/users/${registered.data.user.id}/set-role`, {
      method: 'POST',
      token: adminToken,
      body: { role: 'admin' },
    });
    assert.equal(missingReason.status, 400);
    assert.equal(missingReason.data.error, 'reason_required');

    const changed = await send(`${base}/api/admin/users/${registered.data.user.id}/set-plan`, {
      method: 'POST',
      token: adminToken,
      body: { plan: 'creator', reason: '核对临时库套餐变更' },
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.data.user.plan, 'creator');

    const selfDemote = await send(`${base}/api/admin/users/${adminLogin.data.user.id}/set-role`, {
      method: 'POST',
      token: adminToken,
      body: { role: 'user', reason: '尝试降级自己' },
    });
    assert.equal(selfDemote.status, 400);
    const upperSelf = String(adminLogin.data.user.id).toUpperCase();
    const upperDemote = await send(`${base}/api/admin/users/${upperSelf}/set-role`, {
      method: 'POST',
      token: adminToken,
      body: { role: 'user', reason: '用大写 ID 尝试降级自己' },
    });
    assert.equal(upperDemote.status, 400);
    const upperSuspend = await send(`${base}/api/admin/users/batch`, {
      method: 'POST',
      token: adminToken,
      body: { userIds: [upperSelf], action: 'set_status', status: 'suspended', reason: '用大写 ID 尝试封禁自己' },
    });
    assert.equal(upperSuspend.status, 400);

    const userStillForbidden = await send(`${base}/api/admin/users/${adminLogin.data.user.id}/set-plan`, {
      method: 'POST',
      token: userToken,
      body: { plan: 'studio', reason: '越权尝试' },
    });
    assert.equal(userStillForbidden.status, 403);

    const audit = await send(`${base}/api/admin/audit`, { token: adminToken });
    assert.equal(audit.status, 200);
    assert.equal(audit.data.data.some((row: { action: string; reason: string }) => row.action === 'set_plan' && row.reason === '核对临时库套餐变更'), true);

    const firstProfile = await send(`${base}/api/auth/profile`, { token: adminToken });
    assert.equal(firstProfile.status, 200);
    const rotated = await send(`${base}/api/auth/logout-others`, { method: 'POST', token: adminToken, body: {} });
    assert.equal(rotated.status, 200);
    const revoked = await send(`${base}/api/auth/profile`, { token: adminToken });
    assert.equal(revoked.status, 401);
    const fresh = await send(`${base}/api/auth/profile`, { token: rotated.data.token });
    assert.equal(fresh.status, 200);

    const suspended = await send(`${base}/api/admin/users/${registered.data.user.id}/set-status`, {
      method: 'POST',
      token: rotated.data.token,
      body: { status: 'suspended', reason: '临时库封禁验证' },
    });
    assert.equal(suspended.status, 200);
    const blocked = await send(`${base}/api/auth/profile`, { token: userToken });
    assert.equal(blocked.status, 403);
    const relogin = await send(`${base}/api/auth/login`, { method: 'POST', body: { account: userEmail, password } });
    assert.equal(relogin.status, 403);
    const legacySuspended = signJwt({ userId: registered.data.user.id, role: 'user' });
    const legacyBlocked = await send(`${base}/api/auth/profile`, { token: legacySuspended });
    assert.equal(legacyBlocked.status, 403);

    const legacyAdmin = signJwt({ userId: adminLogin.data.user.id, role: 'admin' });
    await pool.query(`UPDATE users SET role = 'user' WHERE id = $1`, [adminLogin.data.user.id]);
    const demotedLegacy = await send(`${base}/api/admin/users?limit=1&offset=0`, { token: legacyAdmin });
    assert.equal(demotedLegacy.status, 403);
    await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [adminLogin.data.user.id]);
    const page = await send(`${base}/api/admin/users?limit=1&offset=0`, { token: rotated.data.token });
    assert.equal(page.status, 200);
    assert.equal(page.data.data.length, 1);
  } finally {
    await close(server);
  }
});
