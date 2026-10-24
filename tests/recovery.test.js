import test from "node:test";
import assert from "node:assert/strict";
import { recover } from "../src/recovery.js";
function store(state) {
  return {
    state,
    events: [],
    event(type, data) {
      this.events.push({ type, data });
    },
    save() {
      this.saved = true;
    },
  };
}
test("Interrupted canary is withheld without promotion on restart", () => {
  const s = store({
    canary: "new",
    active: "old",
    lastGood: "old",
    versions: [
      { manifest: { id: "new" }, status: "canary" },
      { manifest: { id: "old" }, status: "verified" },
    ],
  });
  recover(s);
  assert.equal(s.state.canary, null);
  assert.equal(s.state.active, "old");
  assert.equal(s.state.versions[0].status, "withheld");
});
test("Unverified persisted active deployment really restores known verified pointer", () => {
  const s = store({
    canary: null,
    active: "new",
    lastGood: "old",
    versions: [
      { manifest: { id: "new" }, status: "active" },
      { manifest: { id: "old" }, status: "verified" },
    ],
  });
  recover(s);
  assert.equal(s.state.active, "old");
  assert.equal(s.events[0].type, "deployment.rolled-back");
});
test("Unverified initial promotion restores original origin on restart", () => {
  const s = store({
    canary: null,
    active: "new",
    lastGood: null,
    versions: [{ manifest: { id: "new" }, status: "active" }],
  });
  recover(s);
  assert.equal(s.state.active, null);
});
test("Verified active version survives restart unchanged", () => {
  const s = store({
    canary: null,
    active: "good",
    lastGood: "good",
    versions: [{ manifest: { id: "good" }, status: "verified" }],
  });
  assert.equal(recover(s), false);
  assert.equal(s.state.active, "good");
});
