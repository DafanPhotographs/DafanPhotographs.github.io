// @ts-check
const { test, expect } = require("@playwright/test");

test.describe("Nav hover roll (daofor reference)", () => {
  test("labels are wrapped and roll one line on hover", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const label = page.locator('.site-nav a[href="./about/"] .nav-link-label.lang-zh-only');
    await expect(label.locator(".nav-roll")).toHaveCount(1);
    await expect(label).toHaveText("关于");
    await expect(label.locator(".nav-roll")).toHaveAttribute("data-roll", "关于");
    const sizes = await label.evaluate((el) => ({
      windowH: el.getBoundingClientRect().height,
      trackH: el.querySelector(".nav-roll").getBoundingClientRect().height,
      overflow: getComputedStyle(el).overflow,
    }));
    expect(sizes.overflow).toBe("hidden");
    expect(sizes.trackH).toBeCloseTo(sizes.windowH * 2, 0);

    const link = page.locator('.site-nav a[href="./about/"]');
    const box = await link.boundingBox();
    await page.mouse.move(700, 700);
    await page.waitForTimeout(300);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(90);
    const mid = await label.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el.querySelector(".nav-roll")).transform).m42);
    expect(mid).toBeLessThan(-4);
    await page.waitForTimeout(400);
    const end = await label.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el.querySelector(".nav-roll")).transform).m42);
    expect(Math.abs(end + sizes.windowH)).toBeLessThan(1.5);
    await page.mouse.move(700, 700);
    await page.waitForTimeout(500);
    const rest = await label.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el.querySelector(".nav-roll")).transform).m42);
    expect(Math.abs(rest)).toBeLessThan(1.5);
  });

  test("language switch re-wraps the labels with the new copy", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.locator('.lang-switch__btn[data-set-lang="en"]').click();
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => {
      const label = document.querySelector('.site-nav a[href="./photography/"] .nav-link-label');
      return {
        text: label.textContent,
        roll: label.querySelector(".nav-roll")?.getAttribute("data-roll"),
        rolls: label.querySelectorAll(".nav-roll").length,
      };
    });
    expect(info.text).toBe("Photography");
    expect(info.roll).toBe("Photography");
    expect(info.rolls).toBe(1);
  });

  test("current page keeps its underline on the roll copies", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/photography/");
    await page.waitForLoadState("networkidle");
    const deco = await page.evaluate(() => {
      const el = document.querySelector('.site-nav a[href="./"] .nav-roll__a');
      return getComputedStyle(el).textDecorationLine;
    });
    expect(deco).toContain("underline");
  });
});
