param([string]$Destination = "")
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$depthRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$depthWork = Join-Path $depthRoot "build/depth-native"
New-Item -ItemType Directory -Force $depthWork | Out-Null
$depthArchive = Join-Path $depthWork "onnxruntime-win-x64-1.31.0.zip"
$depthHash = "3958d8a44984160692c1b4ffd0de3cb48f8c39f9d34bb31e433db06e30b82195"
if (!(Test-Path $depthArchive)) {
  $downloadUrls = @(
    "https://assets.metaarc.com.cn/build-cache/onnxruntime-win-x64-1.31.0.zip",
    "https://github.com/microsoft/onnxruntime/releases/download/v1.31.0/onnxruntime-win-x64-1.31.0.zip"
  )
  $success = $false
  foreach ($url in $downloadUrls) {
    try {
      Write-Host "Downloading ONNX Runtime from $url..."
      Invoke-WebRequest $url -OutFile "$depthArchive.part"
      if ((Get-FileHash "$depthArchive.part" -Algorithm SHA256).Hash.ToLower() -eq $depthHash) {
        $success = $true
        break
      }
    } catch {
      Write-Warning "Failed to download or verify from $url: $_"
    }
  }
  if (!$success) {
    throw "ONNX Runtime checksum mismatch or all download sources failed"
  }
  Move-Item "$depthArchive.part" $depthArchive
}
if ((Get-FileHash $depthArchive -Algorithm SHA256).Hash.ToLower() -ne $depthHash) { throw "ONNX Runtime checksum mismatch" }
Expand-Archive $depthArchive -DestinationPath $depthWork -Force
if (!$Destination) { $Destination = Join-Path $depthWork "product-windows" }
cmake -S $PSScriptRoot -B "$depthWork/native-windows" -A x64 -DBUILD_TESTING=OFF "-DORT_ROOT=$depthWork/onnxruntime-win-x64-1.31.0"
if ($LASTEXITCODE -ne 0) { throw "Depth configure failed" }
cmake --build "$depthWork/native-windows" --config Release --parallel 4
if ($LASTEXITCODE -ne 0) { throw "Depth build failed" }
cmake --install "$depthWork/native-windows" --config Release --prefix $Destination
if ($LASTEXITCODE -ne 0) { throw "Depth install failed" }
