param(
  [string]$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $ProjectRoot "backups\$timestamp"
$dataDir = Join-Path $ProjectRoot "data"
$uploadsDir = Join-Path $ProjectRoot "uploads"

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$dbFile = Join-Path $dataDir "news.sqlite"
if (Test-Path $dbFile) {
  Copy-Item -LiteralPath $dbFile -Destination (Join-Path $backupDir "news.sqlite")
}

if (Test-Path $uploadsDir) {
  Compress-Archive -Path (Join-Path $uploadsDir "*") -DestinationPath (Join-Path $backupDir "uploads.zip") -Force
}

Write-Output "Backup created: $backupDir"
