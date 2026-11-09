// @ts-check
const { test, expect } = require("@playwright/test");

test.describe("home header stroke portals", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
  });

  test("overlay: portals are body children outside difference header", async ({ page }) => {
    const state = await page.evaluate(() => {
      const light = document.getElementById("header-stroke-portal-light");
      const header = document.querySelector(".site-header");
      return {
        overlay: header?.classList.contains("site-header--overlay"),
        rootOnBody: document.getElementById("header-stroke-portals")?.parentElement === document.body,
        insideHeader: !!light?.closest(".site-header"),
        portalMix: light ? getComputedStyle(light).mixBlendMode : null,
        headerMix: header ? getComputedStyle(header).mixBlendMode : null,
        pointerEvents: light ? getComputedStyle(light).pointerEvents : null,
      };
    });
    expect(state.overlay).toBe(true);
    expect(state.insideHeader).toBe(false);
    expect(state.rootOnBody).toBe(true);
    expect(state.portalMix).toBe("normal");
    expect(state.headerMix).toBe("difference");
    expect(state.pointerEvents).toBe("none");
  });

  test("solid closing: portals hidden", async ({ page }) => {
    await page.keyboard.press("End");
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => {
      const root = document.getElementById("header-stroke-portals");
      const header = document.querySelector(".site-header");
      return {
        solid: header?.classList.contains("site-header--solid"),
        rootHidden: root?.hidden,
        ghosts: document.querySelectorAll(".header-stroke-ghost").length,
      };
    });
    expect(state.solid).toBe(true);
    expect(state.rootHidden || state.ghosts === 0).toBeTruthy();
  });

  test("lang click hits real control not portal", async ({ page }) => {
    await page.locator('.lang-switch__btn[data-set-lang="en"]').click();
    await expect(page.locator('.lang-switch__btn[data-set-lang="en"]')).toHaveAttribute("aria-checked", "true");
    const ghostsInteractive = await page.evaluate(() =>
      [...document.querySelectorAll(".header-stroke-ghost")].some((g) =>
        g.matches("button,a,[tabindex]")
      )
    );
    expect(ghostsInteractive).toBe(false);
  });

  test("resize keeps ghost near lang label", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "geometry probe");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(400);
    const a = await page.evaluate(() => {
      const btn = document.querySelector('.lang-switch__btn[data-set-lang="zh"] .lang-switch__label');
      const ghost = [...document.querySelectorAll(".header-stroke-ghost")].find(
        (g) => g.textContent?.trim() === "中文"
      );
      if (!btn || !ghost) return null;
      const br = btn.getBoundingClientRect();
      const gr = ghost.getBoundingClientRect();
      return Math.max(Math.abs(br.left - gr.left), Math.abs(br.top - gr.top));
    });
    expect(a).not.toBeNull();
    expect(a).toBeLessThan(2);
  });
});
