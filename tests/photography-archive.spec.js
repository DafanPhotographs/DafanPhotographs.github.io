// @ts-check
const { test, expect } = require("@playwright/test");

const PHOTO = "/photography/";

async function jump(page, y) {
  await page.evaluate((yy) => {
    if (window.__lenis) window.__lenis.scrollTo(yy, { immediate: true, force: true });
    else window.scrollTo({ top: yy, behavior: "instant" });
    if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
  }, y);
  await page.waitForTimeout(300);
}

test.describe("Photography archive (daofor reference)", () => {
  test("desktop: giant title, 3 columns, 12 photos, no Work nav", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PHOTO);
    await page.waitForLoadState("networkidle");
    expect(await page.locator(".photography-hero__word").textContent()).toBe("PHOTOGRAPHY");
    expect(await page.locator(".archive-item").count()).toBe(12);
    expect(await page.locator('[data-i18n="nav.work"]').count()).toBe(0);
    const cols = await page.locator(".photography-archive").evaluate((el) => getComputedStyle(el).columnCount);
    expect(cols).toBe("3");
    const blend = await page.locator(".site-header").evaluate((el) => getComputedStyle(el).mixBlendMode);
    expect(blend).toBe("difference");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    );
    expect(overflow).toBe(true);
  });

  test("photos fade/rise in as they enter the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PHOTO);
    await page.waitForLoadState("networkidle");
    const second = page.locator(".archive-item").nth(1);
    await jump(page, 0);
    const before = await second.evaluate((el) => ({
      opacity: Number(getComputedStyle(el).opacity),
      y: new DOMMatrixReadOnly(getComputedStyle(el).transform).m42,
    }));
    expect(before.opacity).toBeLessThan(0.4);
    expect(before.y).toBeGreaterThan(60);
    await jump(page, 600);
    const after = await second.evaluate((el) => ({
      opacity: Number(getComputedStyle(el).opacity),
      y: new DOMMatrixReadOnly(getComputedStyle(el).transform).m42,
    }));
    expect(after.opacity).toBeGreaterThan(0.8);
    expect(after.y).toBeLessThan(30);
  });

  test("mobile 390: 3 columns, no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PHOTO);
    await page.waitForLoadState("networkidle");
    const info = await page.evaluate(() => ({
      cols: getComputedStyle(document.querySelector(".photography-archive")).columnCount,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      items: document.querySelectorAll(".archive-item").length,
    }));
    expect(info.cols).toBe("3");
    expect(info.items).toBe(12);
    expect(info.scrollW).toBeLessThanOrEqual(info.clientW + 1);
  });
});
