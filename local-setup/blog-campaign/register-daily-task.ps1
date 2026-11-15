# Registers a daily 08:30 scheduled task that opens Claude with the blog prompt.
# ASCII only - do not add Korean here. Run once: .\register-daily-task.ps1
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$runScript = Join-Path $here "run-daily.ps1"
$taskName = "UNHO Daily Blog Draft"

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoExit -ExecutionPolicy Bypass -File `"$runScript`""
$trigger = New-ScheduledTaskTrigger -Daily -At "08:30"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Force | Out-Null

Write-Host "Registered: '$taskName' runs daily at 08:30." -ForegroundColor Green
Write-Host "A Claude window will open each morning with the day's draft task."
Write-Host "To remove: Unregister-ScheduledTask -TaskName '$taskName'"
