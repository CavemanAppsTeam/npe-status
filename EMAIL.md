# NPE status email (Resend)

Standalone email path for this repository. It does **not** depend on Larry-Brain, WhatsApp, Gmail OAuth, or n8n.

## Flow

```text
Upptime (this repo, GitHub Actions)
  → POST https://npe-uptime-relay.gabriel-049.workers.dev/?token=…
  → Cloudflare Worker (relay-worker/) emails via Resend
  → REDACTED_OPS@example.com
  → REDACTED_ALERTS@example.com

Daily digest (always, all monitors up or down):
  Worker cron at 09:00 Seattle time (America/Los_Angeles)
  → sendDailyDigest
  → same recipients

Every alert email also appends the full monitor list
(uptime + response time for each site).
```

Email is sent **only** through Resend. There is no Mailchannels fallback and no parallel n8n alert path.

## English-only outbound copy

The Worker authors every outbound subject and body in English. Webhook or API caller text is used only to classify the alert as UP, DOWN, or generic. Raw caller strings (including Portuguese Upptime secrets such as `NOTIFICATIONS_DOWN_MESSAGE` / `NOTIFICATIONS_UP_MESSAGE`) are never pasted into the email.

`POST /digest` always sends the fixed English daily digest. Custom `summary` / `text` bodies are ignored.

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
