import fs from "node:fs";
if (fs.existsSync(".env"))
  for (const l of fs.readFileSync(".env", "utf8").split("\n")) {
    const i = l.indexOf("=");
    if (i > 0 && !process.env[l.slice(0, i)])
      process.env[l.slice(0, i)] = l.slice(i + 1);
  }
for (const k of ["OPERATOR_TOKEN", "APPROVER_TOKEN", "OWNER_CHALLENGE"])
  if (!process.env[k] || process.env[k].length < 32)
    throw Error(`Missing strong ${k}; run npm run setup`);
if (process.env.OPERATOR_TOKEN === process.env.APPROVER_TOKEN)
  throw Error("Distinct roles required");
