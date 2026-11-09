// @ts-check
const { test, expect } = require("@playwright/test");

test.describe("reference difference header (no stroke portals)", () => {
  test("home has no stroke portal DOM", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const residual = await page.evaluate(() => ({
      portals: !!document.getElementById("header-stroke-portals"),
      ghosts: document.querySelectorAll(".header-stroke-ghost").length,
    }));
    expect(residual.portals).toBe(false);
    expect(residual.ghosts).toBe(0);
  });

  test("desktop overlay: header difference + white source", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => {
      const h = document.querySelector(".site-header");
      const wm = document.querySelector(".wordmark");
      return {
        overlay: h?.classList.contains("site-header--overlay"),
        headerMix: getComputedStyle(h).mixBlendMode,
        wmColor: getComputedStyle(wm).color,
      };
    });
    expect(s.overlay).toBe(true);
    expect(s.headerMix).toBe("difference");
    expect(s.wmColor).toBe("rgb(255, 255, 255)");
  });

  test("mobile overlay: normal blend + light bar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => {
      const h = document.querySelector(".site-header");
      return {
        overlay: h?.classList.contains("site-header--overlay"),
        headerMix: getComputedStyle(h).mixBlendMode,
        bg: getComputedStyle(h).backgroundColor,
      };
    });
    expect(s.overlay).toBe(true);
    expect(s.headerMix).toBe("normal");
    expect(s.bg).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("desktop closing: overlay difference + white source on white field", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("End");
    await page.waitForTimeout(650);
    const s = await page.evaluate(() => {
      const h = document.querySelector(".site-header");
      const wm = document.querySelector(".wordmark");
      return {
        overlay: h?.classList.contains("site-header--overlay"),
        solid: h?.classList.contains("site-header--solid"),
        headerMix: getComputedStyle(h).mixBlendMode,
        wmColor: getComputedStyle(wm).color,
        mode: h?.getAttribute("data-header-mode"),
      };
    });
    expect(s.overlay).toBe(true);
    expect(s.solid).toBe(false);
    expect(s.mode).toBe("overlay");
    expect(s.headerMix).toBe("difference");
    expect(s.wmColor).toBe("rgb(255, 255, 255)");
  });

  test("lang toggle still works", async ({ page }) => {
    await page.goto("/");
    await page.locator('.lang-switch__btn[data-set-lang="en"]').click();
    await expect(page.locator('.lang-switch__btn[data-set-lang="en"]')).toHaveAttribute("aria-checked", "true");
  });
});
