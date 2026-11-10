// @ts-check
const { test, expect } = require("@playwright/test");

/** Routes that use the shared site header (lang toggle present). */
const HEADER_ROUTES = [
  "/",
  "/photography/",
  "/about/",
  "/contact/",
];

const NARROW_WIDTHS = [320, 375, 390];
const ALL_CHECK_WIDTHS = [320, 375, 390, 768, 1440];

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} lang
 */
async function pickLang(page, lang) {
  const current = await page.evaluate(() => document.documentElement.lang || localStorage.getItem("dafan-lang") || "zh");
  if (current === lang) return;
  await page.locator(`.lang-switch__btn[data-set-lang="${lang}"]`).click();
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function langToggleLayoutOk(page) {
  return page.evaluate(() => {
    const el = document.querySelector(".lang-switch");
    const header = document.querySelector(".site-header");
    if (!el || !header) return { ok: false, reason: "missing" };
    const rect = el.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const scrollW = document.documentElement.scrollWidth;
    const inViewport =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top >= -0.5 &&
      rect.left >= -0.5 &&
      rect.right <= vw + 0.5;
    const withinHeader =
      rect.top >= headerRect.top - 0.5 &&
      rect.bottom <= headerRect.bottom + 0.5 &&
      rect.left >= headerRect.left - 0.5 &&
      rect.right <= headerRect.right + 0.5;
    const noOverflow = scrollW <= vw + 0.5;
    return {
      ok: inViewport && withinHeader && noOverflow,
      inViewport,
      withinHeader,
      noOverflow,
      rect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom },
      headerRect: {
        top: headerRect.top,
        bottom: headerRect.bottom,
        height: headerRect.height,
      },
      scrollW,
      vw,
    };
  });
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} lang
 */
async function expectLangExclusive(page, lang) {
  const state = await page.evaluate(() => {
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
  });
  expect(state.lang).toBe(lang);
  if (lang === "en") {
    expect(state.enVisible).toBeGreaterThan(0);
    expect(state.zhVisible).toBe(0);
  } else {
    expect(state.zhVisible).toBeGreaterThan(0);
    expect(state.enVisible).toBe(0);
  }
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function expectLangToggleOperable(page) {
  const layout = await langToggleLayoutOk(page);
  expect(layout.ok, JSON.stringify(layout)).toBeTruthy();
  await expect(page.locator(".lang-switch")).toBeVisible();
  await expect(page.locator(".lang-switch__btn")).toHaveCount(2);
  const currentLang = await page.evaluate(() => document.documentElement.lang || "zh");
  const alt = currentLang === "en" ? "zh" : "en";
  await expect(page.locator(`.lang-switch__btn[data-set-lang="${currentLang}"]`)).toHaveAttribute(
    "aria-checked",
    "true"
  );
  await expect(page.locator(`.lang-switch__btn[data-set-lang="${alt}"]`)).toBeEnabled();
  await page.locator(`.lang-switch__btn[data-set-lang="${alt}"]`).click();
  await expect(page.locator("html")).toHaveAttribute("lang", alt);
}

test.describe("QA F3 — header language toggle on narrow viewports", () => {
  for (const route of HEADER_ROUTES) {
    for (const startLang of ["zh", "en"]) {
      test(`${startLang.toUpperCase()} then narrow: operable lang toggle on ${route}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(route);
        if (startLang === "en") {
          await pickLang(page, "en");
          await expectLangExclusive(page, "en");
        }

        for (const w of NARROW_WIDTHS) {
          await page.setViewportSize({ width: w, height: 812 });
          await expectLangToggleOperable(page);
        }

        await pickLang(page, "zh");
        await expectLangExclusive(page, "zh");
        await pickLang(page, "en");
        await expectLangExclusive(page, "en");
        await pickLang(page, "zh");
        await expectLangExclusive(page, "zh");
      });
    }
  }

  test("desktop EN→narrow→EN→zh toggle cycle on home", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await pickLang(page, "en");
    await page.setViewportSize({ width: 375, height: 812 });
    await expectLangToggleOperable(page);

    await pickLang(page, "en");
    await expectLangExclusive(page, "en");
    await pickLang(page, "zh");
    await expectLangExclusive(page, "zh");
    await expectLangToggleOperable(page);
  });

  for (const w of ALL_CHECK_WIDTHS) {
    for (const lang of ["zh", "en"]) {
      test(`layout ${w}px ${lang.toUpperCase()} on /photography/`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto("/photography/");
        if (lang === "en") {
          await pickLang(page, "en");
        }
        await expectLangExclusive(page, lang);
        await expectLangToggleOperable(page);
        const other = lang === "en" ? "zh" : "en";
        await pickLang(page, other);
        await expectLangExclusive(page, other);
        await expectLangToggleOperable(page);
      });
    }
  }
});
