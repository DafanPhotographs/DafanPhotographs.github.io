// @ts-check
const { test, expect } = require("@playwright/test");

const WORKS = "/works/";
const DESKTOP = { width: 1440, height: 900 };
const NARROW = { width: 375, height: 812 };
const TABLET = { width: 768, height: 1024 };

async function motionActive(page) {
  return page.locator("[data-works-horizontal]").evaluate((el) =>
    el.classList.contains("works-horizontal--active")
  );
}

async function horizontalST(page) {
  return page.evaluate(() => {
    if (typeof ScrollTrigger === "undefined") return { present: false };
    const st = ScrollTrigger.getById("works-horizontal");
    return { present: !!st, id: st && st.vars && st.vars.id };
  });
}

async function trackIsRow(page) {
  return page.locator("[data-works-track]").evaluate((el) => getComputedStyle(el).flexDirection);
}

test.describe("Works horizontal motion (PR #10 port on #11)", () => {
  test("1440 fine: horizontal active and ScrollTrigger id works-horizontal", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(WORKS);
    await page.waitForLoadState("networkidle");
    await expect.poll(async () => motionActive(page)).toBe(true);
    const st = await horizontalST(page);
    expect(st.present).toBe(true);
    expect(await trackIsRow(page)).toBe("row");
  });

  test("375: vertical flow, motion class off", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto(WORKS);
    await page.waitForLoadState("networkidle");
    expect(await motionActive(page)).toBe(false);
    expect(await trackIsRow(page)).toBe("column");
  });

  test("768: vertical flow (no desktop MOTION_MQ)", async ({ page }) => {
    await page.setViewportSize(TABLET);
    await page.goto(WORKS);
    await page.waitForLoadState("networkidle");
    expect(await motionActive(page)).toBe(false);
  });

  test("reduced motion: horizontal off at 1440", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(DESKTOP);
    await page.goto(WORKS);
    await page.waitForLoadState("networkidle");
    expect(await motionActive(page)).toBe(false);
  });

  test("filter change dispatches works-filter-change and keeps nav 作品/Work", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(WORKS);
    await page.waitForLoadState("networkidle");
    let fired = false;
    await page.evaluate(() => {
      document.addEventListener("works-filter-change", () => {
        window.__worksFilterFired = true;
      });
    });
    await page.locator('[data-filter="travel"]').click();
    fired = await page.evaluate(() => window.__worksFilterFired === true);
    expect(fired).toBe(true);
    await expect(page.locator('.nav-link-label.lang-zh-only[data-i18n="nav.work"]')).toBeVisible();
    await page.locator('.lang-switch__btn[data-set-lang="en"]').click();
    await expect(page.locator(".lang-en-only.nav-link-label").filter({ hasText: "Work" })).toBeVisible();
    await expect.poll(async () => motionActive(page)).toBe(true);
  });

  test("no ScrollTrigger: page remains usable", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.route("**/ScrollTrigger.min.js", (route) => route.abort());
    await page.goto(WORKS);
    await page.waitForLoadState("domcontentloaded");
    expect(await motionActive(page)).toBe(false);
    await expect(page.locator(".series-card").first()).toBeVisible();
  });
});
