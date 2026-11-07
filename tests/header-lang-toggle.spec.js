// @ts-check
const { test, expect } = require("@playwright/test");

/** Routes that use the shared site header (lang toggle present). */
const HEADER_ROUTES = [
  "/",
  "/works/",
  "/photography/",
  "/about/",
  "/contact/",
  "/works/qingdao/",
];

const NARROW_WIDTHS = [320, 375, 390];

/**
 * @param {import("@playwright/test").Page} page
 */
async function langToggleFullyVisible(page) {
  return page.evaluate(() => {
    const el = document.querySelector(".lang-toggle");
    if (!el) return { ok: false, reason: "missing" };
    const rect = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const scrollW = document.documentElement.scrollWidth;
    const inView =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.left >= -0.5 &&
      rect.right <= vw + 0.5;
    const noOverflow = scrollW <= vw + 0.5;
    return { ok: inView && noOverflow, inView, noOverflow, rect, scrollW, vw };
  });
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} lang
 */
async function expectLangExclusive(page, lang) {
  const state = await page.evaluate((lang) => {
    const root = document.documentElement;
    const zhOnly = Array.from(document.querySelectorAll(".lang-zh-only"));
    const enOnly = Array.from(document.querySelectorAll(".lang-en-only"));
    const visible = (nodes) =>
      nodes.filter((n) => {
        const s = getComputedStyle(n);
        return s.display !== "none" && s.visibility !== "hidden";
      });
    return {
      lang: root.lang,
      zhVisible: visible(zhOnly).length,
      enVisible: visible(enOnly).length,
    };
  }, lang);
  expect(state.lang).toBe(lang);
  if (lang === "en") {
    expect(state.enVisible).toBeGreaterThan(0);
    expect(state.zhVisible).toBe(0);
  } else {
    expect(state.zhVisible).toBeGreaterThan(0);
    expect(state.enVisible).toBe(0);
  }
}

test.describe("QA F3 — header language toggle on narrow viewports", () => {
  for (const route of HEADER_ROUTES) {
    test(`EN then narrow: operable lang toggle on ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await page.locator('button[data-set-lang="en"]').click();
      await expectLangExclusive(page, "en");

      for (const w of NARROW_WIDTHS) {
        await page.setViewportSize({ width: w, height: 812 });
        const vis = await langToggleFullyVisible(page);
        expect(vis.ok, JSON.stringify(vis)).toBeTruthy();
        await expect(page.locator(".lang-toggle")).toBeVisible();
        await expect(page.locator('button[data-set-lang="zh"]')).toBeEnabled();
        await expect(page.locator('button[data-set-lang="en"]')).toBeEnabled();
      }

      await page.locator('button[data-set-lang="zh"]').click();
      await expectLangExclusive(page, "zh");
    });
  }

  test("desktop EN→narrow→EN→zh toggle cycle on home", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.locator('button[data-set-lang="en"]').click();
    await page.setViewportSize({ width: 375, height: 812 });
    let vis = await langToggleFullyVisible(page);
    expect(vis.ok, JSON.stringify(vis)).toBeTruthy();

    await page.locator('button[data-set-lang="en"]').click();
    await expectLangExclusive(page, "en");
    await page.locator('button[data-set-lang="zh"]').click();
    await expectLangExclusive(page, "zh");
    vis = await langToggleFullyVisible(page);
    expect(vis.ok, JSON.stringify(vis)).toBeTruthy();
  });

  test("wide viewports keep lang toggle visible (768, 1440)", async ({ page }) => {
    for (const w of [768, 1440]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto("/works/");
      await page.locator('button[data-set-lang="en"]').click();
      const vis = await langToggleFullyVisible(page);
      expect(vis.ok, `width ${w}: ${JSON.stringify(vis)}`).toBeTruthy();
    }
  });
});
