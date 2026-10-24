import { chromium } from "playwright";

const url = process.argv[2] || "https://www.cgi.com/en";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  serviceWorkers: "block",
});
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
try {
  await page.waitForLoadState("networkidle", { timeout: 8000 });
} catch {}
console.log("status=" + (res?.status() ?? "?") + " finalUrl=" + page.url());
const data = await page.evaluate(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const imgs = [...document.querySelectorAll("img")];
  return {
    title: document.title,
    imgTotal: imgs.length,
    imgVisible: imgs.filter(visible).length,
    imgNoAlt: imgs.filter((i) => !i.hasAttribute("alt")).length,
    imgEmptyAlt: imgs.filter(
      (i) => i.hasAttribute("alt") && !i.getAttribute("alt").trim(),
    ).length,
    imgVisibleNoAlt: imgs.filter((i) => visible(i) && !i.hasAttribute("alt"))
      .length,
    imgVisibleEmptyAlt: imgs.filter(
      (i) => visible(i) && i.hasAttribute("alt") && !i.getAttribute("alt").trim(),
    ).length,
    imgSample: imgs.slice(0, 10).map((i) => ({
      src: (i.currentSrc || i.src || "").slice(0, 90),
      alt: i.getAttribute("alt"),
      dataSrc: i.getAttribute("data-src") ? "yes" : null,
      w: Math.round(i.getBoundingClientRect().width),
      h: Math.round(i.getBoundingClientRect().height),
    })),
    buttons: document.querySelectorAll("button").length,
    inputs: document.querySelectorAll("input,select,textarea").length,
    pictures: document.querySelectorAll("picture").length,
    bodyText: (document.body.innerText || "").slice(0, 200),
  };
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
