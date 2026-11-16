# MetaArc 三位码（SemVer: X.Y.Z）自动升级与全项目同步脚本
param(
    [Parameter(Mandatory=$true)]
    [string]$NewVersion
)

$ErrorActionPreference = "Stop"

if ($NewVersion -notmatch '^\d+\.\d+\.\d+$') {
    Write-Error "版本号必须符合标准三位码规范（MAJOR.MINOR.PATCH，例如 0.6.3 或 1.0.0）"
    exit 1
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🚀 开始 MetaArc 三位码版本自动升级: v$NewVersion" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$root = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $root

# 1. 更新 pubspec.yaml
$pubspecPath = "pubspec.yaml"
if (Test-Path $pubspecPath) {
    Write-Host "1. 更新 $pubspecPath..." -ForegroundColor Gray
    $content = Get-Content $pubspecPath -Raw -Encoding UTF8
    $content = $content -replace '(?m)^version:\s*\d+\.\d+\.\d+.*$', "version: $NewVersion"
    Set-Content -Path $pubspecPath -Value $content -Encoding UTF8 -NoNewline
}

# 2. 更新 lib/shared/app_config.dart
$appConfigPath = "lib/shared/app_config.dart"
if (Test-Path $appConfigPath) {
    Write-Host "2. 更新 $appConfigPath..." -ForegroundColor Gray
    $content = Get-Content $appConfigPath -Raw -Encoding UTF8
    $content = $content -replace "const appVersion = '[^']+';", "const appVersion = '$NewVersion';"
    Set-Content -Path $appConfigPath -Value $content -Encoding UTF8 -NoNewline
}

# 3. 更新 designs/website/version.json
$nowUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$versionJsonObj = [PSCustomObject]@{
    version = $NewVersion
    build_time = $nowUtc
    channel = "stable"
    release_notes = "MetaArc v$NewVersion 版本更新与系统优化发布。"
}
$versionJsonPath = "designs/website/version.json"
Write-Host "3. 生成 $versionJsonPath..." -ForegroundColor Gray
$versionJsonObj | ConvertTo-Json -Depth 4 | Set-Content -Path $versionJsonPath -Encoding UTF8

# 4. 更新 designs/website/account/account.js 中的 CURRENT_WEB_VERSION
$accountJsPath = "designs/website/account/account.js"
if (Test-Path $accountJsPath) {
    Write-Host "4. 更新 $accountJsPath 版本常量..." -ForegroundColor Gray
    $content = Get-Content $accountJsPath -Raw -Encoding UTF8
    $content = $content -replace "const CURRENT_WEB_VERSION = '[^']+';", "const CURRENT_WEB_VERSION = '$NewVersion';"
    Set-Content -Path $accountJsPath -Value $content -Encoding UTF8 -NoNewline
}

# 5. 更新 designs/website/account/index.html 资源缓存标签
$accountHtmlPath = "designs/website/account/index.html"
if (Test-Path $accountHtmlPath) {
    Write-Host "5. 更新 $accountHtmlPath 资源版本号..." -ForegroundColor Gray
    $content = Get-Content $accountHtmlPath -Raw -Encoding UTF8
    $content = $content -replace 'account\.css\?v=[^"]+', "account.css?v=$NewVersion"
    $content = $content -replace 'account\.js\?v=[^"]+', "account.js?v=$NewVersion"
    Set-Content -Path $accountHtmlPath -Value $content -Encoding UTF8 -NoNewline
}

# 6. 更新 designs/website/index.html 官网主页资源版本号
$indexHtmlPath = "designs/website/index.html"
if (Test-Path $indexHtmlPath) {
    Write-Host "6. 更新 $indexHtmlPath 资源版本号..." -ForegroundColor Gray
    $content = Get-Content $indexHtmlPath -Raw -Encoding UTF8
    $content = $content -replace 'landing\.js\?v=[^"]+', "landing.js?v=$NewVersion"
    $content = $content -replace 'metaarc\.js\?v=[^"]+', "metaarc.js?v=$NewVersion"
    Set-Content -Path $indexHtmlPath -Value $content -Encoding UTF8 -NoNewline
}

# 7. 更新 server/metaarc/updates/latest.json 与 latest.example.json
foreach ($latestPath in @("server/metaarc/updates/latest.json", "server/metaarc/updates/latest.example.json")) {
    if (Test-Path $latestPath) {
        Write-Host "7. 更新 $latestPath 客户端发布清单..." -ForegroundColor Gray
        $latest = Get-Content $latestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($rel in $latest.releases) {
            $rel.version = $NewVersion
            $rel.download_url = $rel.download_url -replace 'MetaArc-[^/]+-(windows|macos|android)', "MetaArc-$NewVersion-`$1"
        }
        $latest | ConvertTo-Json -Depth 10 | Set-Content -Path $latestPath -Encoding UTF8
    }
}

# 8. 严格同步 designs/website/ 到 server/metaarc/public/
Write-Host "8. 同步前端静态资源到 server/metaarc/public/..." -ForegroundColor Gray
Copy-Item -Path "designs/website/*" -Destination "server/metaarc/public/" -Force -Recurse

# 9. 校验 SHA-256 1:1 匹配
Write-Host "9. 校验 SHA-256 匹配一致性..." -ForegroundColor Gray
$src = (Resolve-Path "designs/website").Path
$dst = (Resolve-Path "server/metaarc/public").Path
$files = Get-ChildItem -Path $src -Recurse -File
$diffs = 0
foreach ($f in $files) {
    $rel = $f.FullName.Substring($src.Length + 1)
    $target = Join-Path $dst $rel
    if (-not (Test-Path $target)) {
        Write-Host "Missing: $rel" -ForegroundColor Red
        $diffs++
    } else {
        $h1 = (Get-FileHash $f.FullName -Algorithm SHA256).Hash
        $h2 = (Get-FileHash $target -Algorithm SHA256).Hash
        if ($h1 -ne $h2) {
            Write-Host "Mismatch: $rel" -ForegroundColor Red
            $diffs++
        }
    }
}

if ($diffs -gt 0) {
    Write-Error "静态资源同步校验失败，存在 $diffs 个文件不匹配！"
    exit 1
}

Write-Host "✅ 版本升级完成！当前全库三位码版本: v$NewVersion (已完成 100% 静态校验)" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
