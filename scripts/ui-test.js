import "../src/env.js";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch(),
  results = [];
try {
  for (const width of [1440, 768, 390]) {
    const c = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:4100/");
    await page
      .getByLabel("Access token", { exact: true })
      .fill(process.env.OPERATOR_TOKEN);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByText("Signed in · operator", { exact: true }).waitFor();
    await page.screenshot({
      path: `evidence/console-${width}.png`,
      fullPage: width === 390,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false, "Viewport overflow " + width);
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const violations = axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    }));
    await page
      .getByRole("button", { name: "Calculate forecast", exact: true })
      .click();
    await page.getByText("Forecast only:", { exact: false }).waitFor();
    await page.getByRole("combobox").selectOption("not-applicable");
    assert.equal(await page.locator("#criteria-body tr").count(), 5);
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const e = document.activeElement,
        c = getComputedStyle(e);
      return {
        tag: e.tagName,
        outlineStyle: c.outlineStyle,
        outlineWidth: c.outlineWidth,
      };
    });
    results.push({
      width,
      overflow,
      violations,
      pageErrors: errors,
      focus,
      loadedFonts: await page.evaluate(() =>
        document.fonts.check("14px Geist"),
      ),
    });
    await c.close();
  }
} finally {
  await browser.close();
}
const report = {
  at: new Date().toISOString(),
  environment: { node: process.version, chromium: chromium.executablePath() },
  results,
};
fs.writeFileSync("evidence/ui-tests.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (
  results.some((r) => r.violations.length || r.pageErrors.length || r.overflow)
)
  process.exitCode = 1;
