# npe-status operations

## Probe location

Uptime checks run on GitHub-hosted Actions runners. They are **not** pinned to Seattle via Globalping. Digest copy that mentions “09:00 Seattle time” refers only to the Worker cron timezone (`America/Los_Angeles`).

## GH_PAT (Upptime write access)

All generated Upptime workflows that commit (uptime history, graphs, README, status site / `gh-pages`) need a working `GH_PAT` repository secret.

Required capabilities (classic PAT or fine-grained equivalent):

- **Contents:** read and write (push commits to `master` / history files)
- **Actions:** read and write (workflow updates from Setup / Update Template)
- **Pages:** write (Static Site CI push to `gh-pages`)
- **Metadata:** read

Without these scopes, workflows fail with `403` / `Permission ... denied to github-actions[bot]` (seen during initial bootstrap on 2026-11-14).

Rotate or recreate the secret in GitHub → Settings → Secrets and variables → Actions → `GH_PAT` if pushes start failing again.

## Relay health and digest verification

```powershell
# After syncing secrets (or anytime):
powershell -File scripts/smoke-relay-health.ps1

# Last digest marker (auth required; no recipient PII):
# GET /digest-status with Authorization: Bearer <UPTIME_RELAY_TOKEN>
```

`GET /health` returns `recipientCount` only (never email addresses).

## Workers observability

`relay-worker/wrangler.toml` enables Cloudflare Workers Logs and Issues for `npe-uptime-relay`. After deploy, review errors in the Cloudflare dashboard under Workers → npe-uptime-relay → Observability / Logs. Check at least weekly for elevated exception or 5xx rates.
