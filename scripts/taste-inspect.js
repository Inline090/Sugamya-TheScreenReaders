// Ephemeral LOCAL-ONLY authenticated visual harness for the official Taste inspector.
// Calls the real API, adds the operator capability only server-side; no fixture responses.
import "../src/env.js";
import http from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
const server = http.createServer(async (req, res) => {
  try {
    const headers = {};
    if (req.url.startsWith("/api/"))
      headers.Authorization = "Bearer " + process.env.OPERATOR_TOKEN;
    const r = await fetch("http://127.0.0.1:4100" + req.url, {
      headers,
      redirect: "manual",
    });
    res.writeHead(
      r.status,
      Object.fromEntries(
        [...r.headers].filter(
          ([k]) =>
            ![
              "content-encoding",
              "content-length",
              "transfer-encoding",
            ].includes(k),
        ),
      ),
    );
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.writeHead(502);
    res.end("Visual harness origin unavailable");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
try {
  const child = spawn(
    process.execPath,
    [
      ".agents/skills/design-taste-frontend/scripts/inspect.mjs",
      "http://127.0.0.1:" + server.address().port,
      "--app",
      "--out",
      "evidence/taste-inspection",
    ],
    {
      stdio: "inherit",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CHROME_PATH: chromium.executablePath(),
      },
    },
  );
  const code = await new Promise((resolve, reject) => {
    child.on("exit", resolve);
    child.on("error", reject);
  });
  process.exitCode = code;
} finally {
  server.close();
}
