import fs from "node:fs";

const env = fs.readFileSync(".env", "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim() : null;
};
const OPERATOR = get("OPERATOR_TOKEN");
const APPROVER = get("APPROVER_TOKEN");
const BASE = "http://127.0.0.1:4100";

async function login(token) {
  const r = await fetch(BASE + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sugamya-Request": "1" },
    body: JSON.stringify({ token }),
  });
  if (!r.ok) throw Error("login " + r.status + " " + (await r.text()));
  const raw = r.headers.getSetCookie
    ? r.headers.getSetCookie()[0]
    : r.headers.get("set-cookie");
  return raw.split(";")[0];
}

async function main() {
  const opCookie = await login(OPERATOR);
  console.log("operator login: OK");

  const url =
    process.argv[2] || "https://www.w3.org/WAI/demos/bad/before/tickets.html";
  const r = await fetch(BASE + "/api/external/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sugamya-Request": "1",
      Cookie: opCookie,
    },
    body: JSON.stringify({ url }),
  });
  const j = await r.json();
  if (!r.ok) throw Error("analyze " + r.status + " " + JSON.stringify(j));
  console.log(
    "analyze: OK; session=" + j.id,
    "operations=" + j.operations.length,
    "contrast=" + j.contrast.length,
  );
  for (const o of j.operations)
    console.log(
      "  op",
      o.id,
      o.criterion,
      o.kind,
      "before=" + JSON.stringify(o.before),
      "value=" + JSON.stringify(o.value),
    );

  const apCookie = await login(APPROVER);
  console.log("approver login: OK");

  const first = j.operations[0];
  for (const op of j.operations) {
    const d = await fetch(BASE + "/api/external/" + j.id + "/decide", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sugamya-Request": "1",
        Cookie: apCookie,
      },
      body: JSON.stringify({
        operationId: op.id,
        action: "approve",
        reason: "Demo approval for the preview",
      }),
    });
    const dj = await d.json();
    if (!d.ok) throw Error("decide " + d.status + " " + JSON.stringify(dj));
  }
  console.log("decide: OK; approved " + j.operations.length + " operation(s)");

  const pv = await fetch(BASE + j.previewUrl);
  const html = await pv.text();
  console.log("preview: status=" + pv.status + " bytes=" + html.length);
  if (first) {
    const esc = first.value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const applied =
      html.includes('data-sugamya="' + first.marker + '"') &&
      (html.includes(first.attribute + '="' + esc + '"') ||
        html.includes(first.attribute + "='" + first.value + "'"));
    console.log("first operation applied in preview: " + applied);
  }
}

main().catch((e) => {
  console.error("FAIL: " + e.message);
  process.exit(1);
});
