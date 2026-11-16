# run-remote-test.ps1
$AskPassPath = "$PSScriptRoot\..\askpass.bat"
$env:SSH_ASKPASS = (Resolve-Path $AskPassPath).Path
$env:SSH_ASKPASS_REQUIRE = "force"
$env:DISPLAY = "dummy:0"

$SshExe = "C:\Program Files\Git\usr\bin\ssh.exe"
$ScpExe = "C:\Program Files\Git\usr\bin\scp.exe"
if (-not (Test-Path $SshExe)) { $SshExe = "ssh.exe" }
if (-not (Test-Path $ScpExe)) { $ScpExe = "scp.exe" }

$LocalScript = "$PSScriptRoot\test-phase4-features.mjs"
& $ScpExe -o StrictHostKeyChecking=no $LocalScript root@13.13.60.107:/tmp/test-phase4.mjs
& $SshExe -o StrictHostKeyChecking=no root@13.13.60.107 "docker cp /tmp/test-phase4.mjs metaarc-server:/app/test-phase4.mjs && docker exec metaarc-server node /app/test-phase4.mjs && rm -f /tmp/test-phase4.mjs"
