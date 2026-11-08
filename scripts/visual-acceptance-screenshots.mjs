import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "/opt/cursor/artifacts/visual-acceptance";
mkdirSync(OUT, { recursive: true });

const base = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const shots = [];

async function serve() {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const child = spawn("python3", ["-m", "http.server", "8765", "--bind", "127.0.0.1"], {
      cwd: new URL("..", import.meta.url).pathname,
      stdio: "ignore",
    });
    setTimeout(() => resolve(child), 600);
  });
}

async function run() {
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: join(OUT, "desktop-hero.png"), fullPage: false });
  shots.push("desktop-hero.png");

  for (let i = 0; i < 18; i += 1) {
    await page.mouse.wheel(0, 320);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, "desktop-featured-mid.png"), fullPage: false });
  shots.push("desktop-featured-mid.png");

  const fromShot = await page.evaluate(() => {
    const media = document.querySelector('[data-home-scene="2"] .home-scene-media-scale');
    if (media && typeof gsap !== "undefined") {
      gsap.set(media, { scale: 0.75, xPercent: -50, yPercent: -50 });
    }
  });
  void fromShot;
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, "desktop-scale-from.png"), fullPage: false });
  shots.push("desktop-scale-from.png");

  await page.keyboard.press("End");
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, "desktop-closing.png"), fullPage: false });
  shots.push("desktop-closing.png");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${base}/`);
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 16; i += 1) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(OUT, "mobile-featured-mid.png"), fullPage: false });
  shots.push("mobile-featured-mid.png");

  await page.keyboard.press("End");
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(OUT, "mobile-closing.png"), fullPage: false });
  shots.push("mobile-closing.png");

  await browser.close();
  server.kill("SIGTERM");
  console.log(JSON.stringify({ out: OUT, shots }, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
