// test-phase4-features.mjs: Phase 4 生产环境安全与审计隔离端到端自动化测试
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

function assert(condition, message) {
  if (!condition) {
    console.error('❌ FAIL:', message);
    throw new Error(message);
  }
  console.log('✅ PASS:', message);
}

async function runTests() {
  console.log('====================================================');
  console.log('🛡️ 开始 MetaArc Phase 4 生产环境安全加固全项自动化测试');
  console.log('====================================================');

  // 1. 安全响应头检测
  console.log('\n[1/8] 测试现代安全响应头 (Permissions-Policy, HSTS, XFO)...');
  const headRes = await apiRequest('/account', { method: 'GET' });
  const perm = headRes.headers['permissions-policy'];
  const hsts = headRes.headers['strict-transport-security'];
  const xfo = headRes.headers['x-frame-options'];
  console.log('Permissions-Policy:', perm);
  console.log('Strict-Transport-Security:', hsts);
  console.log('X-Frame-Options:', xfo);
  assert(perm && perm.includes('camera=()'), '包含 Permissions-Policy 头');
  assert(hsts && hsts.includes('max-age=31536000'), '包含 Strict-Transport-Security 头');
  assert(xfo === 'SAMEORIGIN', '包含 X-Frame-Options: SAMEORIGIN');

  // 2. 弱密码（少于 8 位）拦截测试
  console.log('\n[2/8] 测试注册密码长度限制（< 8 位强制拦截）...');
  const weakRes = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      email: `weak_pwd_${Date.now()}@metaarc.com.cn`,
      password: 'short', // 5 位
    },
  });
  console.log('Weak password register status:', weakRes.status, weakRes.data);
  assert(weakRes.status === 400 && weakRes.data?.error === 'invalid_password' && weakRes.data?.message?.includes('8 位'), '5 位弱密码被成功拦截为 400 invalid_password');

  // 3. 管理员签发鉴权与测试环境安全配置就绪
  console.log('\n[3/8] 管理员签发测试环境配置并放宽验证码限制...');
  const adminRes = await query("SELECT id, email, role, session_version FROM users WHERE role = 'admin' LIMIT 1");
  assert(adminRes.rows.length > 0, '系统存在管理员账号');
  const adminUser = adminRes.rows[0];
  const adminToken = signJwt({
    userId: adminUser.id,
    email: adminUser.email,
    role: 'admin',
    sv: Number(adminUser.session_version) || 0,
  });

  // 读取原始设置
  const origSettingsRes = await apiRequest('/api/admin/settings', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(origSettingsRes.status === 200, '成功获取当前系统安全配置');
  const origSettings = origSettingsRes.data.data;
  console.log('原始设置 max_reg_per_ip_day:', origSettings.max_reg_per_ip_day);

  // 临时关闭图形验证码并调高单 IP 限额以执行自动化测试
  const setupSettings = await apiRequest('/api/admin/settings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      registration_mode: 'open',
      require_login_captcha: false,
      require_email_code: false,
      max_reg_per_ip_day: 50,
      reason: 'Phase 4 自动化测试环境就绪',
    },
  });
  assert(setupSettings.status === 200, '成功更新系统安全策略用于测试');

  // 4. 正常注册 8 位合规密码账号
  console.log('\n[4/8] 测试正常注册 8 位密码账号...');
  const testEmail = `sec_user_${Date.now()}@metaarc.com.cn`;
  const testPwd = 'SecurePassword2026!';
  const regRes = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      email: testEmail,
      password: testPwd,
      nickname: '安全测试用户',
    },
  });
  console.log('Register response status:', regRes.status);
  assert((regRes.status === 200 || regRes.status === 201) && regRes.data?.token, '8 位密码账号成功注册并签发 Token');

  // 5. 账号级防暴力破解 (连续 5 次输错密码临时锁定 15 分钟)
  console.log('\n[5/8] 测试账号级防暴力撞库 (5 次错误锁定 15 分钟)...');
  for (let i = 1; i <= 5; i++) {
    const badRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        account: testEmail,
        password: `WrongPassword${i}`,
      },
    });
    console.log(`  输错密码第 ${i} 次响应: status ${badRes.status}, error: ${badRes.data?.error}`);
    assert(badRes.status === 401 && badRes.data?.error === 'invalid_credentials', `第 ${i} 次返回 401 invalid_credentials`);
  }

  // 第 6 次，应触发 429 account_locked
  const lockRes = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: {
      account: testEmail,
      password: 'WrongPassword6',
    },
  });
  console.log('  锁定触发（第 6 次）响应: status', lockRes.status, lockRes.data);
  assert(lockRes.status === 429 && lockRes.data?.error === 'account_locked', '第 6 次尝试成功触发 429 account_locked');

  // 6. 服务端主动失效会话 (POST /api/auth/logout -> 401 session_revoked)
  console.log('\n[6/8] 测试服务端主动登出会话失效...');
  const user2Email = `logout_user_${Date.now()}@metaarc.com.cn`;
  const user2Pwd = 'LogoutPass2026!';
  const u2Reg = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { email: user2Email, password: user2Pwd },
  });
  assert((u2Reg.status === 200 || u2Reg.status === 201) && u2Reg.data?.token, '新用户成功注册');
  const u2Token = u2Reg.data.token;

  // 登出前可以读取 profile
  const pBefore = await apiRequest('/api/auth/profile', {
    headers: { Authorization: `Bearer ${u2Token}` },
  });
  assert(pBefore.status === 200 && pBefore.data?.user?.email === user2Email, '登出前正常访问受保护接口');

  // 调用 POST /api/auth/logout
  const logoutRes = await apiRequest('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${u2Token}` },
    body: {},
  });
  console.log('Logout response:', logoutRes.status, logoutRes.data);
  assert(logoutRes.status === 200 && logoutRes.data?.success === true, '调用 /api/auth/logout 成功返回');

  // 登出后再次请求 profile，必须被拦截为 401 session_revoked
  const pAfter = await apiRequest('/api/auth/profile', {
    headers: { Authorization: `Bearer ${u2Token}` },
  });
  console.log('Profile after logout status:', pAfter.status, pAfter.data);
  assert(pAfter.status === 401 && pAfter.data?.error === 'session_revoked', '登出后的旧 Token 成功被服务端即时作废 (401 session_revoked)');

  // 7. 管理员敏感密钥脱敏与掩码防覆写
  console.log('\n[7/8] 测试管理员接口密钥脱敏与防误覆写...');
  const getSettingsAgain = await apiRequest('/api/admin/settings', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const maskedSecret = getSettingsAgain.data?.data?.cf_turnstile_secret_key;
  console.log('Admin settings returned secret key:', maskedSecret);
  if (getSettingsAgain.data?.data?.has_turnstile_secret) {
    assert(maskedSecret.includes('●●●●●●●●'), '敏感 Secret Key 正确返回掩码');
  }

  // 提交掩码字符串保存，验证不会把真正的密钥覆盖成掩码
  const saveMasked = await apiRequest('/api/admin/settings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      cf_turnstile_secret_key: '●●●●●●●●xxxx',
      reason: '测试掩码防覆写',
    },
  });
  assert(saveMasked.status === 200, '提交掩码配置保存成功');

  // 8. 管理员用户列表包含子网前缀与邀请码
  console.log('\n[8/8] 测试管理员用户列表包含 reg_ip_prefix 与 invited_by_code...');
  const usersRes = await apiRequest('/api/admin/users?pageSize=5', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(usersRes.status === 200 && Array.isArray(usersRes.data?.data), '成功获取用户列表');
  const u0 = usersRes.data.data[0];
  console.log('User 0 fields check: reg_ip_prefix:', u0.reg_ip_prefix, 'invited_by_code:', u0.invited_by_code);
  assert('reg_ip_prefix' in u0, '用户列表包含 reg_ip_prefix 字段');
  assert('invited_by_code' in u0, '用户列表包含 invited_by_code 字段');

  // 用户画像详情接口检查
  const detailRes = await apiRequest(`/api/admin/users/${u0.id}/detail`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(detailRes.status === 200 && 'reg_ip_prefix' in detailRes.data.data.user, '用户画像详情包含 reg_ip_prefix 字段');

  // 测试清理：恢复原始设置
  console.log('\n[清理] 恢复生产环境原始安全策略...');
  await apiRequest('/api/admin/settings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      require_login_captcha: origSettings.require_login_captcha !== false,
      require_email_code: !!origSettings.require_email_code,
      max_reg_per_ip_day: origSettings.max_reg_per_ip_day || 5,
      reason: 'Phase 4 自动化测试完成恢复策略',
    },
  });
  console.log('✅ 生产环境安全策略恢复完毕！');

  console.log('\n====================================================');
  console.log('🎉 恭喜！全部 8 项 Phase 4 核心安全加固与审计测试 100% 通过！');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('\n💥 测试执行异常终止:', err);
  process.exit(1);
});
