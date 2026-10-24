import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
export const hash = (x) =>
  createHash("sha256")
    .update(typeof x === "string" ? x : JSON.stringify(x))
    .digest("hex");
export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
export class Store {
  constructor(dir = "var") {
    this.dir = dir;
    fs.mkdirSync(path.join(dir, "objects"), { recursive: true });
    this.eventsFile = path.join(dir, "events.jsonl");
    this.events = fs.existsSync(this.eventsFile)
      ? fs
          .readFileSync(this.eventsFile, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map(JSON.parse)
      : [];
    this.validate();
    this.state = fs.existsSync(path.join(dir, "state.json"))
      ? JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"))
      : {
          authorization: null,
          versions: [],
          active: null,
          lastGood: null,
          canary: null,
          disabled: false,
          baseline: null,
          verification: null,
        };
  }
  validate() {
    let prev = "0".repeat(64);
    for (const [i, e] of this.events.entries()) {
      const { hash: h, ...raw } = e;
      if (e.seq !== i + 1 || e.previousHash !== prev || hash(raw) !== h)
        throw Error("Audit integrity failure; refusing startup");
      prev = h;
    }
    return true;
  }
  event(type, data) {
    const raw = {
      seq: this.events.length + 1,
      at: now(),
      type,
      data,
      previousHash: this.events.at(-1)?.hash || "0".repeat(64),
    };
    const event = { ...raw, hash: hash(raw) };
    fs.appendFileSync(this.eventsFile, JSON.stringify(event) + "\n", {
      mode: 0o600,
    });
    this.events.push(event);
    return event;
  }
  save() {
    const f = path.join(this.dir, "state.json");
    fs.writeFileSync(f + ".tmp", JSON.stringify(this.state, null, 2), {
      mode: 0o600,
    });
    fs.renameSync(f + ".tmp", f);
  }
  put(kind, data) {
    const sha = hash(data),
      name = `${kind}-${sha}.json`,
      f = path.join(this.dir, "objects", name);
    if (!fs.existsSync(f))
      fs.writeFileSync(f, JSON.stringify(data, null, 2), {
        flag: "wx",
        mode: 0o600,
      });
    return { name, sha256: sha };
  }
  object(name) {
    if (!/^[a-z]+-[a-f0-9]{64}\.json$/.test(name))
      throw Error("Invalid object id");
    const data = JSON.parse(
      fs.readFileSync(path.join(this.dir, "objects", name), "utf8"),
    );
    if (hash(data) !== name.match(/-([a-f0-9]{64})/)[1])
      throw Error("Evidence integrity failure");
    return data;
  }
}
