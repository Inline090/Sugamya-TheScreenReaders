// Actual product recording. Pacing pauses are presentation holds, never simulated progress.
// Main deployment reuses the exact manifest the project owner explicitly approved.
// The second site's misleading-name experiment is an isolated, labeled engineering fixture.
import "../src/env.js";
import { chromium } from "playwright";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:4100",
  second = "http://127.0.0.1:4200",
  publicURL = process.env.PUBLIC_BASE;
if (!publicURL) throw Error("PUBLIC_BASE required");
async function api(host, path, body, role = "operator") {
  const r = await fetch(host + "/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization:
        "Bearer " +
        process.env[role === "approver" ? "APPROVER_TOKEN" : "OPERATOR_TOKEN"],
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error);
  return j;
}
fs.mkdirSync("var-recording", { recursive: true });
fs.mkdirSync("artifacts", { recursive: true });
const b = await chromium.launch(),
  clips = [];
const initial = (await api(base, "/state")).state.active;
async function clip(name, caption, host, fn, auth = false) {
  const c = await b.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: "var-recording", size: { width: 1280, height: 720 } },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  if (auth)
    await c.request.post(host + "/api/session", {
      headers: { "X-Sugamya-Request": "1" },
      data: { token: process.env.OPERATOR_TOKEN },
    });
  const p = await c.newPage();
  p.setDefaultTimeout(15000);
  try {
    await fn(p, c);
  } finally {
    await c.close();
  }
  const video = await p.video().path();
  const file = "var-recording/" + name + ".mp4";
  const text = "var-recording/" + name + ".txt";
  fs.writeFileSync(text, caption);
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      video,
      "-vf",
      `pad=iw:ih+96:0:0:black,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile=${text}:fontcolor=white:fontsize=20:line_spacing=8:x=22:y=h-77`,
      "-r",
      "20",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "25",
      "-pix_fmt",
      "yuv420p",
      "-an",
      file,
    ],
    { stdio: "inherit" },
  );
  const duration = Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      file,
    ]).toString(),
  );
  clips.push({ name, file, duration, caption });
  console.log("Recorded", name, duration.toFixed(1) + "s");
}
try {
  await clip(
    "01-before",
    "Recorded working product | Owned fixture, not a government service.\nBefore: the accessible-name task cannot find the required Full name field.",
    "http://127.0.0.1:4101",
    async (p) => {
      await p.goto("http://127.0.0.1:4101/apply");
      await p.waitForTimeout(4000);
      await p
        .getByRole("textbox", { name: "Full name", exact: true })
        .fill("Test Resident", { timeout: 3000 })
        .then(
          () => {
            throw Error("Expected baseline barrier absent");
          },
          () => {},
        );
      await p.waitForTimeout(2000);
    },
  );
  await clip(
    "02-control",
    "The owner-approved version is disabled, then genuinely redeployed through the proxy.\nMeaning-changing values were explicitly approved by the project owner; source is untouched.",
    base,
    async (p) => {
      await p.goto(base);
      await p.locator("#console").waitFor();
      await p
        .getByRole("button", { name: "Emergency disable", exact: true })
        .click();
      await p
        .locator("#notice")
        .filter({ hasText: "Emergency disable completed." })
        .waitFor();
      await p.waitForTimeout(4000);
      await p.locator("#proposals").scrollIntoViewIfNeeded();
      await p.waitForTimeout(4500);
      await p
        .locator("article")
        .filter({ hasText: "1.1.1 · #desk-map" })
        .scrollIntoViewIfNeeded();
      await p.waitForTimeout(5000);
      await p
        .getByRole("button", { name: "Run canary & deploy", exact: true })
        .click();
      await p
        .locator("#notice")
        .filter({
          hasText: "Independent canary & visitor deployment completed.",
        })
        .waitFor({ timeout: 30000 });
      await p.locator("#overview").scrollIntoViewIfNeeded();
      await p.waitForTimeout(4000);
      assert.equal((await api(base, "/state")).state.verification.pass, true);
    },
    true,
  );
  await clip(
    "03-public",
    "Fresh browser profile | No extension, operator session, or cookies.\nPublic HTTPS gateway: keyboard submission succeeds; no source patch was installed.",
    publicURL,
    async (p, c) => {
      assert.equal((await c.cookies()).length, 0);
      const response = await p.goto(publicURL + "/apply");
      assert.equal(response.headers()["x-sugamya-version"], initial);
      await p.waitForTimeout(3500);
      await p
        .getByRole("textbox", { name: "Full name", exact: true })
        .fill("Test Resident");
      await p.waitForTimeout(1200);
      await p
        .getByRole("textbox", { name: "Email address", exact: true })
        .fill("resident@example.test");
      await p.waitForTimeout(1200);
      await p.keyboard.press("Tab");
      await p.keyboard.press("Enter");
      await p
        .locator("#result")
        .filter({ hasText: "Application received." })
        .waitFor();
      await p.waitForTimeout(5000);
    },
  );
  // Prepare an actual deliberately misleading candidate on the separate engineering fixture.
  await api(second, "/disable", {});
  const plan = await api(second, "/scan", {});
  const id = plan.manifest.id,
    wrong = plan.manifest.operations.find((o) => o.attribute === "aria-label");
  await api(
    second,
    "/versions/" + id + "/decisions/" + wrong.id,
    {
      action: "edit",
      value: "Transfer funds",
      reason:
        "CONTROLLED NEGATIVE FIXTURE: deliberately wrong action name; automated test decision, not human content approval.",
    },
    "approver",
  );
  for (const o of plan.manifest.operations.filter(
    (o) => o.semantic && o.id !== wrong.id,
  ))
    await api(
      second,
      "/versions/" + id + "/decisions/" + o.id,
      {
        action: "approve",
        reason:
          "CONTROLLED NEGATIVE FIXTURE: automated test of independent canary rejection.",
      },
      "approver",
    );
  await clip(
    "04-canary",
    "Controlled negative fixture | Test approval is intentionally wrong: “Transfer funds”.\nThe independent task gate rejects it. No promotion; visitors retain the original version.",
    second,
    async (p) => {
      await p.goto(second);
      await p
        .locator("article")
        .filter({ hasText: "4.1.2 · #submit" })
        .scrollIntoViewIfNeeded();
      await p.waitForTimeout(4500);
      await p
        .getByRole("button", { name: "Run canary & deploy", exact: true })
        .click();
      await p
        .locator("#notice")
        .filter({ hasText: "Canary rejected." })
        .waitFor({ timeout: 30000 });
      await p.locator("#verification").scrollIntoViewIfNeeded();
      const detail = p
        .locator("#verification-list details")
        .filter({ hasText: "service task keyboard" });
      await detail.locator("summary").click();
      await detail.scrollIntoViewIfNeeded();
      await p.waitForTimeout(6500);
      assert.equal((await api(second, "/state")).state.active, null);
    },
    true,
  );
  await clip(
    "05-evidence",
    "Replayable decisions, honest coverage, and forecast-only business value.\n4 seeded axe instances to 0; automated task 0/3 to 3/3. No conformance or user-study claim.",
    base,
    async (p) => {
      await p.goto(base + "/#coverage");
      await p.getByRole("combobox").selectOption("unresolved");
      await p.locator("#coverage").scrollIntoViewIfNeeded();
      await p.waitForTimeout(4500);
      await p.locator("#roi").scrollIntoViewIfNeeded();
      await p
        .getByRole("button", { name: "Calculate forecast", exact: true })
        .click();
      await p.waitForTimeout(4500);
      await p.locator("#trace").scrollIntoViewIfNeeded();
      const download = p.waitForEvent("download");
      await p
        .getByRole("link", { name: "Download report JSON", exact: true })
        .click();
      await (
        await download
      ).saveAs("var-recording/actual-downloaded-report.json");
      await p.waitForTimeout(4000);
    },
    true,
  );
  const concat = "var-recording/concat.txt";
  fs.writeFileSync(concat, clips.map((x) => `file '${x.name}.mp4'`).join("\n"));
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concat,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      "artifacts/Sugamya-demo.mp4",
    ],
    { stdio: "inherit" },
  );
  const record = {
    at: new Date().toISOString(),
    label:
      "Actual recorded product behavior, captioned; not a live action and no voice narration",
    mainVersion: initial,
    publicURL,
    clips: clips.map(({ name, duration, caption }) => ({
      name,
      duration,
      caption,
    })),
    durationSeconds: clips.reduce((n, c) => n + c.duration, 0),
    bytes: fs.statSync("artifacts/Sugamya-demo.mp4").size,
    negativeFixture:
      "Separate second-client origin/gateway, intentionally misleading test manifest. No human approval is fabricated.",
  };
  fs.writeFileSync(
    "evidence/recording-manifest.json",
    JSON.stringify(record, null, 2),
  );
  assert.ok(record.durationSeconds < 180);
  assert.ok(record.bytes < 50e6);
  console.log(JSON.stringify(record, null, 2));
} finally {
  await b.close();
  const s = await api(base, "/state");
  if (s.state.disabled || !s.state.active)
    await api(base, "/versions/" + initial + "/deploy", {});
}
