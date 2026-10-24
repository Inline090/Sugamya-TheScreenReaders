import test from "node:test";
import assert from "node:assert/strict";
import { Manifest, Operation, Decision, Target } from "../src/contracts.js";
import { transform, approvalsComplete } from "../src/transform.js";
import { hash } from "../src/store.js";
import { remotePayload } from "../src/privacy.js";
import { plan, coverage } from "../src/planner.js";
import { Store } from "../src/store.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const html =
  '<!DOCTYPE html><html lang="en"><head><title>T</title></head><body><p id="name-label">Full name</p><input id="full-name"></body></html>';
const op = {
  id: "op",
  criterion: "3.3.2",
  selector: "#full-name",
  attribute: "aria-labelledby",
  before: null,
  value: "name-label",
  semantic: true,
  reason: "Existing visible label association requires review",
};
const manifest = {
  id: "version",
  target: "test",
  path: "/apply",
  locale: "en",
  baselineHash: hash(html),
  createdAt: new Date().toISOString(),
  operations: [op],
};
const target = { id: "test" };
const version = () => ({ manifest: structuredClone(manifest), approvals: [] });
const approve = (v) =>
  v.approvals.push({
    action: "approve",
    operation: "op",
    operationHash: hash(v.manifest.operations[0]),
    manifestHash: hash(v.manifest),
  });
test("Constrained operation rejects arbitrary JavaScript/HTML/selector/class", () => {
  for (const change of [
    { attribute: "onclick", value: "alert(1)" },
    { selector: "body *" },
    { value: "<script>alert(1)</script>" },
    { attribute: "class", value: "custom", semantic: false },
    { semantic: false },
  ])
    assert.equal(Operation.safeParse({ ...op, ...change }).success, false);
});
test("Schema rejects unknown model fields instead of executing instructions", () => {
  assert.equal(
    Operation.safeParse({ ...op, execute: "fetch secrets" }).success,
    false,
  );
  assert.equal(
    Manifest.safeParse({ ...manifest, script: "alert(1)" }).success,
    false,
  );
});
test("Unapproved semantic operation preserves original response", () => {
  const r = transform(html, version(), target, "/apply");
  assert.equal(r.html, html);
  assert.equal(r.applied, false);
});
test("Approved narrow attribute reaches output", () => {
  const v = version();
  approve(v);
  const r = transform(html, v, target, "/apply");
  assert.equal(r.applied, true);
  assert.match(r.html, /aria-labelledby="name-label"/);
});
test("Approval replay fails after any manifest content changes", () => {
  const v = version();
  approve(v);
  v.manifest.createdAt = "2026-10-23T00:00:00.000Z";
  assert.equal(approvalsComplete(v), false);
  assert.equal(transform(html, v, target, "/apply").applied, false);
});
test("Forged operation hash is refused", () => {
  const v = version();
  approve(v);
  v.approvals[0].operationHash = "a".repeat(64);
  assert.equal(approvalsComplete(v), false);
});
test("Stale document fingerprint skips whole repair and preserves original", () => {
  const v = version();
  approve(v);
  const stale = html.replace("Full name", "Account number");
  const r = transform(stale, v, target, "/apply");
  assert.equal(r.applied, false);
  assert.equal(r.html, stale);
  assert.equal(r.reason, "document-precondition-mismatch");
});
test("Tenant/origin and path confusion refused", () => {
  const v = version();
  approve(v);
  assert.equal(transform(html, v, { id: "other" }, "/apply").applied, false);
  assert.equal(transform(html, v, target, "/private").applied, false);
});
test("Missing selector or mismatched attribute fails precondition atomically", () => {
  const v = version();
  v.manifest.operations[0].before = "unexpected";
  approve(v);
  assert.equal(transform(html, v, target, "/apply").applied, false);
});
test("Signed-in evidence and absent consent cannot become remote payloads", () => {
  assert.throws(
    () => remotePayload({ signedIn: true, consent: true, context: "secret" }),
    /local-only/,
  );
  assert.throws(
    () => remotePayload({ signedIn: false, consent: false, context: "public" }),
    /consent/,
  );
});
test("Redaction fixture removes email, Aadhaar, Indian phone and token", () => {
  const sensitive =
    "Asha asha@example.test Aadhaar 1234 5678 9012 Phone +91 9876543210 token=supersecret";
  const safe = remotePayload({
    signedIn: false,
    consent: true,
    context: sensitive,
  });
  assert.ok(!safe.text.includes("asha@example"));
  assert.ok(!safe.text.includes("9012"));
  assert.ok(!safe.text.includes("9876543210"));
  assert.ok(!safe.text.includes("supersecret"));
  assert.equal(Object.keys(safe).length, 2);
});
test("Raw evidence is content-addressed, historical observations not overwritten", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sugamya-test-"));
  try {
    const s = new Store(dir),
      a = s.put("evidence", { value: 1 }),
      b = s.put("evidence", { value: 2 });
    assert.notEqual(a.name, b.name);
    assert.deepEqual(s.object(a.name), { value: 1 });
    assert.throws(() => s.object("../.env"));
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
test("Audit chain detects tampering and refuses restart", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sugamya-test-"));
  try {
    const s = new Store(dir);
    s.event("observed", { count: 1 });
    s.event("decided", { action: "hold" });
    assert.equal(new Store(dir).validate(), true);
    let text = fs.readFileSync(path.join(dir, "events.jsonl"), "utf8");
    fs.writeFileSync(
      path.join(dir, "events.jsonl"),
      text.replace('"count":1', '"count":9'),
    );
    assert.throws(() => new Store(dir), /integrity/);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
test("No reliable observations produces no fabricated repair or pass", () => {
  const r = plan(
    {
      safe: {
        id: "obs",
        sha256: "a".repeat(64),
        observations: [],
        dom: { media: 0 },
        violations: [],
      },
    },
    { id: "test", locale: "en" },
  );
  assert.equal(r.manifest, null);
  assert.equal(r.status, "unresolved");
  assert.equal(r.coverage.length, 55);
  assert.ok(r.coverage.every((c) => c.status !== "passed"));
});
test("Priority actually favors task-blocking label above low-confidence image semantics", () => {
  const r = plan(
    {
      safe: {
        id: "obs",
        sha256: "a".repeat(64),
        observations: [
          {
            tag: "img",
            id: "desk-map",
            attributes: {},
            context: "Unverified diagram",
          },
          {
            tag: "input",
            id: "full-name",
            attributes: { id: "full-name" },
            precedingText: "Full name",
            label: null,
          },
        ],
        dom: { media: 0 },
        violations: [],
      },
    },
    { id: "test", locale: "en" },
  );
  assert.equal(r.findings[0].criterion, "3.3.2");
  assert.ok(r.findings[0].priority > r.findings[1].priority);
});
test("Media criterion is not declared inapplicable when media is present", () => {
  assert.equal(
    coverage({ dom: { media: 1 } }).find((c) => c.id === "1.2.1").status,
    "unresolved",
  );
});
test("Unexpected approval action / missing rationale denied", () => {
  assert.equal(
    Decision.safeParse({ action: "autoapprove", reason: "yes" }).success,
    false,
  );
  assert.equal(
    Decision.safeParse({ action: "approve", reason: "" }).success,
    false,
  );
});
test("Target URL/config cannot be injected through unknown request properties", () => {
  const fixture = JSON.parse(fs.readFileSync("config/target.json"));
  assert.equal(Target.safeParse({ ...fixture, script: "code" }).success, false);
});
test("Installed target configuration validates including asset paths", () => {
  assert.ok(Target.parse(JSON.parse(fs.readFileSync("config/target.json"))));
  for (const p of ["/../private", "//internal", "/./apply"]) {
    const t = JSON.parse(fs.readFileSync("config/target.json"));
    t.paths = [p];
    assert.equal(Target.safeParse(t).success, false);
  }
});
