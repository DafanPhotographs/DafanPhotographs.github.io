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

test.describe("Photography archive (photo-first)", () => {
  test("desktop: 12 single photos, place filters, 3 columns, no Work nav", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PHOTO);
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".archive-item")).toHaveCount(12);
    await expect(page.locator(".photo-filters .filter-btn")).toHaveCount(4);
    expect(await page.locator(".photography-hero__word").textContent()).toBe("PHOTOGRAPHY");
    expect(await page.locator('[data-i18n="nav.work"]').count()).toBe(0);
    const cols = await page.locator(".photography-archive .photo-col").count();
    expect(cols).toBe(3);
    const blend = await page.locator(".site-header").evaluate((el) => getComputedStyle(el).mixBlendMode);
    expect(blend).toBe("difference");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    );
    expect(overflow).toBe(true);
  });

  test("place filter narrows the archive to one location", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PHOTO);
    await page.waitForLoadState("networkidle");
    await page.locator('.photo-filters [data-location="bipenggou"]').click();
    await page.waitForTimeout(400);
    await expect(page.locator(".archive-item:not(.is-hidden)")).toHaveCount(4);
    await expect(page.locator(".archive-item.is-hidden")).toHaveCount(8);
    await page.locator('.photo-filters [data-location=""]').click();
    await page.waitForTimeout(300);
    await expect(page.locator(".archive-item:not(.is-hidden)")).toHaveCount(12);
  });

  test("lightbox shows title, description and place; Escape closes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PHOTO);
    await page.waitForLoadState("networkidle");
    await page.locator(".archive-item").first().click();
    const box = page.locator("[data-photo-lightbox]");
    await expect(box).toBeVisible();
    await expect(page.locator("[data-lightbox-title]")).toHaveText("毕棚沟 · 01");
    await expect(page.locator("[data-lightbox-location]")).toHaveText("毕棚沟");
    await expect(page.locator("[data-lightbox-copy]")).toContainText("山谷");
    await page.keyboard.press("Escape");
    await expect(box).toHaveAttribute("hidden", "");
  });

  test("photos rise 400px and fade in as they enter the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PHOTO);
    await page.waitForLoadState("networkidle");
    const first = page.locator(".archive-item").first();
    await jump(page, 0);
    const before = await first.evaluate((el) => ({
      opacity: Number(getComputedStyle(el).opacity),
      y: new DOMMatrixReadOnly(getComputedStyle(el).transform).m42,
      perspective: el.style.transform.includes("perspective"),
    }));
    expect(before.opacity).toBeLessThan(0.7);
    expect(before.y).toBeGreaterThan(100);
    expect(before.perspective).toBe(true);
    await jump(page, 500);
    const after = await first.evaluate((el) => ({
      opacity: Number(getComputedStyle(el).opacity),
      y: new DOMMatrixReadOnly(getComputedStyle(el).transform).m42,
    }));
    expect(after.opacity).toBeGreaterThan(0.9);
    expect(after.y).toBeLessThan(40);
  });

  test("mobile 390: 3 columns, no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PHOTO);
    await page.waitForLoadState("networkidle");
    const info = await page.evaluate(() => ({
      cols: document.querySelectorAll(".photography-archive .photo-col").length,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      items: document.querySelectorAll(".archive-item").length,
    }));
    expect(info.cols).toBe(3);
    expect(info.items).toBe(12);
    expect(info.scrollW).toBeLessThanOrEqual(info.clientW + 1);
  });
});
