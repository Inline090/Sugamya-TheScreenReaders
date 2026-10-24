import "../src/env.js";
import fs from "node:fs";
import { observe, verify } from "../src/browser.js";
import { Store } from "../src/store.js";
import assert from "node:assert/strict";
const publicBase = process.env.PUBLIC_BASE;
if (!publicBase || !publicBase.startsWith("https://"))
  throw Error("Set PUBLIC_BASE to the HTTPS owner-controlled gateway URL");
const s = new Store(),
  v = s.state.versions.find((v) => v.manifest.id === s.state.active);
if (!v) throw Error("No active version");
const target = JSON.parse(fs.readFileSync("config/target.json"));
const baseline = s.object(v.baselineObject.name);
const result = await verify(publicBase + v.manifest.path, v, baseline, target);
const obs = await observe(publicBase + v.manifest.path, {
  screenshotPath: "evidence/public-visitor-after.png",
});
const original = await observe(
  "http://127.0.0.1:" + process.env.ORIGIN_PORT + v.manifest.path,
  { screenshotPath: "evidence/origin-before.png" },
);
const out = {
  at: new Date().toISOString(),
  publicURL: publicBase + v.manifest.path,
  environment:
    "Fresh Chromium context, no extension, no operator cookies, HTTPS owner-controlled proxy published through a temporary Cloudflare Quick Tunnel; not customer production",
  version: v.manifest.id,
  verification: result,
  before: {
    url: original.safe.url,
    violations: original.safe.violations,
    instances: original.safe.violations.reduce((n, v) => n + v.nodes.length, 0),
    snapshot: original.safe.snapshot,
  },
  after: {
    url: obs.safe.url,
    violations: obs.safe.violations,
    instances: obs.safe.violations.reduce((n, v) => n + v.nodes.length, 0),
    snapshot: obs.safe.snapshot,
  },
  limitations:
    "No government site, no screen-reader user study; proxy must be routed by owner on a real domain; dynamic/private states excluded",
};
fs.writeFileSync(
  "evidence/public-deployment-proof.json",
  JSON.stringify(out, null, 2),
);
assert.equal(
  result.pass,
  true,
  JSON.stringify(result.checks.filter((c) => !c.pass)),
);
console.log(
  JSON.stringify(
    {
      publicURL: out.publicURL,
      version: out.version,
      beforeInstances: out.before.instances,
      afterInstances: out.after.instances,
      checksPassed: result.checks.filter((c) => c.pass).length,
      checksTotal: result.checks.length,
    },
    null,
    2,
  ),
);
