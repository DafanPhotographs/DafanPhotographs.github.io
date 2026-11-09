// @ts-check
const { test, expect } = require("@playwright/test");
const { PNG } = require("pngjs");

const HOME = "/";

async function compositedInvertErr(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return { ok: false };
  const vp = page.viewportSize();
  const clip = { x: 0, y: 0, width: vp.width, height: Math.min(160, vp.height) };
  await page.addStyleTag({
    content: "html.probe-hide-header-chrome .header-chrome { visibility: hidden !important; }",
  });
  await page.evaluate(() => document.documentElement.classList.add("probe-hide-header-chrome"));
  const bgBuf = await page.screenshot({ clip });
  await page.evaluate(() => document.documentElement.classList.remove("probe-hide-header-chrome"));
  const fgBuf = await page.screenshot({ clip });
  const bg = PNG.sync.read(bgBuf);
  const fg = PNG.sync.read(fgBuf);
  let minErr = Infinity;
  for (let y = Math.floor(box.y); y < Math.ceil(box.y + box.height); y++) {
    for (let x = Math.floor(box.x); x < Math.ceil(box.x + box.width); x++) {
      const i = (bg.width * y + x) << 2;
      const d =
        Math.abs(fg.data[i] - bg.data[i]) +
        Math.abs(fg.data[i + 1] - bg.data[i + 1]) +
        Math.abs(fg.data[i + 2] - bg.data[i + 2]);
      if (d < 40) continue;
      const bgRgb = [bg.data[i], bg.data[i + 1], bg.data[i + 2]];
      const compRgb = [fg.data[i], fg.data[i + 1], fg.data[i + 2]];
      const expected = bgRgb.map((b) => Math.abs(255 - b));
      const err = compRgb.reduce((s, c, j) => s + Math.abs(c - expected[j]), 0);
      if (err < minErr) minErr = err;
    }
  }
  return { ok: true, minErr };
}

async function clickLang(page, lang) {
  await page.locator(`.lang-switch__btn[data-set-lang="${lang}"]`).click();
}

test.describe("Language switch (inline preview)", () => {
  test("both locales visible, underline on active, persist storage", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(HOME);
    await expect(page.locator('.lang-switch__btn[data-set-lang="zh"]')).toBeVisible();
    await expect(page.locator('.lang-switch__btn[data-set-lang="en"]')).toBeVisible();
    await expect(page.locator('.lang-switch__btn[data-set-lang="zh"]')).toHaveAttribute("aria-checked", "true");
    await expect(page.locator('.lang-switch__btn[data-set-lang="en"]')).toHaveAttribute("aria-checked", "false");
    const zhDecor = await page
      .locator('.lang-switch__btn[data-set-lang="zh"]')
      .evaluate((el) => getComputedStyle(el).textDecorationLine);
    expect(zhDecor).toBe("underline");
    const enDecor = await page
      .locator('.lang-switch__btn[data-set-lang="en"]')
      .evaluate((el) => getComputedStyle(el).textDecorationLine);
    expect(enDecor).toBe("none");

    await clickLang(page, "en");
    expect(await page.evaluate(() => localStorage.getItem("dafan-lang"))).toBe("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator('.lang-switch__btn[data-set-lang="en"]')).toHaveAttribute("aria-checked", "true");

    await clickLang(page, "zh");
    expect(await page.evaluate(() => localStorage.getItem("dafan-lang"))).toBe("zh");
  });

  test("no dropdown layer in DOM", async ({ page }) => {
    await page.goto(HOME);
    await expect(page.locator(".lang-dropdown__menu")).toHaveCount(0);
    await expect(page.locator(".lang-dropdown__trigger")).toHaveCount(0);
  });

  test("arrow keys move selection", async ({ page }) => {
    await page.goto(HOME);
    const zh = page.locator('.lang-switch__btn[data-set-lang="zh"]');
    await zh.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  });

  test("375px: 44px targets, no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(HOME);
    const minH = await page.locator(".lang-switch__btn").first().evaluate((el) => {
      return parseFloat(getComputedStyle(el).minHeight);
    });
    expect(minH).toBe(44);
    await clickLang(page, "en");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(overflow).toBeLessThanOrEqual(376);
  });

  test("home overlay: nav and lang share header difference compositing", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(HOME);
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const el = document.querySelector('[data-home-scene="1"]');
      if (el) el.scrollIntoView({ block: "start" });
      if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
    });
    await page.waitForTimeout(650);
    const nav = await compositedInvertErr(page, ".nav-link-label");
    const zh = await compositedInvertErr(page, '.lang-switch__btn[data-set-lang="zh"]');
    expect(nav.ok).toBe(true);
    expect(zh.ok).toBe(true);
    expect(nav.minErr).toBeLessThanOrEqual(12);
    expect(zh.minErr).toBeLessThanOrEqual(12);
    await page.evaluate(() => {
      const el = document.querySelector('[data-home-scene="2"]');
      if (el) el.scrollIntoView({ block: "start" });
    });
    await page.waitForTimeout(650);
    const navDark = await compositedInvertErr(page, ".nav-link-label");
    const zhDark = await compositedInvertErr(page, '.lang-switch__btn[data-set-lang="zh"]');
    expect(navDark.minErr).toBeLessThanOrEqual(4);
    expect(zhDark.minErr).toBeLessThanOrEqual(4);
  });

  test("home overlay: equal opacity on both labels", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(HOME);
    const opacities = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".lang-switch__btn"));
      return btns.map((b) => getComputedStyle(b).opacity);
    });
    expect(opacities[0]).toBe("1");
    expect(opacities[1]).toBe("1");
    const colors = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".page-home .site-header--overlay .lang-switch__btn"));
      return btns.map((b) => getComputedStyle(b).color);
    });
    expect(colors[0]).toMatch(/255,\s*255,\s*255/);
    expect(colors[1]).toMatch(/255,\s*255,\s*255/);
  });

  test("works page switches language", async ({ page }) => {
    await page.goto("/works/");
    await clickLang(page, "en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator('[data-i18n="work.title"]')).toHaveText("Work");
  });

  test("no-JS keeps both inline options", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(HOME);
    await expect(page.locator(".lang-switch__btn")).toHaveCount(2);
    await context.close();
  });
});
