import { chromium } from "playwright";
import fs from "fs";
import crypto from "crypto";
import { execSync } from "child_process";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = "/opt/cursor/artifacts";
const SHA = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

function sha(path) {
  return crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

async function snap(page, name, meta, expanded) {
  if (expanded) {
    const open = await page.locator(".lang-dropdown__menu").isVisible();
    if (!open) await page.locator(".lang-dropdown__trigger").click();
  } else {
    if (await page.locator(".lang-dropdown__menu").isVisible()) {
      await page.keyboard.press("Escape");
    }
  }
  const clipPath = `${OUT}/pr11-lang-${name}-header.png`;
  await page.locator(".lang-dropdown").screenshot({ path: clipPath });
  const fullPath = `${OUT}/pr11-lang-${name}-full.png`;
  await page.screenshot({ path: fullPath, fullPage: false });
  const wm = await page.locator(".lang-dropdown__trigger").evaluate((el) => {
    const s = getComputedStyle(el);
    return { fontSize: s.fontSize, fontWeight: s.fontWeight, fontFamily: s.fontFamily };
  });
  return {
    name,
    gitSha: SHA,
    expanded,
    ...meta,
    lang: await page.evaluate(() => document.documentElement.lang),
    trigger: wm,
    sha256: { header: sha(clipPath), full: sha(fullPath) },
    paths: { header: clipPath, full: fullPath },
  };
}

const shots = [];
const browser = await chromium.launch();
const plans = [
  { vp: { width: 1440, height: 900 }, dpr: 1, lang: "zh", expanded: false, tag: "1440-zh-closed" },
  { vp: { width: 1440, height: 900 }, dpr: 1, lang: "zh", expanded: true, tag: "1440-zh-open" },
  { vp: { width: 1440, height: 900 }, dpr: 1, lang: "en", expanded: false, tag: "1440-en-closed" },
  { vp: { width: 1440, height: 900 }, dpr: 1, lang: "en", expanded: true, tag: "1440-en-open" },
  { vp: { width: 375, height: 812 }, dpr: 2, lang: "zh", expanded: false, tag: "375-zh-closed" },
  { vp: { width: 375, height: 812 }, dpr: 2, lang: "zh", expanded: true, tag: "375-zh-open" },
  { vp: { width: 375, height: 812 }, dpr: 2, lang: "en", expanded: false, tag: "375-en-closed" },
  { vp: { width: 375, height: 812 }, dpr: 2, lang: "en", expanded: true, tag: "375-en-open" },
];

for (const plan of plans) {
  const page = await browser.newPage({
    viewport: plan.vp,
    deviceScaleFactor: plan.dpr,
  });
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  if (plan.lang === "en") {
    await page.locator(".lang-dropdown__trigger").click();
    await page.locator('.lang-dropdown__option[data-set-lang="en"]').click();
  }
  shots.push(
    await snap(page, plan.tag, { viewport: { ...plan.vp, dpr: plan.dpr }, scrollY: 0, scene: "hero-0" }, plan.expanded)
  );
  await page.close();
}

await browser.close();
const report = { capturedAt: new Date().toISOString(), gitSha: SHA, shots };
fs.writeFileSync(`${OUT}/pr11-lang-dropdown-evidence.json`, JSON.stringify(report, null, 2));
console.log("wrote", shots.length, "lang shots", SHA);
