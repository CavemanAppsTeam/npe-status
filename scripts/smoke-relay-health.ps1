# Smoke-check the deployed npe-uptime-relay /health endpoint.
# Asserts recipientCount >= 1 without printing recipient emails.
# Optional: set RELAY_BASE_URL or read it from the local secrets file.

$ErrorActionPreference = "Stop"
$envFile = if ($env:NPE_STATUS_ENV) { $env:NPE_STATUS_ENV } else { Join-Path $env:USERPROFILE "Desktop\services\npe-status\.env" }
$baseUrl = $env:RELAY_BASE_URL

if (-not $baseUrl -and (Test-Path -LiteralPath $envFile)) {
  Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -match '^RELAY_BASE_URL=(.+)$') {
      $baseUrl = $Matches[1].Trim()
    }
  }
}

if (-not $baseUrl) {
  $baseUrl = "https://npe-uptime-relay.gabriel-049.workers.dev"
}

$baseUrl = $baseUrl.TrimEnd("/")
$uri = "$baseUrl/health"
Write-Host "GET $uri"
$resp = Invoke-RestMethod -Uri $uri -Method GET
if (-not $resp.ok) {
  throw "Health check failed: ok is not true"
}
$count = [int]$resp.recipientCount
if ($count -lt 1) {
  throw "Health check failed: recipientCount=$count (expected >= 1). Sync ALERT_TO and redeploy."
}
Write-Host "Health OK (recipientCount=$count)"
