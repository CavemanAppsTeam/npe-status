# Push npe-status relay secrets from Desktop\services into Cloudflare Wrangler.
# Secrets file (outside git): [LOCAL_SECRETS_DIR]\.env

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = "[LOCAL_SECRETS_DIR]\.env"
$wranglerConfig = Join-Path $repoRoot "relay-worker\wrangler.toml"

if (-not (Test-Path -LiteralPath $envFile)) {
  throw "Missing secrets file: $envFile"
}
if (-not (Test-Path -LiteralPath $wranglerConfig)) {
  throw "Missing wrangler.toml: $wranglerConfig"
}

$map = @{}
Get-Content -LiteralPath $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $i = $line.IndexOf("=")
  if ($i -lt 1) { return }
  $map[$line.Substring(0, $i).Trim()] = $line.Substring($i + 1).Trim()
}

$required = @("UPTIME_RELAY_TOKEN", "RESEND_API_KEY", "GITHUB_TOKEN")
foreach ($name in $required) {
  if (-not $map.ContainsKey($name) -or -not $map[$name]) {
    throw "Missing $name in $envFile"
  }
}

Push-Location (Join-Path $repoRoot "relay-worker")
try {
  foreach ($name in $required) {
    Write-Host "Uploading secret $name ..."
    $map[$name] | npx --yes wrangler secret put $name -c $wranglerConfig
  }
  Write-Host "Done. Deploy with: npx wrangler deploy -c `"$wranglerConfig`""
} finally {
  Pop-Location
}
