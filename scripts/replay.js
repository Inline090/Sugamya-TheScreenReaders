import fs from "node:fs";
import { hash } from "../src/store.js";
import { RunEvent } from "../src/contracts.js";
const filename = process.argv[2] || "evidence/run-report.json",
  report = JSON.parse(fs.readFileSync(filename));
let previous = "0".repeat(64),
  seq = 0;
for (const e of report.events) {
  RunEvent.parse(e);
  const { hash: h, ...raw } = e;
  if (e.seq !== ++seq || e.previousHash !== previous || hash(raw) !== h)
    throw Error("Audit tampering at event " + e.seq);
  previous = h;
  console.log(e.seq + " " + e.at + " " + e.type + " " + JSON.stringify(e.data));
}
console.log("VERIFIED " + seq + " events; head " + previous);
console.log(
  "Hash-chain replay, not a rerun of browser actions. A trusted retained head is required to detect whole-log replacement.",
);
if (fs.existsSync("evidence/objects")) {
  let objects = 0;
  for (const name of fs.readdirSync("evidence/objects")) {
    const data = JSON.parse(fs.readFileSync("evidence/objects/" + name));
    if (!name.includes(hash(data)))
      throw Error("Evidence object tampered: " + name);
    objects++;
  }
  console.log(
    "VERIFIED " + objects + " exported content-addressed raw objects.",
  );
}
