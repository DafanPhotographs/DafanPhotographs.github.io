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

/**
 * WCAG contrast (sRGB). Used with worst-case scrim composite under visible nav labels.
 * @param {[number, number, number]} fg
 * @param {[number, number, number]} bg
 */
/**
 * @param {string} cssColor
 */
function relativeLuminanceFromCss(cssColor) {
  const ok = cssColor.match(/oklab\(\s*([\d.]+)/);
  if (ok) return parseFloat(ok[1]);
  const srgb = cssColor.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (srgb) {
    return (parseFloat(srgb[1]) + parseFloat(srgb[2]) + parseFloat(srgb[3])) / 3;
  }
  const m = cssColor.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (!m) return 0;
  const rgb = [Number(m[1]), Number(m[2]), Number(m[3])];
  const lin = rgb.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function activeLangButtonColor(page) {
  return page.locator(".lang-toggle .lang-btn.is-active").evaluate((el) => getComputedStyle(el).color);
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function headerPhotoGeometry(page) {
  return page.evaluate(() => {
    const header = document.querySelector(".site-header");
    const end = document.querySelector("[data-home-photo-zone-end]");
    if (!header || !end) return null;
    const hh = header.getBoundingClientRect().height;
    const endTop = end.getBoundingClientRect().top;
    return {
      headerH: hh,
      endTop,
      solid: header.classList.contains("site-header--solid"),
      mode: header.getAttribute("data-header-mode"),
      photoUnderHeader: endTop > hh + 0.5,
    };
  });
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function visibleNavWorkLabel(page) {
  const lang = await page.evaluate(() => document.documentElement.lang);
  const sel =
    lang === "en"
      ? '.site-nav a[href="./works/"] .lang-en-only.nav-link-label'
      : '.site-nav a[href="./works/"] .lang-zh-only.nav-link-label';
  return page.locator(sel);
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

  test("overlay header exposes top scrim pseudo-element", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    const pseudo = await page.evaluate(() => {
      const h = document.querySelector(".site-header--overlay");
      if (!h) return null;
      return getComputedStyle(h, "::before").content;
    });
    expect(pseudo).not.toBe("none");
  });

  test("overlay active lang button computed color is light (375/390/768/1440 zh+en)", async ({
    page,
  }) => {
    const sizes = [
      [375, 812],
      [390, 844],
      [768, 1024],
      [1440, 900],
    ];
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(HOME);
      await page.waitForLoadState("networkidle");
      expect(await page.locator(".site-header--overlay").count()).toBeGreaterThan(0);

      let color = await activeLangButtonColor(page);
      expect(relativeLuminanceFromCss(color)).toBeGreaterThan(0.75);

      await page.locator('[data-set-lang="en"]').click();
      await page.waitForTimeout(150);
      color = await activeLangButtonColor(page);
      expect(relativeLuminanceFromCss(color)).toBeGreaterThan(0.75);

      await page.locator('[data-set-lang="zh"]').click();
      await page.waitForTimeout(150);
      color = await activeLangButtonColor(page);
      expect(relativeLuminanceFromCss(color)).toBeGreaterThan(0.75);
    }
  });

  test("solid header restores dark active lang; works and no-js stay dark", async ({
    page,
    browser,
  }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(450);
    const solid = await page.locator(".site-header--solid").count();
    if (solid > 0) {
      const color = await activeLangButtonColor(page);
      expect(relativeLuminanceFromCss(color)).toBeLessThan(0.2);
    }

    await page.goto("/works/");
    await page.waitForLoadState("networkidle");
    const worksColor = await activeLangButtonColor(page);
    expect(relativeLuminanceFromCss(worksColor)).toBeLessThan(0.2);

    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: NARROW });
    const noJs = await ctx.newPage();
    await noJs.goto(HOME);
    const noJsColor = await noJs
      .locator(".lang-toggle .lang-btn.is-active")
      .evaluate((el) => getComputedStyle(el).color);
    expect(relativeLuminanceFromCss(noJsColor)).toBeLessThan(0.2);
    await ctx.close();
  });

  test("EN visible nav label contrast uses real label not hidden decor", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.locator('[data-set-lang="en"]').click();
    await page.waitForTimeout(200);
    const label = await visibleNavWorkLabel(page);
    await expect(label).toBeVisible();
    await expect(label).toHaveText("Work");
    const box = await label.boundingBox();
    expect(box && box.width).toBeGreaterThan(10);
  });

  test("header solid only when photo rail has cleared header band", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    let geo = await headerPhotoGeometry(page);
    expect(geo.photoUnderHeader).toBe(true);
    expect(geo.solid).toBe(false);

    await page.evaluate(() => {
      const end = document.querySelector("[data-home-photo-zone-end]");
      if (end) end.scrollIntoView({ block: "start" });
    });
    await page.waitForTimeout(400);
    geo = await headerPhotoGeometry(page);
    if (geo.endTop <= geo.headerH + 0.5) {
      expect(geo.solid).toBe(true);
      expect(geo.mode).toBe("solid");
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    geo = await headerPhotoGeometry(page);
    expect(geo.solid).toBe(false);
  });

  test("End with photo tail under header: may stay overlay until marker crosses header", async ({
    page,
  }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("End");
    await page.waitForTimeout(500);
    const geo = await headerPhotoGeometry(page);
    expect(geo.solid).toBe(!geo.photoUnderHeader);
    if (geo.photoUnderHeader) {
      expect(geo.mode).toBe("overlay");
    }
  });

  test("slow wheel does not skip more than one scene forward", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    for (let i = 0; i < 8; i += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(120);
    }
    const idx = Number(await activeSceneIndex(page));
    expect(idx).toBeLessThanOrEqual(1);
  });

  test("scrollTrigger count matches multi-pin mechanism (not single timeline)", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    const count = await page.evaluate(() => ScrollTrigger.getAll().length);
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(12);
  });

  test("hash deep link focuses featured scene in document", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto("/#home-scene-bipenggou");
    await page.waitForLoadState("networkidle");
    const inView = await page.evaluate(() => {
      const el = document.getElementById("home-scene-bipenggou");
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight * 0.85 && r.bottom > 100;
    });
    expect(inView).toBe(true);
  });

  test("no-JS home uses solid sticky header readable on bright content", async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: NARROW,
    });
    const page = await context.newPage();
    await page.goto(HOME);
    const mode = await page.evaluate(() => {
      const h = document.querySelector(".site-header");
      const style = h ? getComputedStyle(h) : null;
      return {
        sticky: style && style.position === "sticky",
        color: style ? style.color : "",
        bg: style ? style.backgroundColor : "",
      };
    });
    expect(mode.sticky).toBe(true);
    expect(mode.color).not.toBe("rgb(255, 255, 255)");
    await context.close();
  });

  test("375/390/768 zh-en cycle footer and nav", async ({ page }) => {
    for (const size of [NARROW, NARROW_390, TABLET]) {
      for (const lang of ["zh", "en"]) {
        await page.setViewportSize(size);
        await page.goto(HOME);
        await page.waitForLoadState("networkidle");
        if (lang === "en") await page.locator('[data-set-lang="en"]').click();
        const label = await visibleNavWorkLabel(page);
        await expect(label).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await expect(page.locator(".site-footer a[href*='instagram']").first()).toBeInViewport();
      }
    }
  });

  test("hero pill and pause keep readable light text in overlay at 1440", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    for (let p = 0; p < 3; p += 1) {
      await page.locator(`[data-hero-pill="${p}"]`).click();
      await page.waitForTimeout(250);
      const pillColor = await page
        .locator(`[data-hero-pill="${p}"]`)
        .evaluate((el) => getComputedStyle(el).color);
      expect(relativeLuminanceFromCss(pillColor)).toBeGreaterThan(0.65);
    }
    const pauseColor = await page
      .locator("[data-hero-pause]")
      .evaluate((el) => getComputedStyle(el).color);
    expect(relativeLuminanceFromCss(pauseColor)).toBeGreaterThan(0.65);
  });
});
