// @ts-check
const { test, expect } = require("@playwright/test");

const HOME = "/";

async function openLangMenu(page) {
  const trigger = page.locator(".lang-dropdown__trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".lang-dropdown__menu")).toBeVisible();
}

async function selectLang(page, lang) {
  const menu = page.locator(".lang-dropdown__menu");
  if (!(await menu.isVisible())) await openLangMenu(page);
  await page.locator(`.lang-dropdown__option[data-set-lang="${lang}"]`).click();
  await expect(page.locator(".lang-dropdown__menu")).toBeHidden();
  await expect(page.locator(".lang-dropdown__trigger")).toHaveAttribute("aria-expanded", "false");
}

test.describe("Language dropdown", () => {
  test("expand, switch both languages, persist storage", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(HOME);
    await expect(page.locator("[data-lang-current]")).toHaveText("中");
    await openLangMenu(page);
    await expect(page.locator('.lang-dropdown__option[data-set-lang="zh"]')).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await selectLang(page, "en");
    expect(await page.evaluate(() => localStorage.getItem("dafan-lang"))).toBe("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("[data-lang-current]")).toHaveText("EN");

    await openLangMenu(page);
    await selectLang(page, "zh");
    expect(await page.evaluate(() => localStorage.getItem("dafan-lang"))).toBe("zh");
    await expect(page.locator("[data-lang-current]")).toHaveText("中");
  });

  test("Escape closes menu and returns focus to trigger", async ({ page }) => {
    await page.goto(HOME);
    const trigger = page.locator(".lang-dropdown__trigger");
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".lang-dropdown__menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".lang-dropdown__menu")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("outside click closes menu", async ({ page }) => {
    await page.goto(HOME);
    await openLangMenu(page);
    await page.locator(".site-main").click({ position: { x: 20, y: 20 }, force: true });
    await expect(page.locator(".lang-dropdown__menu")).toBeHidden();
  });

  test("375px menu fits viewport, options operable", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(HOME);
    await openLangMenu(page);
    const box = await page.locator(".lang-dropdown__menu").boundingBox();
    expect(box).toBeTruthy();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375.5);
    await selectLang(page, "en");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(overflow).toBeLessThanOrEqual(376);
  });

  test("scheme A home overlay: transparent menu, difference blend", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(HOME);
    await openLangMenu(page);
    const panelStyle = await page.locator(".lang-dropdown__menu").evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        mixBlendMode: s.mixBlendMode,
        bg: s.backgroundColor,
        boxShadow: s.boxShadow,
        backdrop: s.backdropFilter,
      };
    });
    expect(panelStyle.mixBlendMode).toBe("difference");
    expect(panelStyle.bg).toBe("rgba(0, 0, 0, 0)");
    expect(panelStyle.boxShadow).toBe("none");
    expect(panelStyle.backdrop).toBe("none");
    await expect(page.locator('.lang-dropdown__option[data-set-lang="zh"]')).toHaveText(/中/);
    await expect(page.locator('.lang-dropdown__option[data-set-lang="en"]')).toHaveText(/EN/);
  });

  test("scheme A mobile: menu below header grid, options 44px min", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(HOME);
    await openLangMenu(page);
    const layout = await page.evaluate(() => {
      const nav = document.querySelector(".site-nav");
      const menu = document.querySelector(".lang-dropdown__menu");
      const header = document.querySelector(".site-header");
      if (!nav || !menu || !header) return null;
      const nr = nav.getBoundingClientRect();
      const mr = menu.getBoundingClientRect();
      return { gap: mr.top - nr.bottom, menuTop: mr.top, navBottom: nr.bottom };
    });
    expect(layout).toBeTruthy();
    expect(layout.gap).toBeGreaterThanOrEqual(10);
    const minH = await page.locator(".lang-dropdown__option").first().evaluate((el) => {
      return parseFloat(getComputedStyle(el).minHeight);
    });
    expect(minH).toBeGreaterThanOrEqual(44);
  });

  test("works page dropdown switches language", async ({ page }) => {
    await page.goto("/works/");
    await selectLang(page, "en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator('[data-i18n="work.title"]')).toHaveText("Work");
  });

  test("no-JS keeps inline language options", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(HOME);
    await expect(page.locator(".lang-dropdown__option")).toHaveCount(2);
    await context.close();
  });
});
