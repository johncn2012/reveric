# run-remote-test.ps1
param(
    [string]$ScriptFile = "test-phase5-features.mjs"
)
$AskPassPath = "$PSScriptRoot\..\askpass.bat"
$env:SSH_ASKPASS = (Resolve-Path $AskPassPath).Path
$env:SSH_ASKPASS_REQUIRE = "force"
$env:DISPLAY = "dummy:0"

$SshExe = "C:\Program Files\Git\usr\bin\ssh.exe"
$ScpExe = "C:\Program Files\Git\usr\bin\scp.exe"
if (-not (Test-Path $SshExe)) { $SshExe = "ssh.exe" }
if (-not (Test-Path $ScpExe)) { $ScpExe = "scp.exe" }

$LocalScript = "$PSScriptRoot\$ScriptFile"
& $ScpExe -o StrictHostKeyChecking=no $LocalScript root@13.13.60.107:/tmp/$ScriptFile
& $SshExe -o StrictHostKeyChecking=no root@13.13.60.107 "docker cp /tmp/$ScriptFile metaarc-server:/app/$ScriptFile && docker exec metaarc-server node /app/$ScriptFile && rm -f /tmp/$ScriptFile"
