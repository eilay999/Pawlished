# Pulls a full copy of the Pawlished business data to THIS computer (an off-site backup that does
# not depend on Supabase). Meant to run weekly from Windows Task Scheduler - see OPERATIONS.md 11b.
#
# Needs one user-level environment variable, set once by the owner (never put the secret in this file):
#   BACKUP_EXPORT_SECRET   the same value as the BACKUP_EXPORT_SECRET set in Vercel
# Optional:
#   PAWLISHED_URL          default https://pawlished.vercel.app
#   PAWLISHED_BACKUP_DIR   default %USERPROFILE%\Documents\PawlishedBackups
#   PAWLISHED_BACKUP_KEEP  how many copies to keep (default 26, about half a year of weekly copies)
# The folder holds customers' personal data: keep it out of any public repository or shared drive.

$ErrorActionPreference = 'Stop'

$secret = [Environment]::GetEnvironmentVariable('BACKUP_EXPORT_SECRET', 'User')
if (-not $secret) { $secret = $env:BACKUP_EXPORT_SECRET }
if (-not $secret) { throw 'BACKUP_EXPORT_SECRET is not set (user environment variable).' }

$base = if ($env:PAWLISHED_URL) { $env:PAWLISHED_URL.TrimEnd('/') } else { 'https://pawlished.vercel.app' }
$dir = if ($env:PAWLISHED_BACKUP_DIR) { $env:PAWLISHED_BACKUP_DIR } else { Join-Path $env:USERPROFILE 'Documents\PawlishedBackups' }
$keep = if ($env:PAWLISHED_BACKUP_KEEP) { [int]$env:PAWLISHED_BACKUP_KEEP } else { 26 }

New-Item -ItemType Directory -Force -Path $dir | Out-Null

$stamp = Get-Date -Format 'yyyy-MM-dd'
$target = Join-Path $dir "pawlished-offsite-$stamp.json"
$partial = "$target.part"

try {
  Invoke-WebRequest -Uri "$base/api/reminders-run?export=backup" -Headers @{ Authorization = "Bearer $secret" } `
    -UseBasicParsing -TimeoutSec 120 -OutFile $partial

  # Never keep a broken or empty file as "the backup".
  $json = Get-Content -Raw -Encoding UTF8 -Path $partial | ConvertFrom-Json
  if (-not $json.exported_at -or ($json.customers.Count -eq 0 -and $json.appointments.Count -eq 0)) {
    throw 'The export came back empty or malformed.'
  }
  Move-Item -Force -Path $partial -Destination $target
  Write-Host ("OK: {0} customers, {1} appointments -> {2}" -f $json.customers.Count, $json.appointments.Count, $target)
}
catch {
  if (Test-Path $partial) { Remove-Item -Force $partial }
  Write-Error ("Backup FAILED: " + $_.Exception.Message)
  exit 1
}

# Keep only the newest copies.
Get-ChildItem -Path $dir -Filter 'pawlished-offsite-*.json' | Sort-Object Name -Descending | Select-Object -Skip $keep | Remove-Item -Force
