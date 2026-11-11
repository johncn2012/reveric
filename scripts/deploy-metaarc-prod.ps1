# MetaArc 生产环境一键全自动部署脚本
param(
    [string]$HostIp = "13.13.60.107",
    [string]$User = "root"
)
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🚀 开始 MetaArc 生产环境全自动部署..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. 确保 designs/website/account 与 server/metaarc/public/account 严格一致
Write-Host "1. 同步前端设计稿与服务静态目录..." -ForegroundColor Gray
Copy-Item -Path "designs/website/account/*" -Destination "server/metaarc/public/account/" -Force -Recurse

# 2. 生成部署归档包
$TarPath = "server-deploy.tar.gz"
Write-Host "2. 打包生产静态与后端服务 ($TarPath)..." -ForegroundColor Gray
tar -czf $TarPath -C server/metaarc --exclude=".env" .

# 3. 准备安全 askpass
$AskPassPath = "$PSScriptRoot\..\askpass.bat"
if (-not (Test-Path $AskPassPath)) {
    Set-Content -Path $AskPassPath -Value "@echo Plmokn@0987@123`r`n" -Encoding ASCII
}

$env:SSH_ASKPASS = (Resolve-Path $AskPassPath).Path
$env:SSH_ASKPASS_REQUIRE = "force"
$env:DISPLAY = "dummy:0"
$SshExe = "C:\Program Files\Git\usr\bin\ssh.exe"
$ScpExe = "C:\Program Files\Git\usr\bin\scp.exe"
if (-not (Test-Path $SshExe)) { $SshExe = "ssh.exe" }
if (-not (Test-Path $ScpExe)) { $ScpExe = "scp.exe" }

$Commit = (& git rev-parse HEAD).Trim()

# 4. 上传归档包到远端
Write-Host "3. 上传部署包到 $User@$HostIp..." -ForegroundColor Gray
& $ScpExe -o StrictHostKeyChecking=no $TarPath "${User}@${HostIp}:/tmp/server-deploy.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "SCP 上传失败" }

# 5. 远端热生效与服务重载
Write-Host "4. 远端解压、热替换静态资源并重构容器..." -ForegroundColor Gray
$RemoteScript = @"
set -e
tar -xzf /tmp/server-deploy.tar.gz -C /opt/metaarc/server
echo "$Commit" > /opt/metaarc/server/.deployed-commit
date -u '+%Y-%m-%dT%H:%M:%SZ' > /opt/metaarc/server/.deployed-at
rm -f /tmp/server-deploy.tar.gz

docker cp /opt/metaarc/server/public/. metaarc-server:/app/public/
cd /opt/metaarc/server
docker compose build metaarc-server
docker compose up -d metaarc-server
sleep 2
curl -s http://127.0.0.1:8080/health
"@

& $SshExe -o StrictHostKeyChecking=no "${User}@${HostIp}" "$RemoteScript"
if ($LASTEXITCODE -ne 0) { throw "远端执行失败" }

# 6. 验证公网连通与静态资源版本
Write-Host "5. 验证公网生产环境 (https://metaarc.com.cn/account)..." -ForegroundColor Gray
$LiveHtml = (curl.exe -s https://metaarc.com.cn/account) -join "`n"
if ($LiveHtml -match 'account\.css\?v=([^"]+)') {
    Write-Host "✅ 生产发布成功！当前公网静态版本: $($Matches[1])" -ForegroundColor Green
} else {
    Write-Host "⚠️ 公网版本检查未匹配，可能存在 CDN 边缘延迟" -ForegroundColor Yellow
}
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🎉 MetaArc 生产环境全自动部署完毕！" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
