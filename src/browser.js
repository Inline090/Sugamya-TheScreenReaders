import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { hash, now, uid } from "./store.js";
import { parse } from "parse5";
import * as cheerio from "cheerio";
export async function withBrowser(url, fn) {
  const u = new URL(url),
    browser = await chromium.launch({
      headless: true,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const denied = [];
  await context.route("**/*", async (route) => {
    const r = new URL(route.request().url());
    if (r.origin !== u.origin) {
      denied.push(r.origin);
      await route.abort();
    } else await route.continue();
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    return await fn(page, context, denied);
  } finally {
    await browser.close();
  }
}
export async function observe(
  url,
  { screenshotPath, contrastSelector = "#help" } = {},
) {
  return withBrowser(url, async (page, context, denied) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
    const start = performance.now();
    const res = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 15000,
    });
    if (!res?.ok()) throw Error(`Observation failed: HTTP ${res?.status()}`);
    const html = await res.text();
    const ax = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const dom = await page.evaluate(
      (contrastSelector) => ({
        title: document.title,
        lang: document.documentElement.lang,
        media: document.querySelectorAll("audio,video").length,
        elements: Array.from(
          document.querySelectorAll(
            "img,input:not([type=hidden]),button," + contrastSelector,
          ),
        ).map((e) => ({
          tag: e.tagName.toLowerCase(),
          id: e.id,
          text:
            e.tagName === "INPUT"
              ? ""
              : (e.textContent || "").trim().slice(0, 300),
          attributes: Object.fromEntries(
            Array.from(e.attributes)
              .filter((a) => !["value", "name"].includes(a.name))
              .map((a) => [a.name, a.value]),
          ),
          label: e.labels?.[0]?.textContent.trim() || null,
          title: e.title || null,
          precedingText:
            e.previousElementSibling?.textContent.trim().slice(0, 300) || "",
          context:
            e.tagName === "IMG"
              ? e.nextElementSibling?.textContent.trim().slice(0, 300)
              : null,
          color: getComputedStyle(e).color,
          background: getComputedStyle(e).backgroundColor,
          box: {
            x: e.getBoundingClientRect().x,
            y: e.getBoundingClientRect().y,
            width: e.getBoundingClientRect().width,
            height: e.getBoundingClientRect().height,
          },
        })),
      }),
      contrastSelector,
    );
    const snapshot = await page.locator("body").ariaSnapshot();
    if (screenshotPath)
      await page.screenshot({ path: screenshotPath, fullPage: true });
    const safe = {
      toolVersions: {
        axe: ax.testEngine.version,
        chromium: page.context().browser().version(),
      },
      id: uid(),
      at: now(),
      url,
      method:
        "local Chromium DOM + accessibility snapshot + axe; public fixture only",
      sha256: hash(html),
      privacy: "public-fixture-minimal",
      observations: dom.elements,
      dom,
      snapshot,
      violations: ax.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        tags: v.tags,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
      incomplete: ax.incomplete.map((v) => ({
        id: v.id,
        nodes: v.nodes.length,
      })),
      passes: ax.passes.map((v) => v.id),
      errors,
      blockedOrigins: denied,
      loadMs: Math.round(performance.now() - start),
    };
    return { safe, html, headers: await res.allHeaders() };
  });
}
const errorsFor = (html) => {
  const errors = [];
  parse(html, { onParseError: (e) => errors.push(e.code) });
  return errors;
};
export async function verify(url, version, baseline, target) {
  const started = performance.now();
  return withBrowser(url, async (page, context, denied) => {
    const checks = [],
      runtimeErrors = [],
      add = (name, pass, detail) =>
        checks.push({ name, pass: Boolean(pass), detail });
    let res;
    page.on("pageerror", (e) => runtimeErrors.push(e.message));
    try {
      res = await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
      add("origin-response", res?.status() === 200, { status: res?.status() });
      if (!res?.ok()) throw Error("Origin unavailable");
      const html = await res.text(),
        headers = await res.allHeaders();
      add(
        "visitor-version",
        headers["x-sugamya-version"] === version.manifest.id,
        {
          received: headers["x-sugamya-version"] || null,
          profile: "new context; extensions disabled; no operator session",
        },
      );
      const ax = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const beforeSet = new Set(
        baseline.safe.violations.flatMap((v) =>
          v.nodes.map((n) => v.id + "|" + JSON.stringify(n.target)),
        ),
      );
      const newFindings = ax.violations.flatMap((v) =>
        v.nodes
          .filter((n) => !beforeSet.has(v.id + "|" + JSON.stringify(n.target)))
          .map((n) => ({ id: v.id, target: n.target })),
      );
      add("axe-no-new-findings", !newFindings.length, {
        newFindings,
        remaining: ax.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.length,
        })),
        limits: "No-new-findings is not conformance",
      });
      const $ = cheerio.load(html),
        b = cheerio.load(baseline.html);
      for (const o of version.manifest.operations) {
        if (o.before === null) $(o.selector).removeAttr(o.attribute);
        else $(o.selector).attr(o.attribute, o.before);
      }
      add("unaffected-dom", $.html() === b.html(), {
        method: "restore intended attributes, compare normalized entire DOM",
      });
      const beforeErrors = errorsFor(baseline.html),
        afterErrors = errorsFor(html);
      add(
        "html-no-new-parse-errors",
        afterErrors.every((x) => beforeErrors.includes(x)),
        { before: beforeErrors, after: afterErrors },
      );
      const actual = await page.evaluate(
        (contrastSelector) =>
          Array.from(
            document.querySelectorAll(
              "img,input:not([type=hidden]),button," + contrastSelector,
            ),
          ).map((e) => ({
            id: e.id,
            x: e.getBoundingClientRect().x,
            y: e.getBoundingClientRect().y,
            width: e.getBoundingClientRect().width,
            height: e.getBoundingClientRect().height,
          })),
        target.policy.contrastSelector,
      );
      const shifts = actual.filter((a) => {
        const o = baseline.safe.observations.find((e) => e.id === a.id)?.box;
        return (
          !o ||
          ["x", "y", "width", "height"].some((k) => Math.abs(a[k] - o[k]) > 1)
        );
      });
      add("layout-unaffected", !shifts.length, {
        shifts,
        expectedChanges:
          "attribute-only; approved contrast colour; no size change expected",
      });
      add(
        "csp-preserved",
        headers["content-security-policy"] ===
          baseline.headers["content-security-policy"],
        { csp: headers["content-security-policy"] },
      );
      const names = [];
      for (const o of version.manifest.operations) {
        let ok;
        if (o.attribute === "class")
          ok = await page
            .locator(o.selector)
            .evaluate((e) => getComputedStyle(e).color === "rgb(52, 78, 90)");
        else
          ok =
            (await page.locator(o.selector).getAttribute(o.attribute)) ===
            o.value;
        names.push({ operation: o.id, pass: ok });
      }
      add(
        "manifest-effects-after-hydration",
        names.every((x) => x.pass),
        names,
      );
      let taskOk = false,
        taskError = null;
      try {
        await page
          .getByRole("textbox", { name: target.task.inputName, exact: true })
          .fill("Test Resident");
        await page
          .getByRole("textbox", { name: target.task.emailName, exact: true })
          .fill("resident@example.test");
        await page.locator(target.task.emailSelector).focus();
        await page.keyboard.press("Tab");
        const focused = await page
          .locator(target.task.submitSelector)
          .evaluate((e) => document.activeElement === e);
        const buttonName = await page
          .getByRole("button", { name: target.task.submitName, exact: true })
          .count();
        if (!focused || buttonName !== 1)
          throw Error("Keyboard focus or independent submit name mismatch");
        await page.keyboard.press("Enter");
        await page
          .locator(target.task.resultSelector)
          .filter({ hasText: target.task.successText })
          .waitFor();
        taskOk = true;
      } catch (e) {
        taskError = e.message.split("\n")[0].slice(0, 200);
      }
      add("service-task-keyboard", taskOk, {
        method: target.task.name,
        expectedInputName: target.task.inputName,
        expectedButtonName: target.task.submitName,
        error: taskError,
      });
      add("page-functionality", !runtimeErrors.length, {
        errors: runtimeErrors,
      });
      add("network-same-origin", !denied.length, { blocked: denied });
      const snapshot = await page.locator("body").ariaSnapshot();
      return {
        id: uid(),
        version: version.manifest.id,
        at: now(),
        pass: checks.every((c) => c.pass),
        checks,
        elapsedMs: Math.round(performance.now() - started),
        snapshot,
      };
    } catch (e) {
      add("verification-exception", false, e.message.slice(0, 200));
      return {
        id: uid(),
        version: version.manifest.id,
        at: now(),
        pass: false,
        checks,
        elapsedMs: Math.round(performance.now() - started),
      };
    }
  });
}
