/**
 * Preview screenshots: inline lang switch (zh active / en active) × viewports × backdrops.
 */
import { chromium } from "playwright";
import fs from "fs";
import {
  captureContext,
  scrollToScene,
  scrollToClosingSolid,
  scrollToDarkestForestBackdrop,
} from "./evidence-lib.mjs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";

async function shot(page, tag, vp, lang, backdrop) {
  await page.setViewportSize(vp);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.locator(`.lang-switch__btn[data-set-lang="${lang}"]`).click();
  await page.waitForTimeout(200);
  let backdropPick = null;
  if (backdrop === "hero") await page.evaluate(() => window.scrollTo(0, 0));
  else if (backdrop === "forest") {
    if (vp.width < 768) backdropPick = await scrollToDarkestForestBackdrop(page, "2");
    else await scrollToScene(page, "2");
  } else if (backdrop === "closing") backdropPick = await scrollToClosingSolid(page);

  const headerPath = `${OUT}/lang-switch-${tag}.png`;
  await page.screenshot({
    path: headerPath,
    clip: { x: 0, y: 0, width: vp.width, height: Math.min(140, vp.height) },
  });
  const fullPath = backdrop === "closing" ? `${OUT}/lang-switch-${tag}-full.png` : null;
  if (fullPath) await page.screenshot({ path: fullPath, fullPage: false });

  const layout = await page.evaluate(() => {
    const header = document.querySelector(".site-header");
    const wm = document.querySelector(".wordmark")?.getBoundingClientRect();
    const lang = document.querySelector(".lang-switch")?.getBoundingClientRect();
    const nav = document.querySelector(".site-nav")?.getBoundingClientRect();
    const active = document.querySelector('.lang-switch__btn[aria-checked="true"]');
  const chromeRules = [];
    for (const rule of [...document.styleSheets].flatMap((ss) => {
      try {
        return [...ss.cssRules];
      } catch {
        return [];
      }
    })) {
      if (rule.selectorText && /header-chrome|lang-switch|site-header--solid/.test(rule.selectorText)) {
        chromeRules.push(rule.selectorText);
      }
    }
    return {
      headerClasses: header?.className,
      dataHeaderMode: header?.getAttribute("data-header-mode"),
      scrollY: window.scrollY,
      wmRight: wm?.right,
      langLeft: lang?.left,
      langRight: lang?.right,
      navLeft: nav?.left,
      navRight: nav?.right,
      rightGap: lang ? window.innerWidth - lang.right : null,
      gap: lang && wm ? lang.left - wm.right : null,
      activeLabel: active?.textContent?.trim(),
      activeUnderline: active ? getComputedStyle(active).textDecorationLine : null,
      activeOpacity: active ? getComputedStyle(active).opacity : null,
      inactiveOpacity: document.querySelector('.lang-switch__btn[aria-checked="false"]')
        ? getComputedStyle(document.querySelector('.lang-switch__btn[aria-checked="false"]')).opacity
        : null,
      blendDisplay: getComputedStyle(document.querySelector(".header-chrome-blend") || document.body).display,
      matchingRuleSamples: chromeRules.slice(0, 8),
    };
  });
  return { tag, headerPath, fullPath, backdropPick, layout };
}

const browser = await chromium.launch();
const page = await browser.newPage();
const shots = [];

const plans = [
  ["1440-zh-bright", { width: 1440, height: 900 }, "zh", "hero"],
  ["1440-en-bright", { width: 1440, height: 900 }, "en", "hero"],
  ["1440-zh-dark", { width: 1440, height: 900 }, "zh", "forest"],
  ["1440-en-dark", { width: 1440, height: 900 }, "en", "forest"],
  ["1440-zh-closing", { width: 1440, height: 900 }, "zh", "closing"],
  ["1440-en-closing", { width: 1440, height: 900 }, "en", "closing"],
  ["375-zh-bright", { width: 375, height: 812 }, "zh", "hero"],
  ["375-en-bright", { width: 375, height: 812 }, "en", "hero"],
  ["375-zh-dark", { width: 375, height: 812 }, "zh", "forest"],
  ["375-en-dark", { width: 375, height: 812 }, "en", "forest"],
  ["375-zh-closing", { width: 375, height: 812 }, "zh", "closing"],
  ["375-en-closing", { width: 375, height: 812 }, "en", "closing"],
];

for (const [tag, vp, lang, backdrop] of plans) {
  shots.push(await shot(page, tag, vp, lang, backdrop));
}
await browser.close();

const report = { ...captureContext(), shots };
fs.writeFileSync(`${OUT}/lang-switch-preview-evidence.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
