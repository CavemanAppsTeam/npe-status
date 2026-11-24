# NPE status email (Resend)

Standalone email path for this repository. It does **not** depend on Larry-Brain, WhatsApp, Gmail OAuth, or n8n.

## Flow

```text
Upptime (this repo, GitHub Actions)
  → POST https://npe-uptime-relay.gabriel-049.workers.dev/?token=…
  → Cloudflare Worker (relay-worker/) emails via Resend
  → ops recipients from Worker env (ALERT_TO)

Daily digest (always, all monitors up or down):
  Worker cron at 09:00 Seattle time (America/Los_Angeles)
  → sendDailyDigest
  → same recipients

Every alert and digest email includes only the monitor results
(uptime + response time for each site). No Status page, repo, or
internal setup notes are appended.
```

Email is sent **only** through Resend. There is no Mailchannels fallback and no parallel n8n alert path.

Outbound messages are multipart (`text` + `html`) with the same monitor-only copy in both parts.

Uptime probes themselves run on GitHub-hosted runners (not Seattle). See [docs/ops.md](docs/ops.md).

## English-only outbound copy

The Worker authors every outbound subject and body in English. Webhook or API caller text is used only to classify the alert as UP, DOWN, or generic. Raw caller strings (including Portuguese Upptime secrets such as `NOTIFICATIONS_DOWN_MESSAGE` / `NOTIFICATIONS_UP_MESSAGE`) are never pasted into the email.

`POST /digest` always sends the fixed English daily digest. Custom `summary` / `text` bodies are ignored.

## Verify last digest

Authenticated `GET /digest-status` returns the latest `digest-sent:*` marker from KV (`seattleDay`, `sentToday`, `lastDigest.sentAt`) with no recipient emails.

## Resend

| Setting | Value |
| --- | --- |
| From / To | Worker secrets `RESEND_FROM`, `RESEND_FROM_NAME`, `ALERT_TO` (not stored in this repo) |

## Secrets (protected, outside git)

Keep tokens and recipient emails in a local secrets file outside git. Sync with:

```powershell
powershell -File scripts/sync-secrets.ps1
cd relay-worker
npx wrangler deploy
```

`sync-secrets.ps1` finishes with `scripts/smoke-relay-health.ps1` (`GET /health`, `recipientCount >= 1`).

Required keys: `UPTIME_RELAY_TOKEN`, `RESEND_API_KEY`, `GITHUB_TOKEN`, `ALERT_TO`, `RESEND_FROM`, `RESEND_FROM_NAME`.

## GitHub Actions secrets (this repo)

| Name | Purpose |
| --- | --- |
| `GH_PAT` | Token Upptime uses to push history/graphs/site (see [docs/ops.md](docs/ops.md)) |
| `NOTIFICATION_CUSTOM_WEBHOOK` | `true` |
| `NOTIFICATION_CUSTOM_WEBHOOK_URL` | Relay URL with `?token=<UPTIME_RELAY_TOKEN>` (never commit the real token) |
