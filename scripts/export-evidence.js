import "../src/env.js";
import fs from "node:fs";
import path from "node:path";
import { hash } from "../src/store.js";
fs.mkdirSync("evidence/objects", { recursive: true });
for (const dir of ["var/objects", "var-reuse/objects"])
  if (fs.existsSync(dir))
    for (const name of fs.readdirSync(dir)) {
      const src = path.join(dir, name),
        dest = path.join("evidence/objects", name),
        data = JSON.parse(fs.readFileSync(src, "utf8"));
      if (!name.includes(hash(data)))
        throw Error("Content-address mismatch: " + name);
      if (!fs.existsSync(dest))
        fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
    }
for (const [port, out] of [
  [4100, "evidence/run-report.json"],
  [4200, "evidence/reuse/latest-run-report.json"],
]) {
  const r = await fetch("http://127.0.0.1:" + port + "/api/report", {
    headers: { Authorization: "Bearer " + process.env.OPERATOR_TOKEN },
  });
  if (!r.ok) throw Error("Actual report unavailable: " + port);
  fs.writeFileSync(out, JSON.stringify(await r.json(), null, 2));
}
let count = 0;
for (const name of fs.readdirSync("evidence/objects")) {
  const obj = JSON.parse(
    fs.readFileSync(path.join("evidence/objects", name), "utf8"),
  );
  if (!name.includes(hash(obj))) throw Error("Export integrity failed");
  count++;
}
console.log(
  "Exported and verified " +
    count +
    " immutable public-fixture objects, plus actual current run reports. No private route evidence was collected.",
);
