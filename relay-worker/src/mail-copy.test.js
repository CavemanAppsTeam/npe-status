import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MONITOR_SUMMARY_HEADING,
  alertKindFromText,
  composeAlertBody,
  composeDigestIntro,
  composeEmailHtml,
  englishAlertLine,
  mailConfigFromEnv,
  parseAlertRecipients,
  subjectFromText,
} from "./index.js";

describe("English alert subjects", () => {
  it("uses fixed UP / DOWN / generic English subjects", () => {
    assert.equal(subjectFromText("Site is UP again"), "[NPE] UP / monitor recovered");
    assert.equal(subjectFromText("Monitor DOWN"), "[NPE] DOWN / monitor alert");
    assert.equal(subjectFromText("ping"), "[NPE] Status alert");
  });
});

describe("English alert bodies", () => {
  it("does not interpolate raw caller text into the body", () => {
    const poison = "ALERTA: site caiu — mensagem em português 🚨";
    const kind = alertKindFromText(poison);
    const summary = MONITOR_SUMMARY_HEADING;
    const body = composeAlertBody(kind, summary);

    assert.equal(kind, "generic");
    assert.equal(englishAlertLine(kind), "Status alert.");
    assert.equal(body, `Status alert.\n\n${summary}`);
    assert.ok(!body.includes(poison));
    assert.ok(!body.includes("português"));
    assert.ok(!body.includes("caiu"));
  });

  it("maps recovered / down keywords to English lines only", () => {
    assert.equal(
      composeAlertBody(alertKindFromText("recovered"), "summary"),
      "Monitor recovered (UP).\n\nsummary",
    );
    assert.equal(
      composeAlertBody(alertKindFromText("offline"), "summary"),
      "Monitor alert (DOWN).\n\nsummary",
    );
  });

  it("keeps monitor-only copy without internal footers", () => {
    const body = composeAlertBody("down", `${MONITOR_SUMMARY_HEADING}\n- Contact: uptime 100%, response 146 ms`);
    assert.equal(MONITOR_SUMMARY_HEADING, "Monitors:");
    assert.ok(!body.includes("Status page"));
    assert.ok(!body.includes("Repo:"));
    assert.ok(!body.includes("GITHUB_TOKEN"));
    assert.ok(!body.includes("probed from Seattle"));
  });
});

describe("Digest copy", () => {
  it("locks the summary heading and digest intro with ASCII separators", () => {
    assert.equal(MONITOR_SUMMARY_HEADING, "Monitors:");
    assert.equal(
      composeDigestIntro("2026-11-16"),
      "NPE status / daily digest / 2026-11-16 / 09:00 Seattle time:",
    );
    assert.ok(!composeDigestIntro("2026-11-16").includes("·"));
    assert.ok(!composeDigestIntro("2026-11-16").includes("—"));
  });
});

describe("HTML email body", () => {
  it("renders monitor text without a logo", () => {
    const plain = `${composeDigestIntro("2026-11-16")}\n\n${MONITOR_SUMMARY_HEADING}\n- Estimate: uptime 100%, response 149 ms`;
    const html = composeEmailHtml(plain);
    assert.ok(!html.includes("cavemanapps-logo"));
    assert.ok(!html.includes("<img"));
    assert.match(html, /Monitors:/);
    assert.ok(!html.includes("Status page"));
    assert.ok(!html.includes("Repo:"));
  });
});

describe("Mail config from env", () => {
  it("parses comma-separated recipients and from fields", () => {
    assert.deepEqual(parseAlertRecipients(" a@example.com , b@example.com "), [
      "a@example.com",
      "b@example.com",
    ]);
    const cfg = mailConfigFromEnv({
      ALERT_TO: "ops@example.com,alerts@example.com",
      RESEND_FROM: "alerts@example.com",
      RESEND_FROM_NAME: "NPE Status",
    });
    assert.deepEqual(cfg.to, ["ops@example.com", "alerts@example.com"]);
    assert.equal(cfg.fromEmail, "alerts@example.com");
    assert.equal(cfg.fromName, "NPE Status");
  });
});
