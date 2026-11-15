import pg from 'pg';
import jwt from 'jsonwebtoken';

const pool = new pg.Pool({
  connectionString: 'postgresql://metaarc_user:YourSecurePassword123@metaarc-postgres:5432/metaarc_db'
});

async function main() {
  console.log('--- 1. 测试找回密码：不存在的用户 ---');
  const res1 = await fetch('http://127.0.0.1:8080/api/auth/forgot-password/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nonexistent_test@metaarc.com.cn' })
  });
  const data1 = await res1.json();
  console.log('不存在用户返回:', res1.status, data1);
  if (res1.status !== 404 || data1.error !== 'user_not_found') {
    throw new Error('不存在用户校验失败');
  }

  console.log('\n--- 2. 测试找回密码：存在的真实用户 ---');
  const testEmail = 'creator01@metaarc.com.cn';
  await pool.query('DELETE FROM email_verifications WHERE email = $1', [testEmail]);
  const res2 = await fetch('http://127.0.0.1:8080/api/auth/forgot-password/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail })
  });
  const data2 = await res2.json();
  console.log('真实用户发送返回:', res2.status, data2);
  if (!data2.success) throw new Error('发送验证码失败: ' + JSON.stringify(data2));

  // 从 DB 读取刚生成的验证码
  const verifRes = await pool.query(
    'SELECT code FROM email_verifications WHERE email = $1 AND type = $2 AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
    [testEmail, 'reset_password']
  );
  const correctCode = verifRes.rows[0]?.code;
  console.log('数据库内生成的正确重置验证码:', correctCode);
  if (!correctCode) throw new Error('未查到重置验证码');

  console.log('\n--- 3. 测试 5 次猜错自动作废机制 ---');
  for (let i = 1; i <= 5; i++) {
    const wrongRes = await fetch('http://127.0.0.1:8080/api/auth/forgot-password/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        code: '999999',
        new_password: 'NewPassword123'
      })
    });
    const wrongData = await wrongRes.json();
    console.log('第 ' + i + ' 次错误输入返回:', wrongData.message);
  }

  // 第 6 次用正确的验证码，但此时该验证码已被作废
  const resLate = await fetch('http://127.0.0.1:8080/api/auth/forgot-password/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      code: correctCode,
      new_password: 'NewPassword123'
    })
  });
  const dataLate = await resLate.json();
  console.log('作废后使用正确验证码提交返回:', dataLate.message);
  if (resLate.status !== 400) throw new Error('作废验证码未能成功拦截！');

  console.log('\n--- 4. 测试 IPv6 /64 子网聚合聚类与一键级联封禁 ---');
  const testSubnet = '2408:8207:78cd:1234::/64';
  const dummy1 = 'ipv6_user_1@test.com';
  const dummy2 = 'ipv6_user_2@test.com';

  await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [dummy1, dummy2]);
  await pool.query(`
    INSERT INTO users (email, password_hash, plan, quota, total_quota, role, reg_ip, last_login_ip, reg_ip_prefix)
    VALUES 
      ($1, 'dummy', 'free', 100, 100, 'creator', '2408:8207:78cd:1234:1111:2222:3333:4444', '2408:8207:78cd:1234:1111:2222:3333:4444', $3),
      ($2, 'dummy', 'free', 100, 100, 'creator', '2408:8207:78cd:1234:5555:6666:7777:8888', '2408:8207:78cd:1234:5555:6666:7777:8888', $3)
  `, [dummy1, dummy2, testSubnet]);

  // 从数据库读取管理员信息并生成 Token
  const adminRes = await pool.query("SELECT id, email, session_version FROM users WHERE role = 'admin' LIMIT 1");
  const adminUser = adminRes.rows[0];
  if (!adminUser) throw new Error('未找到管理员账号');

  const JWT_SECRET = process.env.JWT_SECRET || 'metaarc-super-secret-jwt-key-2026';
  const token = jwt.sign({
    userId: adminUser.id,
    email: adminUser.email,
    role: 'admin',
    sv: adminUser.session_version || 0,
  }, JWT_SECRET, { expiresIn: '1h' });

  // 查询同 IP 聚类统计
  const statsRes = await fetch('http://127.0.0.1:8080/api/admin/security/ip-registration-stats?keyword=' + encodeURIComponent('2408:8207:78cd:1234'), {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const statsData = await statsRes.json();
  console.log('IPv6 聚类查询结果:', statsData.data);
  const cluster = statsData.data.find(c => c.ip === testSubnet);
  if (!cluster || cluster.user_count !== 2) {
    throw new Error('IPv6 /64 网段未能聚合聚类！期望 2 个用户');
  }
  console.log('✅ 成功聚合识别 IPv6 /64 子网: ' + cluster.ip + ', 关联用户数: ' + cluster.user_count);

  // 执行一键级联拦截与账号冻结
  const cascadeRes = await fetch('http://127.0.0.1:8080/api/admin/security/block-ip-and-cascade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({
      ip: testSubnet,
      reason: 'IPv6 子网多开脚本测试处置',
      durationHours: 1
    })
  });
  const cascadeData = await cascadeRes.json();
  console.log('级联处置结果:', cascadeData);
  if (!cascadeData.success || cascadeData.data.suspendedCount < 2) {
    throw new Error('级联冻结失败！');
  }
  console.log('✅ 级联处置成功，已拦截 IP 并冻结关联账号 ' + cascadeData.data.suspendedCount + ' 个');

  // 清理测试假数据并解封测试 IP
  await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [dummy1, dummy2]);
  await pool.query('DELETE FROM blocked_ips WHERE ip = $1', [testSubnet]);

  console.log('\n--- 5. 验证找回密码全闭环：获取新验证码并重置密码成功 ---');
  await pool.query('DELETE FROM email_verifications WHERE email = $1', [testEmail]);
  const sRes = await fetch('http://127.0.0.1:8080/api/auth/forgot-password/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail })
  });
  const v = await pool.query('SELECT code FROM email_verifications WHERE email = $1 AND type = $2 AND verified = FALSE ORDER BY created_at DESC LIMIT 1', [testEmail, 'reset_password']);
  const code = v.rows[0].code;
  console.log('新生成重置验证码:', code);
  const rRes = await fetch('http://127.0.0.1:8080/api/auth/forgot-password/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, code, new_password: 'MetaArc2026Password!' })
  });
  const rData = await rRes.json();
  console.log('重置密码返回:', rData);
  if (!rData.success) throw new Error('重置失败');

  console.log('\n--- 6. 验证新密码能否正常登录 ---');
  // 关闭验证码以便直接测试新密码有效性，或直接验证数据库哈希
  const u = await pool.query('SELECT password_hash FROM users WHERE email = $1', [testEmail]);
  const { default: bcrypt } = await import('bcryptjs');
  const matched = await bcrypt.compare('MetaArc2026Password!', u.rows[0].password_hash);
  console.log('新密码哈希比对结果:', matched ? '✅ 完全匹配' : '❌ 不匹配');
  if (!matched) throw new Error('新密码未能成功写入！');

  console.log('\n--- 7. 验证 /api/auth/profile 挂载与个人资料拉取 ---');
  const profRes = await fetch('http://127.0.0.1:8080/api/auth/profile', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  console.log('Profile 请求状态码:', profRes.status);
  const profData = await profRes.json();
  console.log('Profile 返回用户:', profData.user?.email, '角色:', profData.user?.role, '配额:', profData.user?.quota);
  if (profRes.status !== 200 || !profData.user || profData.user.email !== adminUser.email) {
    throw new Error('Profile 路由响应异常: ' + JSON.stringify(profData));
  }
  console.log('✅ /api/auth/profile 验证成功，个人资料与配额数据完整拉取');

  await pool.end();

  console.log('\n🎉 全部 5 项安全风控核心能力后端端到端检验 100% 通过！');
}

main().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
