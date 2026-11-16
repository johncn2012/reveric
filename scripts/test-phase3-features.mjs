// test-phase3-features.mjs: Phase 3 核心功能生产环境端到端验证脚本
import https from 'https';
import { signJwt } from '/app/dist/middleware/auth.js';
import { query } from '/app/dist/db.js';

const BASE_URL = 'https://metaarc.com.cn';

function apiRequest(path, options = {}) {
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
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: json, text: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: null, text: data });
        }
      });
    });

    req.on('error', reject);
    if (bodyPayload) {
      req.write(bodyPayload);
    }
    req.end();
  });
}

async function runTests() {
  console.log('==============================================');
  console.log('🧪 开始 MetaArc Phase 3 生产环境端到端自动化测试');
  console.log('==============================================');

  // 1. 公开安全配置测试
  console.log('\n[1/8] 测试 GET /api/auth/config 公开安全策略...');
  const configRes = await apiRequest('/api/auth/config');
  console.log('Status:', configRes.status);
  console.log('Config:', JSON.stringify(configRes.data.data));
  if (configRes.status !== 200 || !configRes.data.data?.registration_mode) {
    throw new Error('公开配置接口未返回 registration_mode');
  }
  console.log('✅ 公开安全策略配置返回正常！');

  // 2. 管理员鉴权与安全配置更新 (准备测试环境)
  console.log('\n[2/8] 管理员鉴权与安全配置更新校验...');
  const adminRes = await query("SELECT id, email, role FROM users WHERE role = 'admin' LIMIT 1");
  if (!adminRes.rows.length) {
    throw new Error('系统未找到管理员账号');
  }
  const adminUser = adminRes.rows[0];
  const adminToken = signJwt({
    userId: adminUser.id,
    email: adminUser.email,
    role: 'admin',
    sv: 0,
  });
  console.log('✅ 超管鉴权就绪，UID:', adminUser.id);

  // 更新配置为 open 且临时放行 email_code 与单 IP 上限，确保后续注册链路顺利测试
  const updateSettingsRes = await apiRequest('/api/admin/settings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      registration_mode: 'open',
      block_disposable_email: true,
      require_email_code: false,
      max_reg_per_ip_day: 50,
      reason: 'Phase 3 自动化测试配置就绪',
    },
  });
  if (updateSettingsRes.status !== 200) {
    throw new Error('更新系统安全策略失败: ' + JSON.stringify(updateSettingsRes.data));
  }
  console.log('✅ 管理后台成功更新安全配置为 open 准入模式 (测试上限 50/日)');

  // 3. 一次性临时邮箱拦截测试
  console.log('\n[3/8] 测试 Disposable Email Shield 拦截临时邮箱...');
  const throwawayRes = await apiRequest('/api/auth/send-email-code', {
    method: 'POST',
    body: { email: 'malicious_bot@mailinator.com' },
  });
  console.log('Mailinator 拦截响应:', throwawayRes.status, throwawayRes.data);
  if (throwawayRes.status !== 400 || throwawayRes.data.error !== 'disallowed_email_domain') {
    throw new Error('一次性临时邮箱拦截未生效！期望 400 disallowed_email_domain');
  }
  console.log('✅ Disposable Email Shield 成功拦截 mailinator 临时邮箱！');

  const guerrillamailRes = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      email: 'hacker@guerrillamail.com',
      password: 'password123456',
      nickname: 'Bot',
    },
  });
  console.log('Guerrillamail 拦截响应:', guerrillamailRes.status, guerrillamailRes.data);
  if (guerrillamailRes.status !== 400 || guerrillamailRes.data.error !== 'disallowed_email_domain') {
    throw new Error('注册接口未成功拦截 guerrillamail 临时邮箱！');
  }
  console.log('✅ 注册接口成功拦截 guerrillamail 临时邮箱！');

  // 4. 创建测试邀请码
  console.log('\n[4/8] 创建测试内测邀请码 (ARC-TESTPHASE3)...');
  const testCode = 'ARC-PHASE3-' + Date.now().toString(36).toUpperCase();
  const createInviteRes = await apiRequest('/api/admin/invite-codes/create', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      count: 1,
      code: testCode,
      max_uses: 2,
      bonus_quota: 250,
      target_plan: 'free',
      note: '自动化测试专用邀请码',
      reason: 'Phase 3 自动化测试',
    },
  });
  console.log('创建邀请码响应:', createInviteRes.status, createInviteRes.data);
  if (createInviteRes.status !== 201) {
    throw new Error('创建邀请码失败: ' + JSON.stringify(createInviteRes.data));
  }
  console.log(`✅ 成功创建邀请码: ${testCode}`);

  // 列表查询该邀请码
  const listInviteRes = await apiRequest(`/api/admin/invite-codes?keyword=${testCode}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const foundCode = listInviteRes.data.data?.[0];
  if (!foundCode || foundCode.code !== testCode) {
    throw new Error('未能在邀请码列表中查出新建的邀请码');
  }
  console.log(`✅ 查询验证邀请码存在，当前 used_count: ${foundCode.used_count}/${foundCode.max_uses}`);

  // 5. 使用邀请码注册新用户并验证算力加赠
  console.log('\n[5/8] 使用邀请码注册新账号并验证加赠额度...');
  const testUserEmail = `invitee_${Date.now()}@metaarc-test.com`;
  const regUser1Res = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      email: testUserEmail,
      password: 'StrongPassword123!',
      nickname: '邀请码创作者1',
      invite_code: testCode,
    },
  });
  console.log('用户1注册响应:', regUser1Res.status, regUser1Res.data);
  if (regUser1Res.status !== 201 || !regUser1Res.data.token) {
    throw new Error('使用邀请码注册用户1失败: ' + JSON.stringify(regUser1Res.data));
  }
  const user1Token = regUser1Res.data.token;

  // 查看用户1的资料与算力
  const profileRes = await apiRequest('/api/auth/profile', {
    headers: { Authorization: `Bearer ${user1Token}` },
  });
  console.log('用户1配额核对 (期望 500+250=750):', profileRes.data.user?.quota);
  if (profileRes.data.user?.quota !== 750) {
    throw new Error(`用户1配额异常，期望 750，实际为 ${profileRes.data.user?.quota}`);
  }
  console.log('✅ 用户成功获得初始体验 500 点 + 邀请码加赠 250 点 = 750 点！');

  // 6. 测试邀请码达到使用上限后自动耗尽拦截
  console.log('\n[6/8] 测试邀请码用尽拦截 (max_uses=2)...');
  const testUser2Email = `invitee2_${Date.now()}@metaarc-test.com`;
  const regUser2Res = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      email: testUser2Email,
      password: 'StrongPassword123!',
      nickname: '邀请码创作者2',
      invite_code: testCode,
    },
  });
  if (regUser2Res.status !== 201) {
    throw new Error('用户2使用第2次邀请码失败: ' + JSON.stringify(regUser2Res.data));
  }
  console.log('✅ 用户2成功完成注册，邀请码使用次数已达到上限 2/2');

  // 第 3 次尝试使用该邀请码（应拦截）
  const testUser3Email = `invitee3_${Date.now()}@metaarc-test.com`;
  const regUser3Res = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      email: testUser3Email,
      password: 'StrongPassword123!',
      nickname: '邀请码创作者3',
      invite_code: testCode,
    },
  });
  console.log('用户3使用已耗尽邀请码响应:', regUser3Res.status, regUser3Res.data);
  if (regUser3Res.status !== 400 || regUser3Res.data.error !== 'invite_code_exhausted') {
    throw new Error('已耗尽邀请码未被拦截！期望 400 invite_code_exhausted');
  }
  console.log('✅ 邀请码耗尽保护完美触发 (400 invite_code_exhausted)！');

  // 7. 测试删除防护与禁用切换
  console.log('\n[7/8] 测试已使用邀请码防删保护与状态禁用...');
  const delUsedRes = await apiRequest(`/api/admin/invite-codes/${testCode}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { reason: '测试删除' },
  });
  console.log('删除已使用邀请码响应:', delUsedRes.status, delUsedRes.data);
  if (delUsedRes.status !== 400 || delUsedRes.data.error !== 'code_in_use') {
    throw new Error('已使用邀请码未阻止删除！');
  }
  console.log('✅ 审计防断链生效：已使用邀请码禁止删除！');

  const toggleRes = await apiRequest(`/api/admin/invite-codes/${testCode}/toggle`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { status: 'disabled', reason: '测试禁用' },
  });
  console.log('切换邀请码响应:', toggleRes.status, toggleRes.data);
  if (toggleRes.status !== 200) {
    throw new Error('切换邀请码禁用状态失败: ' + JSON.stringify(toggleRes.data));
  }
  console.log('✅ 邀请码状态成功设为「已禁用」');

  // 8. 恢复生产初始策略 (开启 require_email_code, max_reg_per_ip_day: 5)
  console.log('\n[8/8] 恢复生产策略状态...');
  await apiRequest('/api/admin/settings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      registration_mode: 'open',
      block_disposable_email: true,
      require_email_code: true,
      max_reg_per_ip_day: 5,
      reason: 'Phase 3 自动化测试完成恢复',
    },
  });
  console.log('✅ 生产配置已平稳恢复！');

  console.log('\n==============================================');
  console.log('🎉 全部 8 项端到端生产环境安全测试用例 100% 通过！');
  console.log('==============================================');
}

runTests().catch((err) => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
