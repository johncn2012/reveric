// 套餐卡片渲染：推荐档只落在创作者版，支付按钮保持不可用。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = readFileSync(join(root, 'designs/website/metaarc.js'), 'utf8');

function loadPortal() {
  const sandbox = {
    console: { ...console, warn() {} },
    window: {},
    document: { getElementById() { return null; } },
    fetch: async () => {
      throw new Error('offline');
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window.metaarc;
}

const plans = [
  {
    name: '基础体验版',
    slug: 'free',
    price_cents: 0,
    billing_cycle: 'monthly',
    quota_points: 500,
    features: ['每月 500 算力点数', '支持文字创作与轻量配图'],
  },
  {
    name: '创作者版',
    slug: 'creator',
    price_cents: 2900,
    billing_cycle: 'monthly',
    quota_points: 3000,
    features: ['解锁高级画质模型与全角色音色', '优先排队调度'],
  },
  {
    name: '专业版 (PRO)',
    slug: 'pro',
    price_cents: 9900,
    billing_cycle: 'monthly',
    quota_points: 12000,
    features: ['解锁专业视频生成与超清分镜渲染'],
  },
  {
    name: '工作室版 (STUDIO)',
    slug: 'studio',
    price_cents: 29900,
    billing_cycle: 'monthly',
    quota_points: 45000,
    features: ['100GB 独享存储与自定义域名 CDN', '1v1 专属技术支持'],
  },
];

test('四档价格来自接口，支付保持不可用', () => {
  const portal = loadPortal();
  const html = plans.map((plan) => portal.renderPlanCard(plan)).join('\n');
  assert.match(html, /class="plan-card" data-plan-slug="creator"/);
  assert.equal(html.match(/class="plan-card"/g).length, 4);
  assert.equal(html.match(/支付尚未开通/g).length, 4);
  assert.doesNotMatch(html, /<a |立即支付|立即订阅|checkout|btn-plan/);
  assert.match(html, /¥0/);
  assert.match(html, /¥29/);
  assert.match(html, /¥99/);
  assert.match(html, /¥299/);
  assert.match(html, /3,000 点/);
  assert.match(html, /12,000 点/);
  assert.match(html, /45,000 点/);
  assert.match(html, /<span>100GB 独享存储与自定义域名 CDN<\/span>/);
});

test('没有 slug 时仍展示价格和未开通状态', () => {
  const portal = loadPortal();
  const html = portal.renderPlanCard({
    name: '创作者版（月付）',
    price_cents: 2900,
    billing_cycle: 'monthly',
    quota_points: 3000,
  });
  assert.match(html, /class="plan-card"/);
  assert.match(html, /支付尚未开通/);
  assert.match(html, /¥29/);
  assert.doesNotMatch(html, /<a |立即支付|checkout/);
});

test('slug 原样写入卡片，价格来自传入数据', () => {
  const portal = loadPortal();
  const creator = portal.renderPlanCard({
    name: 'Creator',
    slug: ' Creator ',
    price_cents: 2900,
    quota_points: 3000,
  });
  assert.match(creator, /data-plan-slug=" Creator "/);
  assert.match(creator, /支付尚未开通/);

  const pro = portal.renderPlanCard(plans[2]);
  assert.match(pro, /data-plan-slug="pro"/);
  assert.match(pro, /¥99/);
  const free = portal.renderPlanCard(plans[0]);
  assert.match(free, /data-plan-slug="free"/);
  assert.match(free, /¥0/);
});
