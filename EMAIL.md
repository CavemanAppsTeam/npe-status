# NPE status email (Resend)

Standalone email path for this repository. It does **not** depend on Larry-Brain.

## Flow

```text
Upptime (this repo, GitHub Actions)
  → POST https://npe-uptime-relay.gabriel-049.workers.dev/?token=…
  → Cloudflare Worker (relay-worker/) emails via Resend
  → REDACTED_OPS@example.com
  → REDACTED_ALERTS@example.com

Daily digest (always, all monitors up or down):
  Worker cron at 09:00 America/Los_Angeles
  → POST-equivalent sendDailyDigest
  → same recipients

Every alert email also appends the full monitor list
(uptime + response time for each site).
```

## Resend

| Setting | Value |
| --- | --- |
| Domain | `cavemanapps.ia.br` (verified) |
| From | `NPE Status <REDACTED_FROM@example.com>` |
| To | `REDACTED_OPS@example.com`, `REDACTED_ALERTS@example.com` |

## Secrets (protected, outside git)

Local file only:

`[LOCAL_SECRETS_DIR]\.env`

Contains: `UPTIME_RELAY_TOKEN`, `RESEND_API_KEY`, `GITHUB_TOKEN`.

Sync to Cloudflare:

```powershell
powershell -File scripts/sync-secrets.ps1
cd relay-worker
npx wrangler deploy
```

## GitHub Actions secrets (this repo)

| Name | Purpose |
| --- | --- |
| `NOTIFICATION_CUSTOM_WEBHOOK` | `true` |
| `NOTIFICATION_CUSTOM_WEBHOOK_URL` | `https://npe-uptime-relay.gabriel-049.workers.dev/?token=<UPTIME_RELAY_TOKEN>` |

## n8n workflows

Import from `n8n/`:

- `NPE Upptime · Alert email poller`
- `NPE Upptime · Daily digest 09:00 PT` (optional; the Worker cron already sends this digest)

Credential: Header Auth `Authorization: Bearer <UPTIME_RELAY_TOKEN>` named **NPE Uptime Relay Bearer**.
Email is sent by the Worker (Resend), not by Gmail OAuth in n8n.
