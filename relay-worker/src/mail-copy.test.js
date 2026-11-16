import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MONITOR_SUMMARY_HEADING,
  alertKindFromText,
  composeAlertBody,
  composeDigestIntro,
  englishAlertLine,
  subjectFromText,
} from "./index.js";

describe("English alert subjects", () => {
  it("uses fixed UP / DOWN / generic English subjects", () => {
    assert.equal(subjectFromText("Site is UP again"), "[NPE] UP — monitor recovered");
    assert.equal(subjectFromText("Monitor DOWN"), "[NPE] DOWN — monitor alert");
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
});

describe("Seattle digest copy", () => {
  it("locks the summary heading and digest intro", () => {
    assert.match(MONITOR_SUMMARY_HEADING, /probed from Seattle/);
    assert.equal(
      composeDigestIntro("2026-11-16"),
      "NPE status · daily digest · 2026-11-16 · 09:00 Seattle time",
    );
  });
});
