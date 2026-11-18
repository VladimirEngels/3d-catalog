param(
    [string]$BackupRoot = (Join-Path $env:USERPROFILE 'Backups/3D-Katalog')
)

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'backup.ps1'
$BackupRoot = [IO.Path]::GetFullPath($BackupRoot)

if ($BackupRoot.Contains('"') -or $script.Contains('"')) {
    throw 'Invalid path.'
}

$arguments = @(
    '-NoProfile'
    '-NonInteractive'
    '-WindowStyle Hidden'
    '-ExecutionPolicy Bypass'
    "-File `"$script`""
    "-BackupRoot `"$BackupRoot`""
) -join ' '

$action = New-ScheduledTaskAction -Execute "$PSHOME/powershell.exe" -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At '03:00'
$settingsOptions = @{
    StartWhenAvailable = $true
    MultipleInstances = 'IgnoreNew'
    AllowStartIfOnBatteries = $true
    DontStopIfGoingOnBatteries = $true
    RestartCount = 3
    RestartInterval = (New-TimeSpan -Minutes 15)
    ExecutionTimeLimit = [TimeSpan]::Zero
}
$settings = New-ScheduledTaskSettingsSet @settingsOptions

$principalOptions = @{
    UserId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    LogonType = 'Interactive'
    RunLevel = 'Limited'
}
$principal = New-ScheduledTaskPrincipal @principalOptions

$task = @{
    TaskName = '3D-Katalog Daily Backup'
    Action = $action
    Trigger = $trigger
    Settings = $settings
    Principal = $principal
}

if (Get-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue) {
    Set-ScheduledTask @task | Out-Null
} else {
    Register-ScheduledTask @task -Description 'Daily 03:00 PostgreSQL and model files backup.' | Out-Null
}

Write-Output 'Daily backup registered for 03:00; missed runs start when the user session is available. Failures retry three times at 15 minute intervals.'
