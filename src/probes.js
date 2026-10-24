/**
 * Bounded interactive probes. These run in the already-open page and feed the
 * coverage model. They are heuristics for the tested state, not conformance.
 */
export async function runProbes(page) {
  const probes = {
    keyboard: { order: [], focusable: 0, traps: [], note: "" },
    focusVisible: { checked: 0, missing: 0, samples: [] },
    targetSize: { checked: 0, failing: 0, samples: [] },
    reflow: { width: 0, horizontalScroll: false },
  };

  // Keyboard walk: press Tab up to 40 times and record focus order.
  try {
    probes.keyboard.focusable = await page.evaluate(
      () =>
        document.querySelectorAll(
          "a[href], button, input:not([type=hidden]), select, textarea, [tabindex]",
        ).length,
    );
    await page.evaluate(() => document.body.focus?.());
    let last = null,
      repeat = 0;
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id ? "#" + el.id : "",
          text: (el.innerText || el.getAttribute("aria-label") || "")
            .trim()
            .slice(0, 40),
        };
      });
      const key = info ? info.tag + info.id + info.text : "body";
      if (key === last) repeat += 1;
      else {
        repeat = 0;
        last = key;
      }
      // Repeated focus on the same control is a candidate keyboard trap.
      if (repeat === 2 && !probes.keyboard.traps.includes(key))
        probes.keyboard.traps.push(key);
      probes.keyboard.order.push(info || { tag: "body" });
    }
    probes.keyboard.note =
      "Tab walk of 40 steps; repeated focus is a candidate trap, not a verdict.";
  } catch (e) {
    probes.keyboard.note = "keyboard probe failed: " + e.message.slice(0, 80);
  }

  // Focus visibility: focus each control and inspect outline/box-shadow.
  try {
    const handles = await page.$$(
      "a[href], button, input:not([type=hidden]), select, textarea, [tabindex]",
    );
    for (const handle of handles.slice(0, 25)) {
      try {
        await handle.focus();
        const style = await handle.evaluate((el) => {
          const s = getComputedStyle(el);
          return { outline: s.outlineStyle + " " + s.outlineWidth, shadow: s.boxShadow };
        });
        probes.focusVisible.checked += 1;
        const noOutline =
          style.outline.includes("none") || style.outline.endsWith("0px");
        const noShadow = !style.shadow || style.shadow === "none";
        if (noOutline && noShadow) {
          probes.focusVisible.missing += 1;
          if (probes.focusVisible.samples.length < 5)
            probes.focusVisible.samples.push(
              await handle.evaluate(
                (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : ""),
              ),
            );
        }
      } catch {
        /* element detached */
      }
    }
  } catch (e) {
    probes.focusVisible.samples.push("probe failed: " + e.message.slice(0, 80));
  }

  // Target size (2.5.8): controls smaller than 24x24 CSS pixels.
  try {
    probes.targetSize = await page.evaluate(() => {
      const els = [
        ...document.querySelectorAll(
          "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link]",
        ),
      ];
      const failing = [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width < 24 || r.height < 24)
          failing.push({
            tag: el.tagName.toLowerCase(),
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
      }
      return { checked: els.length, failing: failing.length, samples: failing.slice(0, 5) };
    });
  } catch {
    /* leave defaults */
  }

  // Reflow (1.4.10): at 320px wide, is there horizontal scrolling?
  try {
    const original = page.viewportSize();
    await page.setViewportSize({ width: 320, height: 800 });
    probes.reflow = await page.evaluate(() => ({
      width: window.innerWidth,
      horizontalScroll:
        document.documentElement.scrollWidth > window.innerWidth + 1,
    }));
    if (original) await page.setViewportSize(original);
  } catch (e) {
    probes.reflow = { width: 0, horizontalScroll: false, error: e.message.slice(0, 80) };
  }

  return probes;
}
