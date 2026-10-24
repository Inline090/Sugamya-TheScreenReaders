// Automated engineering fixture decisions, not human-user evidence. Never run against customer data.
import "../src/env.js";
import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const b = await chromium.launch(),
  c = await b.newContext({ viewport: { width: 1440, height: 1000 } }),
  p = await c.newPage(),
  steps = [];
const base = "http://127.0.0.1:4200";
p.setDefaultTimeout(15000);
async function done(text) {
  await p
    .locator("#notice")
    .filter({ hasText: text + " completed." })
    .waitFor();
  steps.push(text);
}
async function login(role) {
  await p
    .getByLabel("Access token", { exact: true })
    .fill(
      process.env[role === "approver" ? "APPROVER_TOKEN" : "OPERATOR_TOKEN"],
    );
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await done("Sign in");
}
async function logout() {
  await p.getByRole("button", { name: "Sign out", exact: true }).click();
  await done("Sign out");
}
try {
  await p.goto(base);
  await login("operator");
  await p
    .getByRole("button", { name: "Emergency disable", exact: true })
    .click();
  await done("Emergency disable");
  await p.getByRole("button", { name: "Observe & plan", exact: true }).click();
  await done("Observe & plan");
  assert.equal(
    await p
      .getByRole("button", { name: "Run canary & deploy", exact: true })
      .isDisabled(),
    true,
  );
  await p
    .getByRole("button", {
      name: "Review optional AI data request",
      exact: true,
    })
    .click();
  await p
    .getByText("No request has been sent yet.", { exact: false })
    .waitFor();
  steps.push(
    "Real minimized-payload consent preview shown; no inference request sent",
  );
  await logout();
  await login("approver");
  let article = p.locator("article").filter({ hasText: "1.1.1 · #desk-map" });
  await article
    .getByLabel("Reviewed value", { exact: true })
    .fill("Engineering fixture review: route from entrance to service desk.");
  await article
    .getByLabel("Decision rationale", { exact: true })
    .fill("Automated UI fixture test only; exercise edit path.");
  await article
    .getByRole("button", { name: "Edit & approve", exact: true })
    .click();
  await done("Semantic edit");
  for (const criterion of ["3.3.2", "4.1.2"]) {
    article = p.locator("article").filter({ hasText: criterion + " ·" });
    await article
      .getByLabel("Decision rationale", { exact: true })
      .fill("Automated UI fixture test; verify review controls.");
    await article.getByRole("button", { name: "Approve", exact: true }).click();
    await done("Semantic approve");
  }
  await logout();
  await login("operator");
  await p
    .getByRole("button", { name: "Run canary & deploy", exact: true })
    .click();
  await done("Independent canary & visitor deployment");
  await p.getByRole("button", { name: "Re-verify", exact: true }).click();
  await done("Visitor verification");
  await p.screenshot({ path: "evidence/ui-workflow-verified.png" });
  const r = await c.request.get(base + "/api/state");
  const s = await r.json();
  assert.equal(s.state.verification.pass, true);
  fs.writeFileSync(
    "evidence/ui-workflow.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        fixture:
          "Independent second-client fixture; automated capability-role UI test, not human decisions",
        steps,
        version: s.state.active,
        pass: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS browser UI workflow: " + steps.length + " actions/observations",
  );
} finally {
  await b.close();
}
