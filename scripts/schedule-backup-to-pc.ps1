# Registers a weekly Windows scheduled task that runs backup-to-pc.ps1 (Sunday 21:00).
# Run once, from a normal (non-admin) PowerShell, after setting BACKUP_EXPORT_SECRET.
$script = Join-Path $PSScriptRoot 'backup-to-pc.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 9pm
# StartWhenAvailable: if the computer was off on Sunday, run as soon as it is on again.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'Pawlished weekly backup' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host 'Scheduled: Pawlished weekly backup (Sundays 21:00).'
