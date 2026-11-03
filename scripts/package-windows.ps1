# MetaArc (元弧) - Windows 自动化打包流水线脚本
# 产出目标: 
#   1. 便携绿色版: dist/MetaArc-v<version>-windows-x64.zip
#   2. 安装引导包: dist/MetaArc-Setup-v<version>.exe
param(
    [string]$Version = "0.6.2"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🚀 开始打包 MetaArc (元弧) Windows 客户端 v$Version ..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

$DistDir = Join-Path $RootDir "dist"
if (!(Test-Path $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir | Out-Null
}

# 1. 确保 VC++ 运行库就绪
$VcRedistPath = Join-Path $RootDir "windows\packaging\exe\vc_redist.x64.exe"
if (!(Test-Path $VcRedistPath)) {
    Write-Host "📥 正在下载 VC++ 运行库安装程序..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://aka.ms/vc14/vc_redist.x64.exe" -OutFile $VcRedistPath
}

# 2. 编译 Flutter Windows Release 产物
Write-Host "🔨 正在编译 Flutter Windows Release 二进制..." -ForegroundColor Yellow
if (Get-Command fvm -ErrorAction SilentlyContinue) {
    fvm flutter build windows --release
} elseif (Get-Command flutter -ErrorAction SilentlyContinue) {
    flutter build windows --release
} else {
    Write-Host "⚠️ 未检测到全局 flutter/fvm，请确保构建环境中已配置 Flutter SDK。" -ForegroundColor Red
}

$BuildOutputDir = Join-Path $RootDir "build\windows\x64\runner\Release"

# 3. 打包便携绿色版 (ZIP)
if (Test-Path $BuildOutputDir) {
    $ZipPath = Join-Path $DistDir "MetaArc-v$Version-windows-x64.zip"
    Write-Host "📦 正在压缩便携绿色版: $ZipPath ..." -ForegroundColor Yellow
    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
    Compress-Archive -Path "$BuildOutputDir\*" -DestinationPath $ZipPath -CompressionLevel Optimal
    Write-Host "✅ 便携版生成完毕: $ZipPath" -ForegroundColor Green
} else {
    Write-Host "⚠️ 未找到编译产物目录: $BuildOutputDir (可在安装了 Flutter SDK 的机器上运行本脚本)" -ForegroundColor Yellow
}

# 4. Inno Setup 打包可执行安装引导包
$InnoCompiler = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (Test-Path $InnoCompiler) {
    Write-Host "⚙️ 正在通过 Inno Setup 编译安装包..." -ForegroundColor Yellow
    if (Get-Command fastforge -ErrorAction SilentlyContinue) {
        fastforge release --name release --jobs windows-exe --skip-clean
    } else {
        Write-Host "💡 提示: 可通过 'dart pub global activate fastforge' 使用 FastForge 全自动打包。" -ForegroundColor Gray
    }
} else {
    Write-Host "ℹ️ 提示: 未检测到 Inno Setup 6，跳过生成 Setup.exe (可安装 Inno Setup 开启安装包制作)。" -ForegroundColor Gray
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🎉 MetaArc Windows 打包流水线执行完毕！" -ForegroundColor Green
Write-Host "📁 发布产物目录: $DistDir" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
