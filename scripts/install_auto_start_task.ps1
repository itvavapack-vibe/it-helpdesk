$ErrorActionPreference = 'Stop'

$taskName = 'IT Helpdesk Auto Start'
$startupScript = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'start_prod_on_login.ps1')).Path

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startupScript`""

$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description 'Start IT Helpdesk deploy web and production project after Windows logon.' `
    -Force | Out-Null

Write-Host "Installed scheduled task: $taskName"
Write-Host "Startup script: $startupScript"
