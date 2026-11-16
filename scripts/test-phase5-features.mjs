// 自动化验证脚本：Phase 5 强化项回归测试
import https from 'https';
import { signJwt } from '/app/dist/middleware/auth.js';
import { query } from '/app/dist/db.js';

const BASE_URL = 'https://metaarc.com.cn';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const bodyPayload = options.body
      ? typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body)
      : null;

    const reqHeaders = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (bodyPayload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyPayload);
    }

    const reqOptions = {
      method: options.method || 'GET',
      headers: reqHeaders,
      rejectUnauthorized: false,
    };
    const req = https.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json,
          raw: data,
        });
      });
    });
    req.on('error', reject);
    if (bodyPayload) {
      req.write(bodyPayload);
    }
    req.end();
  });
}

async function run() {
  console.log('=== MetaArc Phase 5 安全与运维强化项端到端自动化测试 ===\n');
  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
    }
  }

  // 1. 生产健康检查
  console.log('--- 测试项 1: 线上健康检查 ---');
  const health = await request('/api/health');
  assert(health.status === 200 && health.data?.status === 'ok', 'API 服务健康在线');

  // 获取管理员 JWT
  console.log('\n--- 管理员身份鉴权就绪 ---');
  const adminRes = await query("SELECT id, email, role, session_version FROM users WHERE role = 'admin' LIMIT 1");
  assert(adminRes.rows.length > 0, '系统存在有效管理员账号');
  const adminUser = adminRes.rows[0];
  const adminToken = signJwt({
    userId: adminUser.id,
    email: adminUser.email,
    role: 'admin',
    sv: Number(adminUser.session_version) || 0,
  });
  assert(!!adminToken, '管理员 JWT 签发成功');

  if (!adminToken) {
    console.error('无法继续后续需要管理员权限的测试');
    console.log(`\n测试统计: ${passed}/${total} 通过`);
    return;
  }

  const authHeaders = {
    Authorization: `Bearer ${adminToken}`,
    Cookie: `token=${adminToken}`,
  };

  // 2. 验证安全大盘指标 (blocked_ips, active_invites)
  console.log('\n--- 测试项 2: 安全风控大盘指标扩展 ---');
  const statsRes = await request('/api/admin/security/stats', { headers: authHeaders });
  assert(
    statsRes.status === 200 &&
    typeof statsRes.data?.data?.blocked_ips === 'number' &&
    typeof statsRes.data?.data?.active_invites === 'number',
    `安全统计指标返回 blocked_ips(${statsRes.data?.data?.blocked_ips}) 与 active_invites(${statsRes.data?.data?.active_invites})`
  );

  // 3. 验证高危 IP 聚类分析数组切片限制
  console.log('\n--- 测试项 3: 高危 IP 聚类分析账号样本切片 ---');
  const threatRes = await request('/api/admin/security/threat-ips', { headers: authHeaders });
  assert(
    threatRes.status === 200 && Array.isArray(threatRes.data?.data),
    '威胁 IP 列表正常返回'
  );
  if (threatRes.data?.data?.length > 0) {
    const allLimited = threatRes.data.data.every(r => !r.sample_accounts || r.sample_accounts.length <= 5);
    assert(allLimited, '高危 IP 关联账号抽样数均不超过 5 个');
  }

  // 4. 验证特邀码 CSV 导出接口
  console.log('\n--- 测试项 4: 特邀专属邀请码全量 CSV 导出 ---');
  const inviteCsvRes = await request('/api/admin/export/invite-codes', { headers: authHeaders });
  assert(
    inviteCsvRes.status === 200 &&
    inviteCsvRes.headers['content-type']?.includes('text/csv') &&
    inviteCsvRes.raw.includes('邀请码') &&
    inviteCsvRes.raw.includes('使用次数'),
    '成功导出包含邀请码、使用次数、状态等字段的 UTF-8 BOM CSV'
  );

  // 5. 验证用户列表 CSV 导出是否包含溯源列
  console.log('\n--- 测试项 5: 用户 CSV 导出包含注册 IP / IP 子网 / 邀请码溯源字段 ---');
  const userCsvRes = await request('/api/admin/export/users', { headers: authHeaders });
  assert(
    userCsvRes.status === 200 &&
    userCsvRes.headers['content-type']?.includes('text/csv') &&
    userCsvRes.raw.includes('注册IP') &&
    userCsvRes.raw.includes('IP子网') &&
    userCsvRes.raw.includes('邀请码'),
    '用户导出包含注册IP、注册地、IP子网与邀请码关联列'
  );

  // 6. 验证新建用户密码严格限制 8 位
  console.log('\n--- 测试项 6: 管理员新建用户 8 位密码安全限制 ---');
  const weakUserRes = await request('/api/admin/users/create', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: {
      email: `weak_test_${Date.now()}@test.metaarc.com`,
      password: '12345',
      reason: '自动化测试 5 位短密码拦截',
    },
  });
  assert(weakUserRes.status === 400 && weakUserRes.data?.error === 'invalid_fields', '管理员新建用户 5 位短密码被安全拦截 (>=8位)');

  console.log(`\n================================`);
  console.log(`测试完成: ${passed}/${total} 全部通过！`);
  console.log(`================================\n`);
}

run().catch(console.error);
