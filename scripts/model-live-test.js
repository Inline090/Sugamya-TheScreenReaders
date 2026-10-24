import "../src/env.js";
import fs from "node:fs";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:4100";
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
await api("/disable", {});
await api("/connect", {});
const p = await api("/scan", {}),
  id = p.manifest.id,
  o = p.manifest.operations.find((o) => o.attribute === "alt");
const preview = await api("/versions/" + id + "/model-payload/" + o.id);
const denied = await api(
  "/versions/" + id + "/model-draft/" + o.id,
  { consent: false, payloadHash: preview.payloadHash },
  "operator",
  400,
);
const r = await api("/versions/" + id + "/model-draft/" + o.id, {
  consent: true,
  payloadHash: preview.payloadHash,
});
assert.equal(r.humanApprovalRequired, true);
const block = await api("/versions/" + id + "/deploy", {}, "operator", 409);
assert.match(block.error, /approval/);
const state = await api("/state");
const result = {
  at: new Date().toISOString(),
  fixture:
    "Controlled public fixture; text-only remote request explicitly consented for this engineering test",
  preview,
  deniedWithoutConsent: denied,
  result: r,
  heldUntilHumanApproval: block,
  version: state.state.versions.at(-1).manifest,
};
fs.writeFileSync(
  "evidence/model-live-result.json",
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify(
    {
      status: r.draft.status,
      value: r.draft.value,
      uncertainty: r.draft.uncertainty,
      usage: r.usage,
      elapsedMs: r.elapsedMs,
      version: id,
      humanApprovalRequired: true,
    },
    null,
    2,
  ),
);
