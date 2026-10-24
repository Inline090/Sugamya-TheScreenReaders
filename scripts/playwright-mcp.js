// Local development only. Remove product and deployment secrets from the MCP environment.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  [
    "node_modules/@playwright/mcp/cli.js",
    "--headless",
    "--isolated",
    "--no-sandbox",
    "--no-webmcp",
    "--executable-path",
    chromium.executablePath(),
    "--allowed-origins",
    "http://127.0.0.1:4100",
  ],
  { stdio: "inherit", env: { PATH: process.env.PATH, HOME: process.env.HOME } },
);
child.on("exit", (code) => process.exit(code || 0));
child.on("error", () => {
  console.error("Playwright MCP could not start");
  process.exit(1);
});
