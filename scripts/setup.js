import { randomBytes } from "node:crypto";
import fs from "node:fs";
fs.mkdirSync("var", { recursive: true });
if (fs.existsSync(".env"))
  throw Error("Refusing to overwrite existing secrets");
const token = () => randomBytes(32).toString("hex");
fs.writeFileSync(
  ".env",
  `PORT=4100\nORIGIN_PORT=4101\nFIXTURE_ADMIN_TOKEN=${token()}\nOPERATOR_TOKEN=${token()}\nAPPROVER_TOKEN=${token()}\nOWNER_CHALLENGE=${token()}\n`,
  { mode: 0o600 },
);
console.log(
  "Created private .env. Operator and approver credentials are separate random bearer capabilities. Open .env privately; never commit it.",
);
