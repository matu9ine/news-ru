param(
  [string]$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $ProjectRoot "backups\$timestamp"

$envFile = Join-Path $ProjectRoot ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match "^\s*([^#][^=]+?)\s*=\s*(.*)\s*$") {
      $name = $matches[1].Trim()
      $value = $matches[2].Trim().Trim('"').Trim("'")
      if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
      }
    }
  }
}

function Resolve-AppPath([string]$Value, [string]$Fallback) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $Fallback }
  if ([System.IO.Path]::IsPathRooted($Value)) { return $Value }
  return (Join-Path $ProjectRoot $Value)
}

$dataDir = Resolve-AppPath $env:DATA_DIR (Join-Path $ProjectRoot "data")
$uploadsDir = Resolve-AppPath $env:UPLOADS_DIR (Join-Path $ProjectRoot "uploads")

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$dbFile = Join-Path $dataDir "news.sqlite"
if (Test-Path $dbFile) {
  Push-Location $ProjectRoot
  try {
    node -e "require('dotenv').config(); const { db } = require('./src/db'); db.pragma('wal_checkpoint(TRUNCATE)'); db.close();"
  } finally {
    Pop-Location
  }
  Copy-Item -LiteralPath $dbFile -Destination (Join-Path $backupDir "news.sqlite") -Force
  foreach ($suffix in @("-wal", "-shm")) {
    $sidecar = "$dbFile$suffix"
    if (Test-Path $sidecar) {
      Copy-Item -LiteralPath $sidecar -Destination (Join-Path $backupDir ("news.sqlite" + $suffix)) -Force
    }
  }
}

if (Test-Path $uploadsDir) {
  Compress-Archive -Path (Join-Path $uploadsDir "*") -DestinationPath (Join-Path $backupDir "uploads.zip") -Force
}

Write-Output "Backup created: $backupDir"
