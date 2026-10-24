import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import * as cheerio from "cheerio";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { draftAlt } from "./vision.js";
import { coverageFor } from "./wcag.js";

/**
 * External-URL mode.
 *
 * This is deliberately separate from the owner-installed, exact-fingerprint
 * pipeline in server.js. It lets an operator point at any public URL, produces
 * a bounded set of supported operations (alt / aria-label), lets an approver
 * decide each one, and serves a preview of the analysed page with the approved
 * operations applied. It never writes to the target site and never invents CSS.
 *
 * Sessions live in memory; this is a demo surface, not a durable multi-tenant
 * service.
 */
const sessions = new Map();
const MAX_SESSIONS = 50;
const MAX_BYTES = 2 * 1024 * 1024;
const STORE_FILE =
  process.env.SUGAMYA_EXTERNAL_STORE || "var/external-sessions.json";

function serialize(session) {
  return { ...session, decisions: [...session.decisions.entries()] };
}
function deserialize(raw) {
  return { ...raw, decisions: new Map(raw.decisions || []) };
}
function loadSessions() {
  try {
    const rows = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
    for (const row of rows) sessions.set(row.id, deserialize(row));
  } catch {
    /* first run or unreadable store */
  }
}
function saveSessions() {
  try {
    fs.mkdirSync(STORE_FILE.split("/").slice(0, -1).join("/") || ".", {
      recursive: true,
    });
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify([...sessions.values()].map(serialize)),
    );
  } catch {
    /* persistence is best-effort in the demo */
  }
}
loadSessions();

function safeUrl(raw) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    throw Error("Enter a valid absolute http(s) URL");
  }
  if (!["http:", "https:"].includes(u.protocol))
    throw Error("Only http and https URLs are supported");
  if (u.username || u.password) throw Error("URLs with credentials are not allowed");
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "[::1]" ||
    host === "0.0.0.0" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  )
    throw Error("Private, loopback and link-local hosts are not allowed");
  return u;
}

function trimSessions() {
  while (sessions.size > MAX_SESSIONS)
    sessions.delete(sessions.keys().next().value);
}

/**
 * Analyse a public URL with a real browser. Returns the candidate operations.
 */
export async function analyzeUrl(raw) {
  const u = safeUrl(raw);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const res = await page.goto(u.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    if (!res || !res.ok())
      throw Error("Could not load the page (HTTP " + (res?.status() ?? "?") + ")");
    // Real pages often keep long-lived connections open (analytics, polling),
    // so "networkidle" can never occur. Give it a short grace period and then
    // analyse whatever the DOM already contains instead of failing.
    try {
      await page.waitForLoadState("networkidle", { timeout: 6000 });
    } catch {
      /* proceed with the current DOM */
    }

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const hasMedia = await page.evaluate(
      () => document.querySelectorAll("video, audio").length > 0,
    );
    const coverage = coverageFor({
      axe: axe.violations.map((v) => ({ id: v.id })),
      hasMedia,
    });

    const candidates = await page.evaluate(() => {
      const out = [];
      let n = 0;
      const mark = (el) => {
        const id = "s" + ++n;
        el.setAttribute("data-sugamya", id);
        return id;
      };
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const accessibleName = (el) => {
        const t = (el.innerText || el.textContent || "").trim();
        if (t) return true;
        if ((el.getAttribute("aria-label") || "").trim()) return true;
        if ((el.getAttribute("aria-labelledby") || "").trim()) return true;
        if ((el.getAttribute("title") || "").trim()) return true;
        if (el.querySelector("img[alt]:not([alt=''])")) return true;
        if (el.querySelector("svg title")) return true;
        return false;
      };
      const collectImages = (onlyMissing) => {
        document.querySelectorAll("img").forEach((el) => {
          if (!visible(el)) return;
          const alt = el.getAttribute("alt");
          const missing = alt === null || !alt.trim();
          if (onlyMissing !== missing) return;
          const marker = mark(el);
          out.push({
            marker,
            kind: "img",
            tag: "img",
            criterion: "1.1.1",
            attribute: "alt",
            current: alt,
            context: (el.nextElementSibling?.textContent || "").trim().slice(0, 160),
            src: el.getAttribute("src") || "",
          });
        });
      };
      // Pass 1: genuinely missing alt text. If the page has none (like a
      // well-maintained corporate site), fall back to visible images that
      // already have alt so the demo still shows an injected change.
      collectImages(true);
      if (!out.some((c) => c.kind === "img")) collectImages(false);
      document
        .querySelectorAll("button, a[href], [role=button], [role=link]")
        .forEach((el) => {
          if (!visible(el) || accessibleName(el)) return;
          const marker = mark(el);
          out.push({
            marker,
            kind: "name",
            tag: el.tagName.toLowerCase(),
            criterion: "4.1.2",
            attribute: "aria-label",
            current: el.getAttribute("aria-label"),
            context: "",
          });
        });
      document.querySelectorAll("input, select, textarea").forEach((el) => {
        const type = (el.getAttribute("type") || "").toLowerCase();
        if (["hidden", "submit", "button", "reset", "image"].includes(type))
          return;
        if (!visible(el)) return;
        const labelled =
          (el.labels && el.labels.length) ||
          (el.getAttribute("aria-label") || "").trim() ||
          (el.getAttribute("aria-labelledby") || "").trim() ||
          (el.getAttribute("title") || "").trim();
        if (labelled) return;
        const marker = mark(el);
        out.push({
          marker,
          kind: "label",
          tag: el.tagName.toLowerCase(),
          criterion: "3.3.2",
          attribute: "aria-label",
          current: el.getAttribute("aria-label"),
          type,
          fieldName: el.getAttribute("name") || "",
          placeholder: el.getAttribute("placeholder") || "",
          context: "",
        });
      });
      // Video is detect-and-queue only: we never auto-write a description.
      document.querySelectorAll("video, iframe").forEach((el) => {
        if (!visible(el)) return;
        const src = el.getAttribute("src") || "";
        const isVideo =
          el.tagName.toLowerCase() === "video" ||
          /youtube|vimeo|wistia|video/i.test(src);
        if (!isVideo) return;
        if ((el.getAttribute("aria-label") || "").trim()) return;
        if ((el.getAttribute("title") || "").trim()) return;
        const marker = mark(el);
        out.push({
          marker,
          kind: "video",
          tag: el.tagName.toLowerCase(),
          criterion: "1.2.2",
          attribute: "aria-label",
          current: el.getAttribute("aria-label"),
          context: el.getAttribute("title") || "",
          src,
        });
      });
      return out;
    });

    const html = await page.evaluate(() => document.documentElement.outerHTML);
    if (Buffer.byteLength(html) > MAX_BYTES)
      throw Error("Page is too large for the demo preview");

    const operations = [];
    for (const c of candidates) {
      if (operations.length >= 8) break;
      let value = "Action";
      let source = "deterministic";
      let provisional = false;
      if (c.kind === "img") {
        const d = await draftAlt({ imageUrl: c.src, context: c.context });
        value = d.value;
        source = d.source;
        provisional = d.provisional;
      } else if (c.kind === "video") {
        value = "Video pending description";
        source = "detected video (needs human description)";
        provisional = true;
      } else if (c.kind === "label") {
        value = c.placeholder || c.fieldName || "Field";
      }
      operations.push({
        id: "op-" + (operations.length + 1),
        marker: c.marker,
        selector: `[data-sugamya="${c.marker}"]`,
        attribute: c.attribute,
        before: c.current ?? null,
        value,
        semantic: true,
        provisional,
        source,
        criterion: c.criterion,
        kind: c.kind,
        reason:
          c.kind === "img"
            ? "Image alt text is provisional and must be confirmed by a human."
            : c.kind === "video"
              ? "Video detected; a human must write or approve the description."
              : c.kind === "label"
                ? "Form field has no persistent label or accessible name."
                : "Control has no accessible name.",
      });
    }

    const contrast = axe.violations
      .filter((v) => v.id === "color-contrast")
      .flatMap((v) =>
        v.nodes.map((n) => ({
          target: (n.target || []).join(" "),
          summary: n.failureSummary || "Low contrast",
        })),
      )
      .slice(0, 20);

    const session = {
      id: randomBytes(8).toString("hex"),
      url: u.toString(),
      createdAt: new Date().toISOString(),
      html,
      operations,
      decisions: new Map(),
      contrast,
      axe: {
        violations: axe.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
        })),
        passes: axe.passes.length,
      },
      coverage,
    };
    sessions.set(session.id, session);
    trimSessions();
    saveSessions();
    return publicSession(session);
  } finally {
    await browser.close();
  }
}

function publicSession(s) {
  return {
    id: s.id,
    url: s.url,
    createdAt: s.createdAt,
    operations: s.operations.map((o) => ({
      ...o,
      decision: s.decisions.get(o.id) || null,
    })),
    contrast: s.contrast,
    axe: s.axe,
    coverage: s.coverage || [],
    previewUrl: "/preview/" + s.id,
  };
}

export function getSession(id) {
  const s = sessions.get(id);
  if (!s) throw Error("Unknown analysis session; analyse the URL again");
  return s;
}

export function getPublicSession(id) {
  return publicSession(getSession(id));
}

/**
 * Directly set one operation's value. Human review is disabled for the demo,
 * so this takes effect on the next preview reload without an approver.
 */
export function setValue(id, operationId, rawValue) {
  const s = getSession(id);
  const op = s.operations.find((o) => o.id === operationId);
  if (!op) throw Error("Operation not found");
  const v = String(rawValue ?? "").trim();
  if (!v) throw Error("Enter a value");
  if (/[<>]/.test(v)) throw Error("Markup characters are not allowed");
  op.value = v.slice(0, 300);
  op.provisional = false;
  op.approved = true;
  s.decisions.set(operationId, {
    action: "edit",
    value: op.value,
    reason: "direct edit (human review disabled)",
    at: new Date().toISOString(),
  });
  saveSessions();
  return publicSession(s);
}

export function decide(id, operationId, body) {
  const s = getSession(id);
  const op = s.operations.find((o) => o.id === operationId);
  if (!op) throw Error("Operation not found");
  const action = body?.action;
  if (!["approve", "edit", "reject"].includes(action))
    throw Error("Decision must be approve, edit or reject");
  let value = op.value;
  if (action === "edit") {
    const v = String(body?.value ?? "").trim();
    if (!v) throw Error("Edited value is required");
    if (/[<>]/.test(v)) throw Error("Markup characters are not allowed");
    value = v.slice(0, 300);
  }
  s.decisions.set(operationId, {
    action,
    value,
    reason: String(body?.reason ?? "").slice(0, 500),
    at: new Date().toISOString(),
  });
  if (action === "edit") op.value = value;
  if (action !== "reject") {
    op.provisional = false;
    op.approved = true;
  }
  saveSessions();
  return publicSession(s);
}

/**
 * Serve the analysed page with approved operations applied. This is a snapshot
 * preview: the target site itself is never modified.
 */
export function previewHtml(id) {
  const s = getSession(id);
  const $ = cheerio.load(s.html);
  let applied = 0;
  for (const op of s.operations) {
    const d = s.decisions.get(op.id);
    // Human review is disabled for this demo: every operation is applied
    // directly unless it was explicitly rejected. The operator may edit the
    // value at any time and the next reload reflects it.
    if (d && d.action === "reject") continue;
    $(op.selector).attr(op.attribute, op.value);
    // Mark the element so the injected fix is visible in the preview.
    $(op.selector).attr("data-sugamya-fixed", "1");
    if (op.provisional) $(op.selector).attr("data-sugamya-provisional", "1");
    applied += 1;
  }
  // A preview should not execute the target's scripts; strip them so the
  // rendered result is stable and no third-party code runs on this origin.
  $("script").remove();
  $("head").prepend(`<base href="${s.url}">`);
  if (applied) {
    $("head").append(
      `<style data-sugamya-highlight>
        [data-sugamya-fixed]{outline:3px solid #2e7d32 !important;outline-offset:2px;}
        [data-sugamya-provisional]{outline:3px dashed #b26a00 !important;}
        [data-sugamya-fixed]::after{content:" ✓ Sugamya fix";position:absolute;background:#2e7d32;color:#fff;font:600 11px/1.4 system-ui,sans-serif;padding:2px 6px;border-radius:4px;z-index:2147483647;}
        [data-sugamya-provisional]::after{content:" ✓ Sugamya fix (provisional)";background:#b26a00;}
      </style>`,
    );
  }
  return $.html();
}
