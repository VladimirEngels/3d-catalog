param([string]$BackupRoot = (Join-Path $env:USERPROFILE 'Backups/3D-Katalog'))
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$dockerExe = (Get-Command docker.exe -ErrorAction SilentlyContinue).Source
if (!$dockerExe) { $dockerExe = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe' }
$compose = @('compose', '--env-file', "$projectRoot/.env", '-f', "$PSScriptRoot/compose.yaml", '-p', 'my-app')

function Docker {
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & $dockerExe @args 2>&1
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($code -ne 0) { throw "Docker failed (exit $code): $($args -join ' ')" }
    $output | ForEach-Object { $_.ToString() }
}
function Compose { Docker @compose @args }

$BackupRoot = [IO.Path]::GetFullPath($BackupRoot).TrimEnd('\')
if ($BackupRoot -eq $projectRoot -or $BackupRoot.StartsWith($projectRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Backups must be outside the repository.'
}
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
$snapshot = Join-Path $BackupRoot ('db-models-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N'))
$lock = $null
$stopped = $false
$failure = $null
try {
    $lock = [IO.File]::Open((Join-Path $BackupRoot 'backup.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    $appId = (Compose ps -q app | Out-String).Trim()
    $dbId = (Compose ps -q db | Out-String).Trim()
    if (!$appId -or !$dbId) { throw 'Application and database must be running.' }
    New-Item -ItemType Directory -Path "$snapshot/models" -Force | Out-Null
    $stopped = $true
    Compose stop app | Out-Null
    Compose exec -T db pg_dump -U catalog -d catalog_3d --format=custom --no-owner --no-acl -f /tmp/catalog-backup.dump | Out-Null
    Compose exec -T db pg_restore --list /tmp/catalog-backup.dump | Out-Null
    Compose cp db:/tmp/catalog-backup.dump "$snapshot/database.dump" | Out-Null
    Compose cp app:/app/backend/storage/models/. "$snapshot/models" | Out-Null
    if ((Get-Item -LiteralPath "$snapshot/database.dump").Length -eq 0) { throw 'Database dump is empty.' }
} catch {
    $failure = $_.Exception.Message
} finally {
    if ($stopped) {
        try { Compose start --wait app | Out-Null } catch { $failure = "$failure Application restart failed." }
        try { Compose exec -T db rm -f /tmp/catalog-backup.dump | Out-Null } catch { $failure = "$failure Temporary dump cleanup failed." }
    }
    if ($lock) { $lock.Dispose() }
}
if ($failure) {
    "$(Get-Date -Format o) ERROR $failure" | Add-Content -LiteralPath "$BackupRoot/backup.log"
    throw $failure
}
"$(Get-Date -Format o) OK $snapshot" | Add-Content -LiteralPath "$BackupRoot/backup.log"
Write-Output "Backup completed: $snapshot"
