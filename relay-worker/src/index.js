/**
 * Public relay for Upptime custom webhooks (npe-status).
 * Stores alerts in KV and emails recipients via Resend.
 *
 * Auth: Authorization: Bearer <UPTIME_RELAY_TOKEN>
 * POST / or /ingest — ingest alert → English email + KV
 * GET  /pending     — list pending alerts
 * POST /claim       — { ids: string[] } mark delivered
 * POST /email       — { text } classify up/down; send English alert email
 * POST /digest      — always send the English daily digest
 * GET  /summary     — preview auto digest text
 * GET  /health      — ok
 * Cron              — 09:00 Seattle (America/Los_Angeles) daily digest
 *                     (UTC 16:00 and 17:00; sends only at local hour 9)
 *
 * Outbound mail bodies are Worker-authored English only. Caller text is never pasted.
 *
 * Secrets (Wrangler): UPTIME_RELAY_TOKEN, RESEND_API_KEY, GITHUB_TOKEN,
 *                     ALERT_TO, RESEND_FROM, RESEND_FROM_NAME
 * Local copies live in a secrets file outside git (see scripts/sync-secrets.ps1).
 */

export function parseAlertRecipients(raw) {
  return String(raw || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function mailConfigFromEnv(env) {
  const to = parseAlertRecipients(env.ALERT_TO);
  const fromEmail = String(env.RESEND_FROM || "").trim();
  const fromName = String(env.RESEND_FROM_NAME || "NPE Status").trim() || "NPE Status";
  return { to, fromEmail, fromName };
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function unauthorized() {
  return json({ error: "unauthorized" }, 401);
}

function authed(request, env) {
  const token = String(env.UPTIME_RELAY_TOKEN || "").trim();
  if (!token) return false;
  const header = request.headers.get("Authorization") || "";
  if (header === `Bearer ${token}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("token") === token;
}

/** Classify webhook/caller text into a fixed alert kind. Raw text is never emailed. */
export function alertKindFromText(text) {
  const t = String(text || "");
  if (/\bUP\b|recovered|back online|restored/i.test(t)) return "up";
  if (/\bDOWN\b|degraded|offline|failed/i.test(t)) return "down";
  return "generic";
}

export function subjectFromText(text) {
  const kind = alertKindFromText(text);
  if (kind === "up") return "[NPE] UP / monitor recovered";
  if (kind === "down") return "[NPE] DOWN / monitor alert";
  return "[NPE] Status alert";
}

export function englishAlertLine(kind) {
  if (kind === "up") return "Monitor recovered (UP).";
  if (kind === "down") return "Monitor alert (DOWN).";
  return "Status alert.";
}

export function composeAlertBody(kind, summary) {
  return `${englishAlertLine(kind)}\n\n${summary}`;
}

export function composeDigestIntro(day) {
  return `NPE status / daily digest / ${day} / 09:00 Seattle time:`;
}

export function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function composeEmailHtml(text) {
  const body = escapeHtml(String(text || "").trim()).replace(/\n/g, "<br>\n");
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;">`,
    `<div>${body}</div>`,
    `</div>`,
  ].join("\n");
}

async function sendResend(env, subject, text) {
  const key = String(env.RESEND_API_KEY || "").trim();
  if (!key) return { ok: false, skipped: "no-resend-key" };
  const { to, fromEmail, fromName } = mailConfigFromEnv(env);
  if (!to.length) return { ok: false, skipped: "no-alert-recipients" };
  if (!fromEmail) return { ok: false, skipped: "no-resend-from" };
  const plain = String(text || "").trim();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to,
      subject,
      text: plain,
      html: composeEmailHtml(plain),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, provider: "resend", data };
}

async function sendEmail(env, subject, text) {
  return sendResend(env, subject, text);
}

const PACIFIC = "America/Los_Angeles";

function pacificNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

async function sendAlertEmail(env, text) {
  const kind = alertKindFromText(text);
  const summary = await buildStatusSummary(env);
  return sendEmail(env, subjectFromText(text), composeAlertBody(kind, summary));
}

const DIGEST_MONITORS = [
  { slug: "npe-production-homepage", label: "NPE production homepage" },
  { slug: "npe-worker-homepage", label: "NPE Worker homepage" },
  { slug: "estimate", label: "Estimate" },
  { slug: "services", label: "Services" },
  { slug: "contact", label: "Contact" },
];

async function githubRawJson(env, path) {
  const token = String(env.GITHUB_TOKEN || "").trim();
  if (!token) return null;
  const res = await fetch(
    `https://api.github.com/repos/CavemanAppsTeam/npe-status/contents/${path}`,
    {
      headers: {
        Accept: "application/vnd.github.raw",
        Authorization: `Bearer ${token}`,
        "User-Agent": "npe-uptime-relay",
      },
    },
  );
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export const MONITOR_SUMMARY_HEADING = "Monitors:";

async function buildStatusSummary(env) {
  const lines = [MONITOR_SUMMARY_HEADING];
  let any = false;
  for (const m of DIGEST_MONITORS) {
    const up = await githubRawJson(env, `api/${m.slug}/uptime.json`);
    const rt = await githubRawJson(env, `api/${m.slug}/response-time.json`);
    const upMsg = up && up.message ? String(up.message) : "?";
    const rtMsg = rt && rt.message ? String(rt.message) : "?";
    lines.push(`- ${m.label}: uptime ${upMsg}, response ${rtMsg}`);
    if (up || rt) any = true;
  }
  if (!any) {
    lines.push("Metrics unavailable.");
  }
  return lines.join("\n");
}

async function sendDailyDigest(env) {
  const { day } = pacificNow();
  const summary = await buildStatusSummary(env);
  return sendEmail(
    env,
    `[NPE] Daily status / ${day}`,
    `${composeDigestIntro(day)}\n\n${summary}`,
  );
}

async function listPending(env, limit = 50) {
  const listed = await env.ALERTS.list({ prefix: "pending:", limit });
  const out = [];
  for (const key of listed.keys) {
    const raw = await env.ALERTS.get(key.name);
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      out.push({ id: key.name, text: raw });
    }
  }
  out.sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  return out;
}

export default {
  async scheduled(_event, env, ctx) {
    const { hour, day } = pacificNow();
    if (hour !== 9) return;
    const key = `digest-sent:${day}`;
    if (await env.ALERTS.get(key)) return;
    const email = await sendDailyDigest(env);
    if (!email.ok) throw new Error("daily digest email failed");
    ctx.waitUntil(
      env.ALERTS.put(key, new Date().toISOString(), {
        expirationTtl: 60 * 60 * 36,
      }),
    );
  },

  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      const { to } = mailConfigFromEnv(env);
      return json({ ok: true, service: "npe-uptime-relay", recipientCount: to.length });
    }

    if (!authed(request, env)) return unauthorized();

    if (request.method === "POST" && (url.pathname === "/" || url.pathname === "/ingest")) {
      const contentType = request.headers.get("Content-Type") || "";
      let text = "";
      let payload = null;
      if (contentType.includes("application/json")) {
        payload = await request.json().catch(() => null);
        text =
          (payload && (payload.text || payload.message || payload.content)) ||
          JSON.stringify(payload);
      } else {
        text = await request.text();
      }
      text = String(text || "").trim();
      if (!text) return json({ error: "empty body" }, 400);

      const id = crypto.randomUUID();
      const record = {
        id,
        at: new Date().toISOString(),
        source: "upptime",
        text: text.slice(0, 4000),
        payload: payload && typeof payload === "object" ? payload : undefined,
      };
      await env.ALERTS.put(`pending:${id}`, JSON.stringify(record), {
        expirationTtl: 60 * 60 * 24 * 7,
      });

      const email = await sendAlertEmail(env, record.text);
      if (email.ok) {
        await env.ALERTS.put(`done:${id}`, JSON.stringify({ ...record, emailed: true }), {
          expirationTtl: 60 * 60 * 24 * 30,
        });
        await env.ALERTS.delete(`pending:${id}`);
      }

      return json({ ok: true, id, email });
    }

    if (request.method === "GET" && url.pathname === "/pending") {
      const pending = await listPending(env);
      return json({ ok: true, count: pending.length, pending });
    }

    if (request.method === "POST" && url.pathname === "/claim") {
      const body = await request.json().catch(() => ({}));
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      let claimed = 0;
      for (const id of ids) {
        const key = id.startsWith("pending:") ? id : `pending:${id}`;
        const raw = await env.ALERTS.get(key);
        if (!raw) continue;
        await env.ALERTS.put(`done:${id.replace(/^pending:/, "")}`, raw, {
          expirationTtl: 60 * 60 * 24 * 30,
        });
        await env.ALERTS.delete(key);
        claimed += 1;
      }
      return json({ ok: true, claimed });
    }

    if (request.method === "POST" && url.pathname === "/email") {
      const body = await request.json().catch(() => ({}));
      const text = String(body.text || body.summary || "").trim();
      if (!text) return json({ error: "missing text" }, 400);
      const email = await sendAlertEmail(env, text);
      if (!email.ok) return json({ ok: false, email }, 502);
      return json({ ok: true, email });
    }

    if (request.method === "POST" && url.pathname === "/digest") {
      const email = await sendDailyDigest(env);
      if (!email.ok) return json({ ok: false, email }, 502);
      return json({ ok: true, email });
    }

    if (request.method === "GET" && url.pathname === "/summary") {
      const summary = await buildStatusSummary(env);
      return json({ ok: true, summary });
    }

    return json({ error: "not found" }, 404);
  },
};
