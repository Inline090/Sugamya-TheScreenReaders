import fs from "node:fs";
const env = fs.readFileSync(".env", "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim() : null;
};
const OPERATOR = get("OPERATOR_TOKEN");
const BASE = "http://127.0.0.1:4100";

async function login(token) {
  const r = await fetch(BASE + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sugamya-Request": "1" },
    body: JSON.stringify({ token }),
  });
  if (!r.ok) throw Error("login " + r.status);
  const raw = r.headers.getSetCookie
    ? r.headers.getSetCookie()[0]
    : r.headers.get("set-cookie");
  return raw.split(";")[0];
}
const auth = (cookie) => ({
  "Content-Type": "application/json",
  "X-Sugamya-Request": "1",
  Cookie: cookie,
});

const cookie = await login(OPERATOR);
const url =
  process.argv[2] || "https://www.w3.org/WAI/demos/bad/before/home.html";
const j = await fetch(BASE + "/api/external/analyze", {
  method: "POST",
  headers: auth(cookie),
  body: JSON.stringify({ url }),
}).then(async (r) => {
  const j = await r.json();
  if (!r.ok) throw Error(JSON.stringify(j));
  return j;
});
console.log("analyze: session=" + j.id + " operations=" + j.operations.length);

const pv1 = await fetch(BASE + j.previewUrl).then((r) => r.text());
console.log(
  "preview WITHOUT approval: fixed=" +
    (pv1.match(/data-sugamya-fixed/g) || []).length +
    " alt=" +
    (pv1.match(/alt="Descriptive image"/g) || []).length +
    " bytes=" +
    pv1.length,
);

const first = j.operations[0];
const set = await fetch(
  BASE + "/api/external/" + j.id + "/operation/" + first.id,
  {
    method: "POST",
    headers: auth(cookie),
    body: JSON.stringify({ value: "CityLights banner" }),
  },
);
const setj = await set.json();
if (!set.ok) throw Error("setValue " + set.status + " " + JSON.stringify(setj));
console.log("setValue: OK -> " + first.id + " = CityLights banner");

const pv2 = await fetch(BASE + j.previewUrl).then((r) => r.text());
console.log("preview after edit contains new value: " + pv2.includes("CityLights banner"));
console.log("preview URL: " + BASE + j.previewUrl);
