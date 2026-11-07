// @ts-check
const { test, expect } = require("@playwright/test");

const HOME = "/";
const MOTION_VIEWPORT = { width: 1440, height: 900 };
const TABLET = { width: 768, height: 1024 };
const NARROW = { width: 375, height: 812 };
const NARROW_390 = { width: 390, height: 844 };
const LAPTOP = { width: 1024, height: 768 };

/**
 * @param {import("@playwright/test").Page} page
 */
async function activeSceneIndex(page) {
  return page.locator("[data-home-stage-rail]").getAttribute("data-active-scene");
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function motionEnabled(page) {
  return page.evaluate(() => document.documentElement.classList.contains("home-stages--motion"));
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {number} deltaY
 */
async function wheelScroll(page, steps, deltaY) {
  await page.mouse.move(720, 450);
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(450);
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {number} index
 */
async function sceneDominatesViewport(page, index) {
  return page.evaluate((i) => {
    const el = document.querySelector('[data-home-scene="' + i + '"]');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top <= 120 && r.height >= window.innerHeight * 0.55;
  }, index);
}

test.describe("Home fullscreen stages", () => {

  test("1440 desktop: scroll advances scenes and reverses", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    expect(await motionEnabled(page)).toBe(true);

    const y0 = await page.evaluate(() => window.scrollY);
    expect(await activeSceneIndex(page)).toBe("0");
    await expect(page.locator(".hero-tagline")).toBeInViewport();

    await wheelScroll(page, 14, 600);
    const y1 = await page.evaluate(() => window.scrollY);
    expect(y1).toBeGreaterThan(y0 + 200);
    expect(await sceneDominatesViewport(page, 1)).toBe(true);
    const idxMid = await activeSceneIndex(page);
    expect(Number(idxMid)).toBeGreaterThanOrEqual(1);

    await wheelScroll(page, 16, -500);
    expect(await sceneDominatesViewport(page, 0)).toBe(true);
    const idxBack = await activeSceneIndex(page);
    expect(Number(idxBack)).toBeLessThan(Number(idxMid));
  });

  test("1440: footer enters viewport; footer link focusable", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("End");
    await page.waitForTimeout(600);

    const footerLink = page.locator(".site-footer a[href*='instagram']").first();
    await expect(footerLink).toBeInViewport();
    await footerLink.focus();
    await expect(footerLink).toBeFocused();
  });

  test("1440: PageDown and in-scene featured link", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBeGreaterThan(40);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.keyboard.press("PageDown");
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(500);
    const link = page.locator('a[data-home-scene="1"]');
    await link.focus();
    await expect(link).toBeFocused();
  });

  test("1440: inactive scenes do not keep featured links tabbable", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    await wheelScroll(page, 28, 650);
    const heroHidden = await page.locator('[data-home-scene="0"]').getAttribute("aria-hidden");
    expect(heroHidden).toBe("true");
    const pillTab = await page.locator("[data-hero-pill]").first().evaluate((el) => el.tabIndex);
    expect(pillTab).toBe(-1);
  });

  test("1024 fine pointer: motion on", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: LAPTOP,
      hasTouch: false,
    });
    const page = await context.newPage();
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    expect(await motionEnabled(page)).toBe(true);
    await context.close();
  });

  test("1024 coarse pointer: motion off", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: LAPTOP,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    expect(await motionEnabled(page)).toBe(false);
    await context.close();
  });

  test("768 and 375: no motion; footer reachable by scroll", async ({ page }) => {
    for (const size of [TABLET, NARROW, NARROW_390]) {
      await page.setViewportSize(size);
      await page.goto(HOME);
      await page.waitForLoadState("networkidle");
      expect(await motionEnabled(page)).toBe(false);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      );
      expect(overflow).toBe(true);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(page.locator(".site-footer")).toBeInViewport();
    }
  });

  test("langchange does not duplicate ScrollTrigger instances", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    const before = await page.evaluate(() =>
      typeof ScrollTrigger !== "undefined" ? ScrollTrigger.getAll().length : 0
    );
    await page.locator('[data-set-lang="en"]').click();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ScrollTrigger.getAll().length);
    expect(after).toBe(before);
  });

  test("resize triggers refresh without orphan pin (footer gap sane)", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(350);
    await page.keyboard.press("End");
    await page.waitForTimeout(400);
    await expect(page.locator(".site-footer")).toBeInViewport();
    const gap = await page.evaluate(() => {
      const f = document.querySelector(".site-footer");
      if (!f) return 0;
      const r = f.getBoundingClientRect();
      return Math.abs(r.bottom - window.innerHeight);
    });
    expect(gap).toBeLessThan(120);
  });

  test("reduced-motion toggles off timeline and restores flow", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    expect(await motionEnabled(page)).toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(500);
    expect(await motionEnabled(page)).toBe(false);
    const count = await page.evaluate(() =>
      typeof ScrollTrigger !== "undefined" ? ScrollTrigger.getAll().length : 0
    );
    expect(count).toBe(0);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator(".site-footer")).toBeInViewport();
  });

  test("works index: header stays sticky document flow (not home overlay)", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto("/works/");
    await page.waitForLoadState("networkidle");
    const isHome = await page.evaluate(() => document.body.classList.contains("page-home"));
    expect(isHome).toBe(false);
    const pos = await page.locator(".site-header").evaluate((el) => getComputedStyle(el).position);
    expect(pos).toBe("sticky");
  });

  test("no horizontal overflow on home at 1440", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    const ok = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    );
    expect(ok).toBe(true);
  });
});
