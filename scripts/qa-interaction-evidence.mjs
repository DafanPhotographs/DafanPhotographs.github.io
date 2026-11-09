import { chromium } from "playwright";
import fs from "fs";
import { captureContext, scrollToClosingSolid } from "./evidence-lib.mjs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";

const browser = await chromium.launch();
const steps = [];

async function record(page, label, fn) {
  const row = { label };
  try {
    row.result = await fn(page);
    row.ok = true;
  } catch (e) {
    row.ok = false;
    row.error = String(e);
  }
  steps.push(row);
}

const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

await record(page, "initial-aria", async () => {
  const zh = page.locator('.lang-switch__btn[data-set-lang="zh"]');
  const en = page.locator('.lang-switch__btn[data-set-lang="en"]');
  return {
    zhAria: await zh.getAttribute("aria-checked"),
    enAria: await en.getAttribute("aria-checked"),
    radiogroup: await page.locator("[data-lang-switch]").getAttribute("role"),
  };
});

await record(page, "tab-to-lang-en", async () => {
  await page.keyboard.press("Tab");
  let focused = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    cls: document.activeElement?.className,
    aria: document.activeElement?.getAttribute("aria-checked"),
  }));
  for (let i = 0; i < 12 && !String(focused.cls || "").includes("lang-switch"); i += 1) {
    await page.keyboard.press("Tab");
    focused = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      cls: document.activeElement?.className,
      aria: document.activeElement?.getAttribute("aria-checked"),
    }));
  }
  await page.screenshot({ path: `${OUT}/qa-lang-focus-tab.png`, clip: { x: 0, y: 0, width: 375, height: 140 } });
  return focused;
});

await record(page, "arrow-right-select-en", async () => {
  await page.locator('.lang-switch__btn[data-set-lang="zh"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  const state = await page.evaluate(() => ({
    zh: document.querySelector('.lang-switch__btn[data-set-lang="zh"]')?.getAttribute("aria-checked"),
    en: document.querySelector('.lang-switch__btn[data-set-lang="en"]')?.getAttribute("aria-checked"),
    lang: document.documentElement.lang,
  }));
  await page.screenshot({ path: `${OUT}/qa-lang-focus-arrow-en.png`, clip: { x: 0, y: 0, width: 375, height: 140 } });
  return state;
});

await record(page, "space-activate-persist", async () => {
  await page.locator('.lang-switch__btn[data-set-lang="en"]').focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  const beforeReload = await page.evaluate(() => ({
    storage: localStorage.getItem("dafan-lang"),
    htmlLang: document.documentElement.lang,
  }));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    storage: localStorage.getItem("dafan-lang"),
    htmlLang: document.documentElement.lang,
    enChecked: document.querySelector('.lang-switch__btn[data-set-lang="en"]')?.getAttribute("aria-checked"),
  }));
  await page.screenshot({ path: `${OUT}/qa-lang-persist-reload-en.png`, clip: { x: 0, y: 0, width: 375, height: 140 } });
  return { beforeReload, after };
});

await record(page, "touch-target-44px", async () => {
  const en = page.locator('.lang-switch__btn[data-set-lang="en"]');
  const box = await en.boundingBox();
  return { width: box?.width, height: box?.height, min44: (box?.height || 0) >= 44 && (box?.width || 0) >= 44 };
});

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await scrollToClosingSolid(page);
await record(page, "closing-solid-1440-layout", async () => {
  const layout = await page.evaluate(() => {
    const lang = document.querySelector(".lang-switch")?.getBoundingClientRect();
    return {
      header: document.querySelector(".site-header")?.className,
      langRight: lang?.right,
      rightGap: window.innerWidth - (lang?.right || 0),
    };
  });
  await page.screenshot({ path: `${OUT}/qa-closing-1440-full.png`, fullPage: false });
  return layout;
});

await browser.close();

const report = { ...captureContext(), steps };
fs.writeFileSync(`${OUT}/qa-interaction-evidence.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
