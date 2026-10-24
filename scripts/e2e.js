import "../src/env.js";
import fs from "node:fs";
import assert from "node:assert/strict";
import { observe, withBrowser } from "../src/browser.js";
const base = process.env.TEST_BASE || "http://127.0.0.1:4100";
let initialRemoteCalls = 0;
const evidenceDir = process.env.EVIDENCE_DIR || "evidence";
const results = [];
const started = Date.now();
async function api(path, body, role = "operator", expected = 200) {
  const r = await fetch(base + "/api" + path, {
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
  assert.equal(r.status, expected, JSON.stringify(j));
  return j;
}
async function fixture(mode) {
  const r = await fetch(
    "http://127.0.0.1:" + process.env.ORIGIN_PORT + "/__fixture/state",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.FIXTURE_ADMIN_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode }),
    },
  );
  assert.equal(r.status, 200);
}
async function test(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, pass: true, elapsedMs: Date.now() - start });
    console.log("PASS", name);
  } catch (e) {
    results.push({
      name,
      pass: false,
      error: e.message,
      elapsedMs: Date.now() - start,
    });
    console.error("FAIL", name, e.message);
  }
}
fs.mkdirSync(evidenceDir, { recursive: true });
await test("Unauthenticated API denied", async () =>
  assert.equal((await fetch(base + "/api/state")).status, 401));
await test("Operator cannot forge approver role", async () =>
  assert.equal(
    (
      await fetch(base + "/api/versions/unknown/decisions/x", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.OPERATOR_TOKEN,
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  ));
await test("Unauthorized origin route, private route and file denied", async () => {
  for (const p of [
    "/private",
    "/canary/private",
    "/.env",
    "/var/state.json",
    "/api/evidence/..%2f.env",
  ]) {
    const r = await fetch(base + p);
    assert.ok([400, 401, 403, 404, 409].includes(r.status), p + " " + r.status);
  }
});
await test("Submitted external/internal target URLs are rejected rather than crawled", async () => {
  await api(
    "/scan",
    { url: "http://169.254.169.254/latest/meta-data" },
    "operator",
    400,
  );
});
await test("Malformed Unicode capability fails authentication without comparison exception", async () => {
  const r = await fetch(base + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sugamya-Request": "1" },
    body: JSON.stringify({ token: "é".repeat(64) }),
  });
  assert.equal(r.status, 401);
});
await test("Owner installation challenge verified", async () => {
  const a = await api("/connect", {});
  assert.equal(a.target, (await api("/state")).target.id);
});
await fixture("normal");
let state = await api("/state");
initialRemoteCalls = state.model.calls;
if (state.state.active) await api("/disable", {});
let plan;
await test("Baseline is real, task-relevant proposals and coverage generated", async () => {
  plan = await api("/scan", {});
  assert.equal(plan.status, "staged");
  assert.equal(plan.manifest.operations.length, 4);
  assert.equal(plan.coverage.length, 55);
  assert.ok(
    plan.coverage
      .find((c) => c.id === "3.3.2")
      .status.includes("human-assisted"),
  );
  assert.equal(
    plan.coverage.find((c) => c.id === "1.2.1").status,
    "not-applicable",
  );
  fs.writeFileSync(
    evidenceDir + "/baseline-plan.json",
    JSON.stringify(plan, null, 2),
  );
});
if (plan) {
  const id = plan.manifest.id;
  await test("Semantic deployment blocked before approval", async () => {
    const r = await api("/versions/" + id + "/deploy", {}, "operator", 409);
    assert.match(r.error, /approval/);
  });
  await test("Human semantic approvals bind the actual manifest", async () => {
    for (const o of plan.manifest.operations.filter((o) => o.semantic)) {
      await api(
        "/versions/" + id + "/decisions/" + o.id,
        {
          action: "approve",
          reason:
            "Engineering evaluation: checked against owned fixture content and service task.",
        },
        "approver",
      );
    }
    const s = await api("/state");
    assert.equal(s.state.versions.at(-1).status, "approved");
  });
  await test("Canary gates and fresh-browser visitor deployment", async () => {
    const r = await api("/versions/" + id + "/deploy", {});
    fs.writeFileSync(
      evidenceDir + "/deployment-result.json",
      JSON.stringify(r, null, 2),
    );
    assert.equal(
      r.promoted,
      true,
      JSON.stringify(r.verification.checks.filter((c) => !c.pass)),
    );
    const repeated = await api(
      "/versions/" + id + "/deploy",
      {},
      "operator",
      409,
    );
    assert.match(repeated.error, /already active/);
  });
  await test("Ordinary visitor receives version, origin source response remains flawed", async () => {
    const r = await fetch(base + "/apply");
    assert.equal(r.headers.get("x-sugamya-version"), id);
    const html = await r.text();
    assert.ok(html.includes('aria-labelledby="name-label"'));
    const origin = await fetch(
      "http://127.0.0.1:" + process.env.ORIGIN_PORT + "/apply",
    ).then((r) => r.text());
    assert.ok(!origin.includes('aria-labelledby="name-label"'));
    const after = await observe(base + "/apply", {
      screenshotPath: evidenceDir + "/visitor-after.png",
    });
    fs.writeFileSync(
      evidenceDir + "/visitor-after.json",
      JSON.stringify(after.safe, null, 2),
    );
    assert.equal(
      after.safe.violations.length,
      0,
      JSON.stringify(after.safe.violations),
    );
  });
  await test("Emergency disable actually restores original visitor HTML", async () => {
    await api("/disable", {});
    const r = await fetch(base + "/apply");
    assert.equal(r.headers.get("x-sugamya-version"), "origin");
    assert.ok(!(await r.text()).includes('aria-labelledby="name-label"'));
  });
  await test("Reject semantic proposal prevents promotion", async () => {
    const p = await api("/scan", {}),
      o = p.manifest.operations.find((o) => o.semantic);
    await api(
      "/versions/" + p.manifest.id + "/decisions/" + o.id,
      {
        action: "reject",
        reason: "Evaluation rejection case: insufficient diagram description.",
      },
      "approver",
    );
    const r = await api(
      "/versions/" + p.manifest.id + "/deploy",
      {},
      "operator",
      409,
    );
    assert.match(r.error, /eligible/);
  });
  await test("Edited misleading proposal fails independent task gate and is not promoted", async () => {
    const p = await api("/scan", {}),
      id = p.manifest.id,
      o = p.manifest.operations.find((o) => o.attribute === "aria-label");
    await api(
      "/versions/" + id + "/decisions/" + o.id,
      {
        action: "edit",
        value: "Transfer funds",
        reason:
          "Controlled negative test only: intentionally wrong action name to exercise independent task gate.",
      },
      "approver",
    );
    let st = await api("/state"),
      v = st.state.versions.at(-1);
    for (const op of v.manifest.operations.filter(
      (op) => op.semantic && op.id !== o.id,
    ))
      await api(
        "/versions/" + id + "/decisions/" + op.id,
        {
          action: "approve",
          reason:
            "Controlled negative test: approve remaining semantic operations.",
        },
        "approver",
      );
    const r = await api("/versions/" + id + "/deploy", {});
    fs.writeFileSync(
      evidenceDir + "/failing-canary.json",
      JSON.stringify(r, null, 2),
    );
    assert.equal(r.promoted, false);
    assert.equal(
      r.verification.checks.find((c) => c.name === "service-task-keyboard")
        .pass,
      false,
    );
    assert.equal(
      (await fetch(base + "/apply")).headers.get("x-sugamya-version"),
      "origin",
    );
  });
  await test("Signed-in sensitive route never crawled or sent remotely", async () => {
    assert.equal((await fetch(base + "/private")).status, 403);
    const s = await api("/report");
    assert.equal(s.privacy.completedCalls, initialRemoteCalls);
    assert.ok(!JSON.stringify(s).includes("1234 5678 9012"));
  });
  await test("Dynamic hydration behavior is unsupported and observable", async () => {
    await withBrowser(base + "/dynamic", async (page) => {
      await page.goto(base + "/dynamic");
      assert.equal(
        await page.locator("#full-name").getAttribute("aria-label"),
        null,
      );
    });
    assert.equal(
      (await fetch(base + "/dynamic")).headers.get("x-sugamya-version"),
      "origin",
    );
  });
  await test("Restore a final valid approved and independently verified version", async () => {
    const p = await api("/scan", {});
    for (const o of p.manifest.operations.filter((o) => o.semantic))
      await api(
        "/versions/" + p.manifest.id + "/decisions/" + o.id,
        {
          action: "approve",
          reason:
            "Engineering fixture review; correct visible label, diagram context and submit action.",
        },
        "approver",
      );
    const r = await api("/versions/" + p.manifest.id + "/deploy", {});
    assert.equal(r.promoted, true);
  });
}
await test("Live stale response skips repair; independent failure really rolls back active pointer", async () => {
  await fixture("stale");
  try {
    const r = await fetch(base + "/apply");
    assert.equal(r.headers.get("x-sugamya-version"), "origin");
    assert.equal(
      r.headers.get("x-sugamya-skip"),
      "document-precondition-mismatch",
    );
    const vr = await api("/verify", {});
    assert.equal(vr.pass, false);
    const s = await api("/state");
    assert.equal(s.state.active, null);
    assert.ok(s.events.some((e) => e.type === "deployment.rolled-back"));
    fs.writeFileSync(
      evidenceDir + "/rollback-result.json",
      JSON.stringify(vr, null, 2),
    );
  } finally {
    await fixture("normal");
  }
});
await test("Origin outage preserves truthful status; no fabricated repair success", async () => {
  await fixture("unavailable");
  try {
    const r = await fetch(base + "/apply");
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("x-sugamya-version"), "origin");
    const q = await api("/scan", {}, "operator", 409);
    assert.match(q.error, /HTTP 503/);
  } finally {
    await fixture("normal");
  }
});
await test("Hydrated fixture state is observed and not silently repaired", async () => {
  await fixture("hydrate");
  try {
    const p = await api("/scan", {});
    const id = p.manifest.id;
    for (const o of p.manifest.operations.filter((o) => o.semantic))
      await api(
        "/versions/" + id + "/decisions/" + o.id,
        {
          action: "approve",
          reason: "Controlled hydration test; semantic content reviewed.",
        },
        "approver",
      );
    const d = await api("/versions/" + id + "/deploy", {});
    assert.equal(d.promoted, false);
    assert.equal(
      d.verification.checks.find(
        (c) => c.name === "manifest-effects-after-hydration",
      ).pass,
      false,
    );
    fs.writeFileSync(
      evidenceDir + "/hydration-result.json",
      JSON.stringify(d, null, 2),
    );
  } finally {
    await fixture("normal");
  }
});
await test("Final normal fixture version restored and visitor verified", async () => {
  const p = await api("/scan", {});
  for (const o of p.manifest.operations.filter((o) => o.semantic))
    await api(
      "/versions/" + p.manifest.id + "/decisions/" + o.id,
      {
        action: "approve",
        reason: "Engineering fixture review after negative tests.",
      },
      "approver",
    );
  const r = await api("/versions/" + p.manifest.id + "/deploy", {});
  assert.equal(r.promoted, true);
});
const report = await api("/report");
fs.writeFileSync(
  evidenceDir + "/run-report.json",
  JSON.stringify(report, null, 2),
);
const out = {
  environment: {
    node: process.version,
    platform: process.platform,
    base,
    at: new Date().toISOString(),
    extensions: false,
    fixture: "Deliberately seeded owned public fixture; not customer outcomes",
  },
  elapsedMs: Date.now() - started,
  results,
  passed: results.filter((r) => r.pass).length,
  total: results.length,
};
fs.writeFileSync(
  evidenceDir + "/e2e-results.json",
  JSON.stringify(out, null, 2),
);
console.log(
  JSON.stringify({
    passed: out.passed,
    total: out.total,
    elapsedMs: out.elapsedMs,
  }),
);
if (out.passed !== out.total) process.exitCode = 1;
