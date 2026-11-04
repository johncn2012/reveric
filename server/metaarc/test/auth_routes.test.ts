import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { pool } from '../src/db.ts';
import { createApp } from '../src/index.ts';

async function listen(): Promise<{ server: Server; base: string }> {
  const app = createApp();
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${address.port}` };
}

test.after(async () => {
  await pool.end();
});

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

test('login and register aliases match before the database is used', async () => {
  const { server, base } = await listen();
  try {
    const legacyLogin = await postJson(`${base}/api/login`, {});
    const canonicalLogin = await postJson(`${base}/api/auth/login`, {});
    assert.equal(legacyLogin.status, 400);
    assert.equal(legacyLogin.data.error, 'missing_fields');
    assert.deepEqual(canonicalLogin, legacyLogin);

    const legacyRegister = await postJson(`${base}/api/register`, { password: '123' });
    const canonicalRegister = await postJson(`${base}/api/auth/register`, { password: '123' });
    assert.equal(legacyRegister.status, 400);
    assert.equal(legacyRegister.data.error, 'invalid_password');
    assert.deepEqual(canonicalRegister, legacyRegister);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test('profile, orders and quota logs share auth failures across aliases', async () => {
  const { server, base } = await listen();
  try {
    const pairs = [
      ['/api/user/profile', '/api/auth/profile'],
      ['/api/auth/user/profile', '/api/auth/profile'],
      ['/api/user/orders', '/api/auth/orders'],
      ['/api/quota/logs', '/api/auth/quota/logs'],
    ];
    for (const [alias, canonical] of pairs) {
      const aliasRes = await fetch(`${base}${alias}`);
      const canonicalRes = await fetch(`${base}${canonical}`);
      assert.equal(aliasRes.status, 401);
      assert.equal(canonicalRes.status, 401);
      assert.deepEqual(await aliasRes.json(), await canonicalRes.json());
    }

    // 未注册的 /api/* 会落到管理路由的鉴权中间件，返回 401，而不是账号数据。
    const adminAlias = await fetch(`${base}/api/auth/admin/overview`);
    assert.equal(adminAlias.status, 401);
    assert.notEqual((await adminAlias.json()).success, true);
    const plansAlias = await fetch(`${base}/api/auth/plans`);
    assert.equal(plansAlias.status, 401);
    assert.notEqual((await plansAlias.json()).success, true);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test('GET /api/health matches /health and stays public', async () => {
  const { server, base } = await listen();
  try {
    const [rootRes, aliasRes] = await Promise.all([
      fetch(`${base}/health`),
      fetch(`${base}/api/health`),
    ]);
    assert.notEqual(aliasRes.status, 401);
    assert.equal(aliasRes.status, rootRes.status);

    const rootBody = await rootRes.json();
    const aliasBody = await aliasRes.json();
    assert.deepEqual(Object.keys(aliasBody).sort(), Object.keys(rootBody).sort());

    if (rootRes.status === 200) {
      assert.equal(rootBody.status, 'ok');
      assert.equal(rootBody.brand, 'MetaArc');
      assert.equal(rootBody.db, 'connected');
      assert.equal(aliasBody.status, rootBody.status);
      assert.equal(aliasBody.brand, rootBody.brand);
      assert.equal(aliasBody.db, rootBody.db);
      assert.equal(typeof aliasBody.timestamp, 'string');
      return;
    }

    assert.equal(rootRes.status, 500);
    assert.equal(rootBody.status, 'error');
    assert.equal(typeof rootBody.db, 'string');
    assert.equal(aliasBody.status, rootBody.status);
    assert.equal(typeof aliasBody.db, 'string');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test('account page is same-origin and has no demo quota', async () => {
  const { server, base } = await listen();
  try {
    for (const path of ['/account', '/account/']) {
      const page = await fetch(`${base}${path}`);
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /支付尚未开通/);
      assert.match(html, /进入创作台/);
      assert.match(html, /从小说到成片/);
      assert.match(html, /MetaArc 元弧/);
      assert.match(html, /暂无订单 · 支付未开通/);
      assert.match(html, /管理后台/);
      assert.match(html, /\/account\/account\.js/);
      assert.doesNotMatch(html, /登录即将开放|演示配额|500000|微信登录|GitHub 登录/);
    }

    const script = await fetch(`${base}/account/account.js`);
    assert.equal(script.status, 200);
    const source = await script.text();
    assert.match(source, /\/api\/auth\/login/);
    assert.match(source, /\/api\/auth\/register/);
    assert.match(source, /\/api\/auth\/profile/);
    assert.match(source, /\/api\/auth\/orders/);
    assert.match(source, /\/api\/auth\/quota\/logs/);
    assert.match(source, /\/api\/admin\/users/);
    assert.match(source, /\/api\/admin\/orders/);
    assert.doesNotMatch(source, /\/orders\/.+\/pay|管理后台|演示配额|成交额/);

    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    const homeHtml = await home.text();
    assert.match(homeHtml, /href="\/account"/);
    assert.match(homeHtml, /https:\/\/github.com\/looplj\/reveric/);
    assert.match(homeHtml, /AGPL-3.0/);
    assert.doesNotMatch(homeHtml, /登录即将开放|管理后台|\/releases\/download\//);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
