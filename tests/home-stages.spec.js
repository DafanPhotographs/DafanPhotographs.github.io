// @ts-check
const { test, expect } = require("@playwright/test");
const { PNG } = require("pngjs");

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
 * @param {import("@playwright/test").Page} page
 */
async function headerInvertBlend(page) {
  return page.locator(".page-home .site-header--overlay").evaluate((el) => {
    const s = getComputedStyle(el);
    return { mixBlendMode: s.mixBlendMode, color: s.color };
  });
}

async function pickLang(page, lang) {
  const current = await page.evaluate(() => document.documentElement.lang || localStorage.getItem("dafan-lang") || "zh");
  if (current === lang) return;
  await page.locator(`.lang-switch__btn[data-set-lang="${lang}"]`).click();
}

async function wordmarkSourceWhite(page) {
  return page.locator(".page-home .wordmark").evaluate((el) => getComputedStyle(el).color);
}

/** Source paint must stay #fff; contrast is from difference compositing (not computed color). */
function isWhiteSource(cssColor) {
  const m = cssColor.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (m) return Number(m[1]) >= 250 && Number(m[2]) >= 250 && Number(m[3]) >= 250;
  return cssColor === "white" || cssColor === "#fff" || cssColor === "#ffffff";
}

/**
 * Lowest RGB delta vs |255−bg| inside the G24 wordmark bbox (same-frame probe).
 * @param {import("@playwright/test").Page} page
 * @param {string} [selector]
 */
async function wordmarkCompositedInvertErr(page, selector = ".wordmark") {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return { ok: false, reason: "no-box" };
  const vp = page.viewportSize();
  const clip = { x: 0, y: 0, width: vp.width, height: Math.min(160, vp.height) };
  await page.addStyleTag({
    content:
      "html.probe-hide-header-chrome .header-chrome { visibility: hidden !important; }",
  });
  await page.evaluate(() => document.documentElement.classList.add("probe-hide-header-chrome"));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const bgBuf = await page.screenshot({ clip });
  await page.evaluate(() => document.documentElement.classList.remove("probe-hide-header-chrome"));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const fgBuf = await page.screenshot({ clip });
  const bg = PNG.sync.read(bgBuf);
  const fg = PNG.sync.read(fgBuf);
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(bg.width, Math.ceil(box.x + box.width));
  const y1 = Math.min(bg.height, Math.ceil(box.y + box.height));
  let minErr = Infinity;
  let best = null;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (bg.width * y + x) << 2;
      const d =
        Math.abs(fg.data[i] - bg.data[i]) +
        Math.abs(fg.data[i + 1] - bg.data[i + 1]) +
        Math.abs(fg.data[i + 2] - bg.data[i + 2]);
      if (d < 40) continue;
      const bgRgb = [bg.data[i], bg.data[i + 1], bg.data[i + 2]];
      const compRgb = [fg.data[i], fg.data[i + 1], fg.data[i + 2]];
      const expected = bgRgb.map((b) => Math.abs(255 - b));
      const err = compRgb.reduce((sum, c, j) => sum + Math.abs(c - expected[j]), 0);
      if (err < minErr) {
        minErr = err;
        best = { err, bgRgb, compRgb, expected, diffSum: d };
      }
    }
  }
  return { ok: true, minErr, best };
}

/**
 * @param {import("@playwright/test").Page} page
 */
/**
 * Scroll until closing is the current screen (photo zone end at header).
 * @param {import("@playwright/test").Page} page
 */
async function scrollToClosingFrame(page) {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const done = await page.evaluate((nudge) => {
      const end = document.querySelector("[data-home-photo-zone-end]");
      const header = document.querySelector(".site-header");
      if (!end || !header) return false;
      const headerH = header.getBoundingClientRect().height;
      if (end.getBoundingClientRect().top <= headerH + 0.5) {
        if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
        return true;
      }
      const target = end.getBoundingClientRect().top + window.scrollY - headerH + nudge;
      window.scrollTo(0, Math.max(0, target));
      if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
      return false;
    }, Math.min(140, attempt * 52));
    if (done) break;
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(400);
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function closingBottomAlignMetrics(page) {
  return page.evaluate(() => {
    const closing = document.querySelector(".home-closing");
    const bar = document.querySelector(".home-closing__bar");
    const cta = document.querySelector(".home-closing__cta.lang-zh-only");
    const topBtn = document.querySelector(".home-closing__top");
    const tag = document.querySelector(".home-closing__tagline");
    if (!closing || !bar || !cta || !topBtn || !tag) return null;
    const vh = window.innerHeight;
    const cs = getComputedStyle(closing);
    const padBottom = parseFloat(cs.paddingBottom);
    const cRect = closing.getBoundingClientRect();
    const bRect = bar.getBoundingClientRect();
    const ctaRect = cta.getBoundingClientRect();
    const topRect = topBtn.getBoundingClientRect();
    const ruleTop = bRect.top - parseFloat(getComputedStyle(bar).paddingTop);
    return {
      vh,
      closingHeight: cRect.height,
      closingTop: cRect.top,
      closingBottomGap: Math.abs(cRect.bottom - vh),
      padBottom,
      metaBottomGap: vh - bRect.bottom,
      ctaToRule: ruleTop - ctaRect.bottom,
      midDiff: Math.abs((ctaRect.top + ctaRect.bottom) / 2 - (topRect.top + topRect.bottom) / 2),
      tagTop: tag.getBoundingClientRect().top,
      ctaInViewport: ctaRect.bottom <= vh + 1,
    };
  });
}

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
    await expect(page.locator('[data-home-scene="0"] .home-scene-title')).toBeInViewport();
    await expect(page.locator("[data-hero-slide], .hero-slides, .hero-stack")).toHaveCount(0);

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

  test("1440: closing screen enters viewport; IG link focusable", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("End");
    await page.waitForTimeout(600);

    const igLink = page.locator(".home-closing__ig");
    await expect(igLink).toBeInViewport();
    await igLink.focus();
    await expect(igLink).toBeFocused();
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
    await expect(page.locator("[data-hero-pill], [data-hero-slide]")).toHaveCount(0);
    const active = await activeSceneIndex(page);
    const inactiveTabs = await page.evaluate((activeIdx) => {
      return [0, 1, 2]
        .filter((i) => String(i) !== activeIdx)
        .map((i) => {
          const el = document.querySelector('[data-home-scene="' + i + '"]');
          return el ? el.tabIndex : null;
        });
    }, active);
    for (const tab of inactiveTabs) {
      expect(tab).toBe(-1);
    }
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

  test("1024 coarse pointer: home featured motion on (HOME_MOTION_MQ)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: LAPTOP,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    expect(await motionEnabled(page)).toBe(true);
    await context.close();
  });

  test("768 and 375: featured stack motion on; closing reachable by scroll", async ({ page }) => {
    for (const size of [TABLET, NARROW, NARROW_390]) {
      await page.setViewportSize(size);
      await page.goto(HOME);
      await page.waitForLoadState("networkidle");
      expect(await motionEnabled(page)).toBe(true);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      );
      expect(overflow).toBe(true);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(page.locator(".home-closing__cta").first()).toBeInViewport();
    }
  });

  test("langchange does not duplicate ScrollTrigger instances", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    const before = await page.evaluate(() =>
      typeof ScrollTrigger !== "undefined" ? ScrollTrigger.getAll().length : 0
    );
    await pickLang(page, "en");
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
    await expect(page.locator(".home-closing")).toBeInViewport();
    const gap = await page.evaluate(() => {
      const f = document.querySelector(".home-closing");
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
    await expect(page.locator(".home-closing__tagline")).toBeInViewport();
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

  test("overlay header: no gradient scrim; chrome uses difference + white source", async ({
    page,
  }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    const scrim = await page.evaluate(() => {
      const h = document.querySelector(".site-header--overlay");
      if (!h) return "missing";
      return getComputedStyle(h, "::before").content;
    });
    expect(scrim).toBe("none");
    const blend = await headerInvertBlend(page);
    expect(blend.mixBlendMode).toBe("difference");
    expect(isWhiteSource(await wordmarkSourceWhite(page))).toBe(true);
  });

  test("G24 wordmark: composited difference on bright sky (1440 + 375)", async ({ page }) => {
    const threshold = 48;
    for (const vp of [MOTION_VIEWPORT, NARROW]) {
      await page.setViewportSize(vp);
      await page.goto(HOME);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);
      const wm = await wordmarkCompositedInvertErr(page);
      expect(wm.ok).toBe(true);
      expect(wm.minErr).toBeLessThanOrEqual(threshold);
      const nav = await wordmarkCompositedInvertErr(page, ".nav-link-label");
      expect(nav.ok).toBe(true);
      expect(nav.minErr).toBeLessThanOrEqual(threshold);
    }
  });

  test("difference header 375/390/768/1440: white source, dropdown lang switch", async ({
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
      const blend = await headerInvertBlend(page);
      expect(blend.mixBlendMode).toBe("difference");
      await expect(page.locator('.lang-switch__btn[data-set-lang="zh"]')).toHaveAttribute("aria-checked", "true");
      const src = await page.locator('.lang-switch__btn[data-set-lang="zh"]').evaluate((el) => getComputedStyle(el).color);
      expect(isWhiteSource(src)).toBe(true);
      await pickLang(page, "en");
      await page.waitForTimeout(150);
      await expect(page.locator('.lang-switch__btn[data-set-lang="en"]')).toHaveAttribute("aria-checked", "true");
      await pickLang(page, "zh");
    }
  });

  test("solid, works, no-js: blend normal and dark source text", async ({ page, browser }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(450);
    if ((await page.locator(".site-header--solid").count()) > 0) {
      const hdr = await page.locator(".site-header").evaluate((el) => ({
        blend: getComputedStyle(el).mixBlendMode,
      }));
      expect(hdr.blend).toBe("normal");
    }

    await page.goto("/works/");
    await page.waitForLoadState("networkidle");
    const worksBlend = await page.locator(".site-header").evaluate((el) => getComputedStyle(el).mixBlendMode);
    expect(worksBlend).toBe("normal");

    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: NARROW });
    const noJs = await ctx.newPage();
    await noJs.goto(HOME);
    const noJsChrome = await noJs.locator(".header-chrome").evaluate((el) => ({
      blend: getComputedStyle(el).mixBlendMode,
      color: getComputedStyle(el).color,
    }));
    expect(noJsChrome.blend).toBe("normal");
    expect(isWhiteSource(noJsChrome.color)).toBe(false);
    await ctx.close();
  });

  test("1024 fine: header difference on home overlay", async ({ browser }) => {
    const context = await browser.newContext({ viewport: LAPTOP, hasTouch: false });
    const page = await context.newPage();
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    const blend = await headerInvertBlend(page);
    expect(blend.mixBlendMode).toBe("difference");
    await context.close();
  });

  test("header focus-visible keeps isolate ring on overlay", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);
    const focusMix = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || !el.closest(".site-header")) return null;
      return getComputedStyle(el).mixBlendMode;
    });
    if (focusMix) expect(focusMix === "normal" || focusMix === "isolate").toBeTruthy();
  });

  test("journey home → works → series → contact without dead ends", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.locator('.site-nav a[href="./works/"]').click();
    await expect(page).toHaveURL(/\/works\/$/);
    await page.locator('a[href="./bipenggou/"]').click();
    await expect(page).toHaveURL(/bipenggou/);
    await page.locator('.site-nav a[href="../../contact/"]').click();
    await expect(page).toHaveURL(/\/contact\/$/);
    await page.locator('.wordmark[href="../"]').click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("EN visible nav label contrast uses real label not hidden decor", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await pickLang(page, "en");
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

  test("scrollTrigger: three sticky-scale scenes, no pin", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    const pins = await page.evaluate(() =>
      ScrollTrigger.getAll().filter((st) => st.vars && st.vars.pin === true).length
    );
    const count = await page.evaluate(() => ScrollTrigger.getAll().length);
    expect(pins).toBe(0);
    expect(count).toBe(3);
  });

  test("featured scenes use CSS sticky stack z-order (not yPercent slide)", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    const stack = await page.evaluate(() => {
      const panels = [0, 1, 2].map((i) => document.querySelector('[data-home-scene="' + i + '"]'));
      if (panels.some((p) => !p)) return null;
      const styles = panels.map((p) => {
        const s = getComputedStyle(p);
        return {
          position: s.position,
          top: s.top,
          z: s.zIndex,
          height: p.getBoundingClientRect().height,
          yPercent: typeof gsap !== "undefined" ? gsap.getProperty(p, "yPercent") : 0,
        };
      });
      return { styles, vh: window.innerHeight };
    });
    expect(stack).not.toBeNull();
    for (const row of stack.styles) {
      expect(row.position).toBe("sticky");
      expect(row.top).toBe("0px");
      expect(row.yPercent).toBe(0);
      expect(row.height).toBeGreaterThanOrEqual(stack.vh * 0.92);
    }
    expect(Number(stack.styles[1].z)).toBeGreaterThan(Number(stack.styles[0].z));
    expect(Number(stack.styles[2].z)).toBeGreaterThan(Number(stack.styles[1].z));
  });

  test("hash deep link focuses featured scene in document", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto("/#home-scene-bipenggou");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
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

  test("375/390/768 zh-en cycle closing and nav", async ({ page }) => {
    for (const size of [NARROW, NARROW_390, TABLET]) {
      for (const lang of ["zh", "en"]) {
        await page.setViewportSize(size);
        await page.goto(HOME);
        await page.waitForLoadState("networkidle");
        if (lang === "en") await pickLang(page, "en");
        const label = await visibleNavWorkLabel(page);
        await expect(label).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await expect(page.locator(".home-closing__ig")).toBeInViewport();
      }
    }
  });

  test("1440: overlay entry scene1 scale near from (not ~1)", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    let best = null;
    for (let y = 0; y <= 1200; y += 6) {
      await page.evaluate((ys) => {
        window.scrollTo(0, ys);
        ScrollTrigger.update();
      }, y);
      await page.waitForTimeout(25);
      const m = await page.evaluate(() => {
        const s1 = document.querySelector('[data-home-scene="1"]');
        const vh = window.innerHeight;
        const band = s1 ? Math.max(0, vh - s1.getBoundingClientRect().top) : 0;
        const media = s1 && s1.querySelector(".home-scene-media-scale");
        const scale = media ? Number(gsap.getProperty(media, "scale")) : null;
        return { band, scale, y: window.scrollY };
      });
      if (m.band > 180 && m.band < 420 && m.scale != null) {
        if (!best || Math.abs(m.band - 260) < Math.abs(best.band - 260)) best = m;
      }
    }
    expect(best).not.toBeNull();
    expect(best.scale).toBeGreaterThanOrEqual(0.74);
    expect(best.scale).toBeLessThan(0.88);
  });

  test("1440: scene0 rest cover full bleed (A-lock fromTo + CSS cover)", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
    });
    await page.waitForTimeout(400);
    const rest = await page.evaluate(() => {
      const token = parseFloat(getComputedStyle(document.body).getPropertyValue("--media-scale-from"));
      const media0 = document.querySelector('[data-home-scene="0"] .home-scene-media-scale');
      const stage = document.querySelector('[data-home-scene="0"] .home-scene-stage');
      const img = media0 && media0.querySelector("img");
      const scale =
        media0 && typeof gsap !== "undefined" ? Number(gsap.getProperty(media0, "scale")) : null;
      const mediaRect = media0 ? media0.getBoundingClientRect() : null;
      const stageRect = stage ? stage.getBoundingClientRect() : null;
      const imgRect = img ? img.getBoundingClientRect() : null;
      const topGap =
        imgRect && stageRect ? Math.max(0, stageRect.top - imgRect.top >= 0 ? imgRect.top - stageRect.top : 0) : null;
      const leadingBlack =
        imgRect && stageRect
          ? imgRect.top > stageRect.top + 0.5 || imgRect.left > stageRect.left + 0.5
          : null;
      return { scale, token, topGap, leadingBlack, scrollY: window.scrollY };
    });
    expect(rest.scale).toBeGreaterThanOrEqual(0.74);
    expect(rest.scale).toBeLessThanOrEqual(0.76);
    expect(rest.topGap).not.toBeNull();
    expect(rest.topGap).toBeLessThan(2);
    expect(rest.leadingBlack).toBe(false);
  });

  test("1440: transition 0→1 scale monotonic early≤mid≤late (no V curve)", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    const fromToken = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.body).getPropertyValue("--media-scale-from"))
    );
    const picks = [];
    for (const progress of [0.2, 0.5, 0.92]) {
      await page.evaluate((p) => {
        const st = ScrollTrigger.getAll().find((t) => t.vars && t.vars.id === "home-scene-0");
        if (!st) throw new Error("missing home-scene-0");
        window.scrollTo(0, st.start + (st.end - st.start) * p);
        ScrollTrigger.update();
      }, progress);
      await page.waitForTimeout(400);
      const scale = await page.evaluate(() => {
        const media = document.querySelector('[data-home-scene="0"] .home-scene-media-scale');
        return media ? Number(gsap.getProperty(media, "scale")) : null;
      });
      picks.push({ progress, scale });
    }
    expect(fromToken).toBeLessThan(0.92);
    expect(picks[0].scale).toBeGreaterThanOrEqual(fromToken - 0.02);
    expect(picks[0].scale).toBeLessThanOrEqual(fromToken + 0.05);
    expect(picks[1].scale).toBeGreaterThan(picks[0].scale - 0.01);
    expect(picks[2].scale).toBeGreaterThan(picks[1].scale - 0.01);
    expect(picks[2].scale).toBeGreaterThan(0.94);
  });

  test("featured panel: mid-scroll media scale between token and 1", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      const st = ScrollTrigger.getAll().find((t) => t.vars && t.vars.id === "home-scene-1");
      if (!st) throw new Error("missing home-scene-1");
      window.scrollTo(0, st.start + (st.end - st.start) * 0.48);
      ScrollTrigger.update();
    });
    await page.waitForTimeout(450);
    const metrics = await page.evaluate(() => {
      const panel = document.querySelector('[data-home-scene="1"]');
      const media = panel && panel.querySelector(".home-scene-media-scale");
      if (!panel || !media || typeof gsap === "undefined") return null;
      const mediaScale = gsap.getProperty(media, "scale");
      return {
        scale: mediaScale,
        panelYPercent: gsap.getProperty(panel, "yPercent"),
        stageOverflow: getComputedStyle(panel.querySelector(".home-scene-stage")).overflow,
      };
    });
    expect(metrics).not.toBeNull();
    expect(metrics.scale).toBeGreaterThan(0.75);
    expect(metrics.scale).toBeLessThan(1);
    expect(metrics.panelYPercent).toBe(0);
    expect(metrics.stageOverflow).toBe("hidden");
  });

  test("375: featured stack uses mobile scale-from token", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    const token = await page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue("--media-scale-from-mobile").trim()
    );
    expect(token).toBe("0.6");
    await page.mouse.move(188, 400);
    for (let i = 0; i < 12; i += 1) {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(400);
    const scale = await page.evaluate(() => {
      const media = document.querySelector('[data-home-scene="2"] .home-scene-media-scale');
      if (!media || typeof gsap === "undefined") return null;
      return gsap.getProperty(media, "scale");
    });
    if (scale !== null && scale < 1) {
      expect(scale).toBeGreaterThanOrEqual(0.6);
      expect(scale).toBeLessThan(1);
    }
  });

  test("featured panels have no home-scene-overlay; links keep series aria-label", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    const featured = page.locator(".featured-panel.home-scene");
    await expect(featured).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      await expect(featured.nth(i).locator(".home-scene-overlay")).toHaveCount(0);
      const label = await featured.nth(i).getAttribute("aria-label");
      expect(label).toBeTruthy();
    }
  });

  test("photo rail: left scene title uses difference, tracks active scene", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-hero-copy-pin], [data-hero-scene-title]")).toHaveCount(0);
    const blend = await page.locator(".home-scene-title-blend").first().evaluate((el) => getComputedStyle(el).mixBlendMode);
    expect(blend).toBe("difference");
    const y0 = await page.locator('[data-home-scene="0"] .home-scene-title').evaluate((el) => el.getBoundingClientRect().top);
    await wheelScroll(page, 22, 400);
    expect(await sceneDominatesViewport(page, 1)).toBe(true);
    const featuredTitleY = await page.evaluate(() => {
      const el = document.querySelector('[data-home-scene="1"] .home-scene-title');
      return el ? el.getBoundingClientRect().top : 0;
    });
    const vh = await page.evaluate(() => window.innerHeight);
    expect(Math.abs(featuredTitleY - vh / 2)).toBeLessThan(140);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(450);
    const yBack = await page.locator('[data-home-scene="0"] .home-scene-title').evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(yBack - y0)).toBeLessThan(80);
  });

  test("1440: scene0→1 mid matches sticky peek + media scale (same family as 1→2)", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      const st = ScrollTrigger.getAll().find((t) => t.vars && t.vars.id === "home-scene-0");
      if (!st) throw new Error("missing home-scene-0");
      const y = st.start + (st.end - st.start) * 0.5;
      window.scrollTo(0, y);
      ScrollTrigger.update();
    });
    await page.waitForTimeout(450);
    const metrics = await page.evaluate(() => {
      const scene0 = document.querySelector('[data-home-scene="0"]');
      const scene1 = document.querySelector('[data-home-scene="1"]');
      const r1 = scene1 ? scene1.getBoundingClientRect() : null;
      const scale0 =
        scene0 && typeof gsap !== "undefined"
          ? gsap.getProperty(scene0.querySelector(".home-scene-media-scale"), "scale")
          : null;
      const title = document.querySelector(".home-scene.is-stage-active .home-scene-title");
      return {
        nextBand: r1 ? Math.max(0, window.innerHeight - r1.top) : 0,
        scale0,
        title: title ? title.textContent.trim() : "",
      };
    });
    expect(metrics.nextBand).toBeGreaterThan(200);
    expect(metrics.scale0).toBeGreaterThan(0.75);
    expect(metrics.scale0).toBeLessThan(1);
    expect(metrics.title.length).toBeGreaterThan(0);
  });

  test("three photo scenes: distinct series titles at rest (no carousel)", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    const titles = await page.evaluate(() =>
      [0, 1, 2].map((i) => {
        const el = document.querySelector('[data-home-scene="' + i + '"] .home-scene-title');
        return el ? el.textContent.trim() : "";
      })
    );
    expect(titles[0]).toContain("毕棚沟");
    expect(titles[1]).toContain("峨眉山");
    expect(titles[2]).toContain("青岛");
    expect(new Set(titles).size).toBe(3);
    await page.waitForTimeout(1200);
    const still = await page.locator('[data-home-scene="0"] .home-scene-title').textContent();
    expect(still).toContain("毕棚沟");
  });

  test("closing bottom-align: 100svh, meta near viewport bottom (SPEC 20261108)", async ({ page }) => {
    const viewports = [
      { size: MOTION_VIEWPORT, label: "1440" },
      { size: { width: 1920, height: 1080 }, label: "1920" },
      { size: NARROW, label: "375" },
    ];
    for (const { size } of viewports) {
      await page.setViewportSize(size);
      await page.goto(HOME);
      await page.waitForLoadState("networkidle");
      await scrollToClosingFrame(page);
      const m = await closingBottomAlignMetrics(page);
      expect(m).not.toBeNull();
      expect(m.closingHeight).toBeGreaterThanOrEqual(m.vh * 0.98);
      expect(m.closingHeight).toBeLessThanOrEqual(m.vh * 1.02);
      expect(Math.abs(m.closingTop)).toBeLessThan(12);
      expect(m.closingBottomGap).toBeLessThan(8);
      expect(m.padBottom).toBeLessThanOrEqual(32);
      expect(m.metaBottomGap).toBeLessThanOrEqual(40);
      expect(m.ctaToRule).toBeGreaterThanOrEqual(4);
      expect(m.ctaToRule).toBeLessThanOrEqual(28);
      expect(m.midDiff).toBeLessThanOrEqual(24);
      expect(m.ctaInViewport).toBe(true);
      expect(m.tagTop).toBeLessThan(m.vh * 0.35);
    }
  });

  test("closing daofor screen: tagline, series links, CTA, solid header", async ({ page }) => {
    await page.setViewportSize(MOTION_VIEWPORT);
    await page.goto(HOME);
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("End");
    await page.waitForTimeout(500);
    await expect(page.locator(".home-closing__tagline")).toBeVisible();
    await expect(page.locator(".home-tagline-repeat")).toHaveCount(0);
    await expect(page.locator('.home-closing__link[href="./works/bipenggou/"]')).toBeVisible();
    await expect(page.locator(".home-closing__cta.lang-zh-only")).toHaveAttribute("href", /contact/);
    const hdr = await page.locator(".site-header--solid").count();
    expect(hdr).toBeGreaterThan(0);
    const wordmarkColor = await page.locator(".site-header--solid .wordmark").evaluate((el) => getComputedStyle(el).color);
    expect(isWhiteSource(wordmarkColor)).toBe(false);
  });

});
