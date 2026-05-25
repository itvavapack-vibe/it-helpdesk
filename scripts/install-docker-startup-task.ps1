$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$startScript = Join-Path $projectRoot 'scripts\start-docker-detached.ps1'
$taskName = 'IT Helpdesk Docker'

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`""

$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Start IT Helpdesk Docker containers in detached mode' `
  -Force | Out-Null

Write-Host "Installed scheduled task: $taskName"
Write-Host "It will run docker compose up -d --build at user logon."
