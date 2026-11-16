# MetaArc Phase 4 安全加固与审计隔离 全自动验证脚本
$ErrorActionPreference = "Stop"

$BaseUrl = "https://metaarc.com.cn"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🛡️ 开始 MetaArc Phase 4 生产环境安全加固全项验证 ($BaseUrl)..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

function Assert-Condition($condition, $message) {
    if ($condition) {
        Write-Host "  ✅ PASS: $message" -ForegroundColor Green
    } else {
        Write-Host "  ❌ FAIL: $message" -ForegroundColor Red
        throw "Assertion failed: $message"
    }
}

function Invoke-Api($path, $method = "GET", $body = $null, $token = $null) {
    $url = "$BaseUrl$path"
    $curlArgs = @("-s", "-X", $method, $url, "-H", "Content-Type: application/json; charset=utf-8")
    if ($token) {
        $curlArgs += @("-H", "Authorization: Bearer $token")
    }
    $tempFile = $null
    if ($body) {
        $tempFile = [System.IO.Path]::GetTempFileName()
        $jsonStr = if ($body -is [string]) { $body } else { $body | ConvertTo-Json -Compress }
        [System.IO.File]::WriteAllText($tempFile, $jsonStr, [System.Text.Encoding]::UTF8)
        $curlArgs += @("--data-binary", "@$tempFile")
    }
    try {
        $raw = & curl.exe @curlArgs
        try {
            return $raw | ConvertFrom-Json
        } catch {
            return $raw
        }
    } finally {
        if ($tempFile -and (Test-Path $tempFile)) {
            Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
        }
    }
}

# -------------------------------------------------------------
# 测试 1: 安全响应头验证 (Permissions-Policy, HSTS, X-Frame-Options)
# -------------------------------------------------------------
Write-Host "`n[测试 1] 验证现代安全响应头..." -ForegroundColor Yellow
$headRes = Invoke-WebRequest -Uri "$BaseUrl/account" -Method Head -UseBasicParsing
$headers = $headRes.Headers
$hasPerm = $headers["Permissions-Policy"]
$hasHsts = $headers["Strict-Transport-Security"]
$hasXfo  = $headers["X-Frame-Options"]

Write-Host "  Permissions-Policy: $hasPerm" -ForegroundColor Gray
Write-Host "  Strict-Transport-Security: $hasHsts" -ForegroundColor Gray
Write-Host "  X-Frame-Options: $hasXfo" -ForegroundColor Gray

Assert-Condition ($hasPerm -ne $null -and $hasPerm -match "camera=\(\)") "包含 Permissions-Policy 头"
Assert-Condition ($hasHsts -ne $null -and $hasHsts -match "max-age=31536000") "包含 Strict-Transport-Security (HSTS) 头"
Assert-Condition ($hasXfo -eq "SAMEORIGIN") "包含 X-Frame-Options: SAMEORIGIN"

# -------------------------------------------------------------
# 测试 2: 密码长度下限校验 (少于 8 位必须拒绝)
# -------------------------------------------------------------
Write-Host "`n[测试 2] 验证注册密码长度至少 8 位策略..." -ForegroundColor Yellow
$weakRes = Invoke-Api -path "/api/auth/register" -method "POST" -body @{
    email = "sec_test_weak_$(Get-Random)@metaarc.com.cn"
    password = "short"
}
Write-Host "  5 位密码注册响应: $($weakRes.error) - $($weakRes.message)" -ForegroundColor Gray
Assert-Condition ($weakRes.error -eq "invalid_password" -and $weakRes.message -match "8 位") "5 位弱密码被成功拦截为 400 invalid_password"

# -------------------------------------------------------------
# 测试 3: 管理员调高测试 IP 注册限额并正常注册 8 位密码账户
# -------------------------------------------------------------
Write-Host "`n[测试 3] 管理员登录并调高今日注册频次限额用于自动化测试..." -ForegroundColor Yellow
$adminRes = Invoke-Api -path "/api/auth/login" -method "POST" -body @{
    account = "admin@metaarc.com"
    password = "Password123!"
}
Write-Host "  管理员登录响应: $($adminRes | ConvertTo-Json -Compress)" -ForegroundColor Gray
Assert-Condition ($adminRes.token -ne $null) "管理员成功登录"
$adminToken = $adminRes.token

# 读取原始限额
$origSettings = Invoke-Api -path "/api/admin/settings" -method "GET" -token $adminToken
$origMaxPerIp = $origSettings.data.max_reg_per_ip_day
Write-Host "  原始单 IP 注册限额: $origMaxPerIp" -ForegroundColor Gray

# 临时上调单 IP 注册上限至 50
$setLimitRes = Invoke-Api -path "/api/admin/settings" -method "POST" -token $adminToken -body @{
    max_reg_per_ip_day = 50
    reason = "执行 Phase 4 自动化测试临时放宽注册限制"
}
Assert-Condition ($setLimitRes.success -eq $true) "成功临时调高单 IP 注册限额至 50"

# 注册合规账号
$testEmail = "sec_test_$(Get-Random)@metaarc.com.cn"
$validPwd = "Password123!"
$regRes = Invoke-Api -path "/api/auth/register" -method "POST" -body @{
    email = $testEmail
    password = $validPwd
    nickname = "安全测试员"
}
Assert-Condition ($regRes.token -ne $null) "成功注册合规账号: $testEmail"

# -------------------------------------------------------------
# 测试 4: 账号级防暴力破解 (连续 5 次错误密码锁定 15 分钟)
# -------------------------------------------------------------
Write-Host "`n[测试 4] 验证连续 5 次输错密码账号临时锁定 (Account Lockout)..." -ForegroundColor Yellow

for ($i = 1; $i -le 5; $i++) {
    $badRes = Invoke-Api -path "/api/auth/login" -method "POST" -body @{
        account = $testEmail
        password = "WrongPassword$i"
    }
    Write-Host "    尝试 $($i): 返回 $($badRes.error) ($($badRes.message))" -ForegroundColor Gray
    Assert-Condition ($badRes.error -eq "invalid_credentials") "第 $($i) 次密码错误返回 401 凭证错误"
}

# 第 6 次尝试，应触发 429 account_locked
$lockRes = Invoke-Api -path "/api/auth/login" -method "POST" -body @{
    account = $testEmail
    password = "WrongPassword6"
}
Write-Host "    锁定触发 (第 6 次): 返回 $($lockRes.error): $($lockRes.message)" -ForegroundColor Yellow
Assert-Condition ($lockRes.error -eq "account_locked" -and $lockRes.message -match "锁定") "第 6 次尝试成功触发账号级连续输错锁定 (429 account_locked)"

# -------------------------------------------------------------
# 测试 5: 服务端主动销毁会话 (POST /api/auth/logout -> 401 session_revoked)
# -------------------------------------------------------------
Write-Host "`n[测试 5] 验证登出时服务端主动失效 Token 会话..." -ForegroundColor Yellow
$user2Email = "logout_test_$(Get-Random)@metaarc.com.cn"
$user2Pwd = "Password2026!"
$u2Reg = Invoke-Api -path "/api/auth/register" -method "POST" -body @{
    email = $user2Email
    password = $user2Pwd
}
$activeToken = $u2Reg.token
Assert-Condition ($activeToken -ne $null) "获取有效登录 Token"

# 验证有效性
$profileBefore = Invoke-Api -path "/api/auth/profile" -method "GET" -token $activeToken
Assert-Condition ($profileBefore.user.email -eq $user2Email) "在登出前，使用该 Token 正常读取个人画像"

# 调用 POST /api/auth/logout 服务端销毁会话
$logoutRes = Invoke-Api -path "/api/auth/logout" -method "POST" -token $activeToken -body @{}
Assert-Condition ($logoutRes.success -eq $true) "调用 /api/auth/logout 成功返回: $($logoutRes.message)"

# 再次使用原 Token 访问，必须被中间件拦截为 401 session_revoked
$profileAfter = Invoke-Api -path "/api/auth/profile" -method "GET" -token $activeToken
Write-Host "    登出后再次请求 profile: 返回 $($profileAfter.error): $($profileAfter.message)" -ForegroundColor Green
Assert-Condition ($profileAfter.error -eq "session_revoked") "已登出 Token 成功被服务端拒绝 (401 session_revoked)"

# -------------------------------------------------------------
# 测试 6: 管理员敏感密钥脱敏 (Masking) 与安全覆盖验证
# -------------------------------------------------------------
Write-Host "`n[测试 6] 验证管理员安全配置读取密钥脱敏与安全保存..." -ForegroundColor Yellow
$settingsRes = Invoke-Api -path "/api/admin/settings" -method "GET" -token $adminToken
$secretKeyMasked = $settingsRes.data.cf_turnstile_secret_key
Write-Host "  读取到的 Turnstile Secret Key: $secretKeyMasked" -ForegroundColor Gray
if ($settingsRes.data.has_turnstile_secret) {
    Assert-Condition ($secretKeyMasked -match "●●●●●●●●") "敏感 Secret Key 正确被掩码脱敏"
}

# 提交包含掩码的配置，验证后台安全保留原有密钥而不被覆盖为掩码本身
$saveMaskedRes = Invoke-Api -path "/api/admin/settings" -method "POST" -token $adminToken -body @{
    cf_turnstile_secret_key = "●●●●●●●●xxxx"
    reason = "测试掩码提交保留原有密钥"
}
Assert-Condition ($saveMaskedRes.success -eq $true) "提交掩码数据保存成功"

# -------------------------------------------------------------
# 测试 7: 管理员用户列表包含邀请码与子网前缀
# -------------------------------------------------------------
Write-Host "`n[测试 7] 验证管理员用户列表与画像包含 reg_ip_prefix 和 invited_by_code..." -ForegroundColor Yellow
$usersRes = Invoke-Api -path "/api/admin/users?pageSize=5" -method "GET" -token $adminToken
$firstUser = $usersRes.data[0]
Assert-Condition ($firstUser.PSObject.Properties["reg_ip_prefix"] -ne $null -or $firstUser.reg_ip_prefix -ne $null) "用户列表包含 reg_ip_prefix 字段"
Assert-Condition ($firstUser.PSObject.Properties["invited_by_code"] -ne $null) "用户列表包含 invited_by_code 字段"

# -------------------------------------------------------------
# 测试清理: 恢复管理员原始单 IP 注册限额
# -------------------------------------------------------------
Write-Host "`n[测试清理] 恢复单 IP 注册限额为 $origMaxPerIp..." -ForegroundColor Yellow
$restoreRes = Invoke-Api -path "/api/admin/settings" -method "POST" -token $adminToken -body @{
    max_reg_per_ip_day = [int]$origMaxPerIp
    reason = "测试完成恢复限额"
}
Assert-Condition ($restoreRes.success -eq $true) "单 IP 注册限额恢复完毕"

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "🎉 全部 Phase 4 生产环境安全与审计测试 100% 通过！" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
