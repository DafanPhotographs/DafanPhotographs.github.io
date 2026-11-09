import { execSync } from "node:child_process";
import {
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  copyFileSync,
  cpSync,
  existsSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium } from "playwright";

const BASE = "4d06538ff3247d29713ddb4dc3e78ca655ee34dd";
const ROOT = process.cwd();
const OUT = path.resolve(ROOT, "artifacts/home-desktop-six-evidence-out");
const ACCEPTANCE = path.resolve(ROOT, "artifacts/acceptance-evidence");
const STATIC = path.join(OUT, "static-site-bundle");
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const PUBLIC_IDS = ["bipenggou", "emeishan", "qingdao"];

const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
execSync(`git merge-base --is-ancestor ${BASE} ${head}`);

function sha256File(abs) {
  const h = createHash("sha256");
  h.update(readFileSync(abs));
  return h.digest("hex");
}

function sha256AllUnder(dir, base = dir) {
  const items = [];
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) items.push(...sha256AllUnder(abs, base));
    else items.push({ path: path.relative(base, abs).replace(/\\/g, "/"), sha256: sha256File(abs), bytes: st.size });
  }
  return items;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(STATIC, { recursive: true });

/** Static site at HEAD (runnable locally, no node_modules/.git) */
const copyList = ["index.html", "assets", "works", "photography", "about", "contact", "feed.xml", "robots.txt", "sitemap.xml", "favicon.ico"];
for (const rel of copyList) {
  const src = path.join(ROOT, rel);
  if (!existsSync(src)) continue;
  cpSync(src, path.join(STATIC, rel), { recursive: true });
}

const runtimeHashes = {
  "index.html": sha256File(path.join(ROOT, "index.html")),
  "assets/css/home.css": sha256File(path.join(ROOT, "assets/css/home.css")),
  "assets/js/home-stages.js": sha256File(path.join(ROOT, "assets/js/home-stages.js")),
};

const staticRootHashes = ["index.html", "assets/css/home.css", "assets/js/home-stages.js"].map((rel) => ({
  path: rel,
  repo: runtimeHashes[rel],
  bundle: existsSync(path.join(STATIC, rel)) ? sha256File(path.join(STATIC, rel)) : null,
}));
const staticHashMatch = staticRootHashes.every((r) => r.repo === r.bundle);

function classifyHeroBytesRow(row) {
  const hasBody = typeof row.bodyBytes === "number" && row.bodyBytes >= 0;
  const hasCl = typeof row.contentLength === "number" && row.contentLength > 0;
  if (hasBody || hasCl) return { bytesStatus: "known", volumeGate: "eligible" };
  return { bytesStatus: "unknown", volumeGate: "Incomplete" };
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
  const row = { url, status: response.status(), contentType: headers["content-type"] || "unknown", contentLength: cl ? Number(cl) : null, bodyBytes };
  Object.assign(row, classifyHeroBytesRow(row));
  byteLog.push(row);
});

await page.goto(BASE_URL + "/");
await page.waitForLoadState("networkidle");

const SCALE_TARGETS = { 0: 1.0, 0.5: 1.03, 1: 1.06 };
const trackB = [];
const trackA = [];

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
    await page.waitForTimeout(500);
    const meta = await page.evaluate((idx) => {
      const img = document.querySelector('[data-home-scene="' + idx + '"] img');
      const media = document.querySelector('[data-home-scene="' + idx + '"] .home-scene-media-scale');
      const active = document.querySelector("[data-home-stage-rail]")?.getAttribute("data-active-scene");
      const visible = [...document.querySelectorAll("[data-home-scene]")]
        .filter((s) => {
          const r = s.getBoundingClientRect();
          return r.bottom > 0 && r.top < window.innerHeight;
        })
        .map((s) => s.getAttribute("data-home-scene"));
      return {
        currentSrc: img.currentSrc,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        scale: media ? Number(gsap.getProperty(media, "scale")) : null,
        activeScene: active,
        visibleSceneIndices: visible,
        obscured: active !== String(idx) || visible.length !== 1 || visible[0] !== String(idx),
      };
    }, i);
    const expectedScale = SCALE_TARGETS[p];
    const scaleError = meta.scale != null ? meta.scale - expectedScale : null;
    const shotB = path.join(OUT, "trackB-seek-scene" + i + "-p" + String(p).replace(".", "") + ".png");
    await page.locator('[data-home-scene="' + i + '"] .home-scene-stage').screenshot({ path: shotB });
    trackB.push({
      evidenceTrack: "B-real-stack-seek",
      sceneIndex: i,
      publicId: PUBLIC_IDS[i],
      progress: p,
      expectedScale,
      actualScale: meta.scale,
      scaleError,
      compositionProof: !meta.obscured,
      obscured: meta.obscured,
      ...meta,
      screenshot: path.basename(shotB),
    });

    await page.evaluate((idx) => {
      document.querySelectorAll("[data-home-scene]").forEach((el) => {
        const n = el.getAttribute("data-home-scene");
        el.style.visibility = n === String(idx) ? "visible" : "hidden";
      });
      const closing = document.querySelector(".home-closing");
      if (closing) closing.style.display = "none";
    }, i);
    const shotA = path.join(OUT, "trackA-isolated-scene" + i + "-p" + String(p).replace(".", "") + ".png");
    await page.locator('[data-home-scene="' + i + '"] .home-scene-stage').screenshot({ path: shotA });
    trackA.push({
      evidenceTrack: "A-isolated-controlled",
      sceneIndex: i,
      publicId: PUBLIC_IDS[i],
      progress: p,
      expectedScale,
      actualScale: meta.scale,
      scaleError,
      compositionProof: true,
      note: "CSS hide other scenes+closing; NOT real scroll proof",
      screenshot: path.basename(shotA),
    });
    await page.evaluate(() => {
      document.querySelectorAll("[data-home-scene]").forEach((el) => {
        el.style.visibility = "";
      });
      const closing = document.querySelector(".home-closing");
      if (closing) closing.style.display = "";
    });
  }
}

await browser.close();

if (existsSync(ACCEPTANCE)) {
  cpSync(ACCEPTANCE, path.join(OUT, "acceptance-evidence"), { recursive: true });
}

const heroLog = byteLog.filter((r) => /dafan\/series\/(bipenggou|emeishan|qingdao)\/cover/.test(r.url));
const volumeIncomplete = heroLog.some((r) => r.volumeGate === "Incomplete");
const wheelGlobs = existsSync(path.join(ACCEPTANCE, "wheel"))
  ? readdirSync(path.join(ACCEPTANCE, "wheel")).filter((f) => f.endsWith(".json"))
  : [];
let wheelGate = "Missing";
let wheelPairCounts = [];
for (const f of wheelGlobs) {
  const data = JSON.parse(readFileSync(path.join(ACCEPTANCE, "wheel", f), "utf8"));
  wheelPairCounts.push({ file: f, pairs: data.pairs?.length || 0, deltas: data.scrollYDeltas || [] });
}
if (wheelGlobs.length === 3 && wheelPairCounts.every((w) => w.pairs >= 2 && (w.deltas || []).every((d) => d <= 2))) {
  wheelGate = "Pass";
} else if (wheelGlobs.length > 0) {
  wheelGate = "Incomplete";
}

const trackBComposition = trackB.filter((r) => r.compositionProof).length;
const compositionGate = trackBComposition >= 3 ? "Pass" : "Incomplete";

const deliverables = sha256AllUnder(OUT);
const manifest = {
  baseAncestor: BASE,
  implementationHead: head,
  generatedAt: new Date().toISOString(),
  cloudSelfTestOnly: true,
  independentBrowserQa: "pending-coordinator",
  acceptanceGates: {
    volumeGate: volumeIncomplete ? "Incomplete" : "Pass",
    wheelSameScrollY: wheelGate,
    compositionProofTrackB: compositionGate,
    staticBundleHashMatch: staticHashMatch ? "Pass" : "Incomplete",
    overall: null,
  },
  runtimeFileHashes: runtimeHashes,
  staticBundleRootHashes: staticRootHashes,
  trackA_isolated: trackA,
  trackB_realStackSeek: trackB,
  wheelArchives: wheelPairCounts,
  heroByteLog: heroLog,
  deliverables,
};

const blockers = [];
if (volumeIncomplete) blockers.push("volume");
if (wheelGate !== "Pass") blockers.push("wheel");
if (!staticHashMatch) blockers.push("staticHash");
if (compositionGate !== "Pass") blockers.push("compositionTrackB");
manifest.acceptanceGates.overall = blockers.length ? "Incomplete" : "Pass";

writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

const tarPath = path.join(path.dirname(OUT), "pr27-evidence-bundle.tar.gz");
execSync(`tar -czf "${tarPath}" -C "${path.dirname(OUT)}" "${path.basename(OUT)}"`);
manifest.bundleTar = path.basename(tarPath);
writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(JSON.stringify({ HEAD: head, OUT, overall: manifest.acceptanceGates.overall, blockers }, null, 2));

if (manifest.acceptanceGates.overall !== "Pass") {
  process.exit(2);
}
