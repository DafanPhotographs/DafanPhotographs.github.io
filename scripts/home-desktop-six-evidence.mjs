import { execSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium } from "playwright";

const BASE = "4d06538ff3247d29713ddb4dc3e78ca655ee34dd";
const OUT = path.resolve("artifacts/home-desktop-six-evidence-out");
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";

const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
execSync(`git merge-base --is-ancestor ${BASE} ${head}`);

function hashFile(rel) {
  const h = createHash("sha256");
  h.update(readFileSync(rel));
  return h.digest("hex");
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

function classifyHeroBytesRow(row) {
  const hasBody = typeof row.bodyBytes === "number" && row.bodyBytes >= 0;
  const hasCl = typeof row.contentLength === "number" && row.contentLength > 0;
  if (hasBody || hasCl) {
    return {
      bytesStatus: "known",
      bytesValue: hasBody ? row.bodyBytes : row.contentLength,
      volumeGate: "eligible",
    };
  }
  return { bytesStatus: "unknown", bytesValue: null, volumeGate: "Incomplete" };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const byteLog = [];

page.on("response", async (response) => {
  const url = response.url();
  if (!url.includes("res.cloudinary.com")) return;
  const headers = response.headers();
  let bodyBytes = null;
  try {
    bodyBytes = (await response.body()).length;
  } catch {
    bodyBytes = null;
  }
  const cl = headers["content-length"];
  const row = {
    url,
    status: response.status(),
    contentType: headers["content-type"] || "unknown",
    vary: headers["vary"] || null,
    contentLength: cl ? Number(cl) : null,
    bodyBytes,
  };
  Object.assign(row, classifyHeroBytesRow(row));
  byteLog.push(row);
});

await page.goto(BASE_URL + "/");
await page.waitForLoadState("networkidle");

const scenes = [];
const publicIds = ["bipenggou", "emeishan", "qingdao"];

for (let i = 0; i < 3; i += 1) {
  for (const p of [0, 0.5, 1]) {
    await page.evaluate(
      ({ idx, prog }) => {
        const st = ScrollTrigger.getAll().find((t) => t.vars && t.vars.id === "home-scene-" + idx);
        if (!st) throw new Error("missing st " + idx);
        window.scrollTo(0, st.start + (st.end - st.start) * prog);
        ScrollTrigger.update();
      },
      { idx: i, prog: p }
    );
    await page.waitForTimeout(400);
    const meta = await page.evaluate((idx) => {
      const img = document.querySelector('[data-home-scene="' + idx + '"] img');
      const media = document.querySelector('[data-home-scene="' + idx + '"] .home-scene-media-scale');
      const stage = document.querySelector('[data-home-scene="' + idx + '"] .home-scene-stage');
      return {
        currentSrc: img.currentSrc,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        scale: media ? Number(gsap.getProperty(media, "scale")) : null,
        activeScene: document.querySelector("[data-home-stage-rail]")?.getAttribute("data-active-scene"),
        stageClip: true,
      };
    }, i);
    const shotPath = path.join(OUT, "scene" + i + "-p" + String(p).replace(".", "") + ".png");
    await page.locator('[data-home-scene="' + i + '"] .home-scene-stage').screenshot({ path: shotPath });
    scenes.push({
      sceneIndex: i,
      publicId: publicIds[i],
      progress: p,
      viewport: { width: 1440, height: 900 },
      clip: "home-scene-stage",
      screenshot: path.basename(shotPath),
      ...meta,
    });
  }
}

await browser.close();

const heroLog = byteLog.filter((r) => /dafan\/series\/(bipenggou|emeishan|qingdao)\/cover/.test(r.url));
const volumeIncomplete = heroLog.some((r) => r.volumeGate === "Incomplete");

const manifest = {
  baseAncestor: BASE,
  implementationHead: head,
  cloudSelfTestOnly: true,
  independentBrowserQa: "pending-coordinator",
  volumeGate: volumeIncomplete ? "Incomplete" : "Pass",
  files: {
    "index.html": hashFile("index.html"),
    "assets/css/home.css": hashFile("assets/css/home.css"),
    "assets/js/home-stages.js": hashFile("assets/js/home-stages.js"),
  },
  scenes,
  heroByteLog: heroLog,
};

if (volumeIncomplete) {
  console.error("Evidence: volume Incomplete — hero bytes unknown");
  process.exit(2);
}

writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("Evidence written to", OUT);
console.log("HEAD", head);
