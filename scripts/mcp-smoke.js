// Development-time tool only. No project/GitHub/deployment credentials reach this MCP server.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { chromium } from "playwright";
import fs from "node:fs";
const args = [
  "node_modules/@playwright/mcp/cli.js",
  "--headless",
  "--isolated",
  "--no-sandbox",
  "--no-webmcp",
  "--executable-path",
  chromium.executablePath(),
  "--allowed-origins",
  "http://127.0.0.1:4100",
];
const client = new Client({ name: "Sugamya-dev-smoke", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args,
  env: { PATH: process.env.PATH, HOME: process.env.HOME },
});
try {
  await client.connect(transport);
  const list = await client.listTools();
  const nav = await client.callTool({
    name: "browser_navigate",
    arguments: { url: "http://127.0.0.1:4100/" },
  });
  const snap = await client.callTool({
    name: "browser_snapshot",
    arguments: {},
  });
  const data = {
    at: new Date().toISOString(),
    source: "https://github.com/microsoft/playwright-mcp",
    version: JSON.parse(
      fs.readFileSync("node_modules/@playwright/mcp/package.json"),
    ).version,
    tools: list.tools.map((t) => t.name),
    navigation: nav,
    snapshot: snap,
  };
  fs.writeFileSync("evidence/mcp-smoke.json", JSON.stringify(data, null, 2));
  if (nav.isError || snap.isError) throw Error("MCP browser smoke failed");
  console.log(
    "MCP handshake + browser navigation + accessibility snapshot PASS; tools:",
    list.tools.length,
  );
} finally {
  await client.close();
}
