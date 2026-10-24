import test from "node:test";
import assert from "node:assert/strict";
import { Draft, previewPayload, draft } from "../src/model.js";
const op = {
  semantic: true,
  selector: "#img",
  criterion: "1.1.1",
  attribute: "alt",
  before: null,
};
const baseline = {
  safe: {
    observations: [
      {
        id: "img",
        tag: "img",
        context: "Citizen asha@example.test 1234 5678 9012 +91 9876543210",
        attributes: {},
      },
    ],
  },
};
const target = { publicEvidence: true };
test("Only redacted, bounded text reaches model preview; no image or form values", () => {
  const p = previewPayload(op, baseline, target);
  assert.ok(!p.payload.text.includes("asha@example"));
  assert.ok(!p.payload.text.includes("1234"));
  assert.ok(!p.payload.text.includes("987654"));
  assert.ok(p.excluded.includes("images"));
  assert.ok(p.bytes < 900);
});
test("Signed-in/minimal-evidence guard fails closed", () =>
  assert.throws(
    () => previewPayload(op, baseline, { publicEvidence: false }),
    /local-only/,
  ));
test("Model cannot be called without explicit consent", async () => {
  let called = false;
  await assert.rejects(
    () =>
      draft(previewPayload(op, baseline, target), {
        consent: false,
        fetchImpl: () => {
          called = true;
        },
      }),
    /consent/,
  );
  assert.equal(called, false);
});
test("Consent preview hash mismatch prevents any external request", async () => {
  let called = false;
  await assert.rejects(
    () =>
      draft(previewPayload(op, baseline, target), {
        consent: true,
        expectedHash: "wrong",
        fetchImpl: () => {
          called = true;
        },
      }),
    /changed/,
  );
  assert.equal(called, false);
});
test("Model output cannot become arbitrary generated code", () => {
  assert.equal(
    Draft.safeParse({
      status: "draft",
      value: "<script>alert(1)</script>",
      uncertainty: "malicious",
    }).success,
    false,
  );
  assert.equal(
    Draft.safeParse({
      status: "draft",
      value: "safe",
      uncertainty: "test",
      execute: "code",
    }).success,
    false,
  );
});
test("Model outage leaves a truthful error and does not synthesize a response", async () => {
  const p = previewPayload(op, baseline, target);
  await assert.rejects(
    () =>
      draft(p, {
        consent: true,
        expectedHash: p.payloadHash,
        key: "test-unit-key",
        fetchImpl: async () => ({ ok: false, status: 503 }),
      }),
    /HTTP 503/,
  );
});
test("Missing provider key leaves deterministic/manual route explicitly available", async () => {
  const p = previewPayload(op, baseline, target);
  await assert.rejects(
    () => draft(p, { consent: true, expectedHash: p.payloadHash, key: "" }),
    /manual route/,
  );
});
