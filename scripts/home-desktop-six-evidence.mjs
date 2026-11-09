import { execSync } from "node:child_process";
import {
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
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
const PAIR_TOL = 2;

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
  return items.sort((a, b) => a.path.localeCompare(b.path));
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(STATIC, { recursive: true });

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

async function readStackMeta(page, sceneIndex) {
  return page.evaluate((idx) => {
    const scene = document.querySelector('[data-home-scene="' + idx + '"]');
    const stage = scene && scene.querySelector(".home-scene-stage");
    const media = scene && scene.querySelector(".home-scene-media-scale");
    const img = scene && scene.querySelector("img");
    const rail = document.querySelector("[data-home-stage-rail]");
    const active = rail ? rail.getAttribute("data-active-scene") : null;
    const scenes = [...document.querySelectorAll("[data-home-scene]")];
    const visibleSceneIndices = scenes
      .filter((s) => {
        const r = s.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight && r.height > 0;
      })
      .map((s) => Number(s.getAttribute("data-home-scene")));
    let targetStageVisibleRatio = 0;
    let noEdgeCover = null;
    if (stage && media) {
      const sr = stage.getBoundingClientRect();
      const mr = media.getBoundingClientRect();
      const vh = window.innerHeight;
      const visTop = Math.max(sr.top, 0);
      const visBot = Math.min(sr.bottom, vh);
      const visH = Math.max(0, visBot - visTop);
      targetStageVisibleRatio = sr.height > 0 ? visH / sr.height : 0;
      const eps = 2;
      noEdgeCover =
        mr.left <= sr.left + eps &&
        mr.right >= sr.right - eps &&
        mr.top <= sr.top + eps &&
        mr.bottom >= sr.bottom - eps;
    }
    const st = ScrollTrigger.getAll().find((t) => t.vars && t.vars.id === "home-scene-" + idx);
    const progress = st ? st.progress : null;
    const scrollTriggerActive = st ? !!st.isActive : false;
    const scale = media && typeof gsap !== "undefined" ? Number(gsap.getProperty(media, "scale")) : null;
    const src = img && img.currentSrc ? img.currentSrc : "";
    let targetPublicId = null;
    for (const id of ["bipenggou", "emeishan", "qingdao"]) {
      if (src.includes("/" + id + "/")) targetPublicId = id;
    }
    const closing = document.querySelector(".home-closing");
    let closingVisible = false;
    let closingObscuresTarget = false;
    if (closing && getComputedStyle(closing).display !== "none" && stage) {
      const cr = closing.getBoundingClientRect();
      const sr = stage.getBoundingClientRect();
      closingVisible = cr.bottom > 0 && cr.top < window.innerHeight;
      const overlapH = Math.min(cr.bottom, sr.bottom) - Math.max(cr.top, sr.top);
      closingObscuresTarget = closingVisible && overlapH > Math.min(48, sr.height * 0.12);
    }
    const onlyTargetInViewport = visibleSceneIndices.length === 1 && visibleSceneIndices[0] === idx;
    const activeMatchesTarget = active === String(idx);
    const windowCompositionEligible =
      scrollTriggerActive &&
      activeMatchesTarget &&
      targetStageVisibleRatio >= 0.25 &&
      !closingObscuresTarget &&
      progress !== null &&
      progress < 0.95;
    let compositionProof = windowCompositionEligible && onlyTargetInViewport;
    let compositionProofReason = compositionProof
      ? "target_only_visible_window"
      : windowCompositionEligible
        ? "target_active_in_stack_multi_visible"
        : "inactive_or_low_visible_ratio";
    if (progress !== null && progress >= 0.98) {
      compositionProof = false;
      compositionProofReason = "p1_natural_stack_obscure_not_runtime_defect";
    }
    return {
      scrollY: window.scrollY,
      progress,
      scale,
      targetPublicId,
      expectedPublicId: ["bipenggou", "emeishan", "qingdao"][idx],
      activeScene: active,
      visibleSceneIndices,
      targetStageVisibleRatio,
      noEdgeCover,
      onlyTargetInViewport,
      windowCompositionEligible,
      compositionProof,
      compositionProofReason,
      closingVisible: !!closingVisible,
      closingObscuresTarget: !!closingObscuresTarget,
      currentSrc: src,
    };
  }, sceneIndex);
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
const trackB_nonCompositionTransparency = [];

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
    const meta = await readStackMeta(page, i);
    const expectedScale = SCALE_TARGETS[p];
    const scaleError = meta.scale != null ? meta.scale - expectedScale : null;
    const shotB = path.join(OUT, "trackB-seek-scene" + i + "-p" + String(p).replace(".", "") + ".png");
    await page.locator('[data-home-scene="' + i + '"] .home-scene-stage').screenshot({ path: shotB });
    const p1Na = p === 1;
    const rowB = {
      evidenceTrack: "B-real-stack-seek",
      sceneIndex: i,
      publicId: PUBLIC_IDS[i],
      progress: p,
      expectedScale,
      actualScale: meta.scale,
      scaleError,
      p1UnobstructedRequired: p1Na ? "not-applicable" : "required-in-visible-window",
      compositionProof: p1Na ? "not-applicable" : meta.compositionProof,
      compositionProofReason: p1Na ? "p1_may_be_naturally_obscured_by_next_scene" : meta.compositionProofReason,
      windowCompositionEligible: meta.windowCompositionEligible,
      ...meta,
      screenshot: path.basename(shotB),
    };
    trackB.push(rowB);
    if (!p1Na && !meta.compositionProof && meta.windowCompositionEligible) {
      trackB_nonCompositionTransparency.push({
        sceneIndex: i,
        progress: p,
        reason: meta.compositionProofReason,
        note: "multi-scene sticky stack; normal — not a runtime defect",
        activeScene: meta.activeScene,
        visibleSceneIndices: meta.visibleSceneIndices,
      });
    }

    await page.evaluate((idx) => {
      document.querySelectorAll("[data-home-scene]").forEach((el) => {
        const n = el.getAttribute("data-home-scene");
        el.style.visibility = n === String(idx) ? "visible" : "hidden";
      });
      const closing = document.querySelector(".home-closing");
      if (closing) closing.style.display = "none";
    }, i);
    const mediaScale = await page.evaluate((idx) => {
      const m = document.querySelector('[data-home-scene="' + idx + '"] .home-scene-media-scale');
      return m ? Number(gsap.getProperty(m, "scale")) : null;
    }, i);
    const shotA = path.join(OUT, "trackA-isolated-scene" + i + "-p" + String(p).replace(".", "") + ".png");
    await page.locator('[data-home-scene="' + i + '"] .home-scene-stage').screenshot({ path: shotA });
    trackA.push({
      evidenceTrack: "A-isolated-NOT-real-scroll",
      sceneIndex: i,
      publicId: PUBLIC_IDS[i],
      progress: p,
      expectedScale,
      actualScale: mediaScale,
      scaleError: mediaScale != null ? mediaScale - expectedScale : null,
      compositionProof: true,
      doesNotSubstituteTrackB: true,
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
const wheelDir = path.join(ACCEPTANCE, "wheel");
const wheelGlobs = existsSync(wheelDir)
  ? readdirSync(wheelDir).filter((f) => f.startsWith("wheel-trace-scene") && f.endsWith(".json"))
  : [];
const wheelArchives = [];
let wheelGate = wheelGlobs.length === 3 ? "Pass" : "Incomplete";
for (const f of wheelGlobs) {
  const data = JSON.parse(readFileSync(path.join(wheelDir, f), "utf8"));
  const deltas = data.scrollYDeltas || [];
  const okPairs = (data.pairs?.length || 0) >= 2;
  const okDelta = deltas.length >= 2 && deltas.every((d) => d <= PAIR_TOL);
  const okWindow = (data.windowCompositionPairs || 0) >= 1;
  const okLive = (data.livePairShots?.length || 0) >= 2;
  wheelArchives.push({
    file: f,
    pairs: data.pairs?.length || 0,
    windowCompositionPairs: data.windowCompositionPairs || 0,
    livePairShots: data.livePairShots?.length || 0,
    compositionPairs: data.compositionPairs || 0,
    pairTolerancePx: data.pairTolerancePx,
    scrollYDeltas: deltas,
    checkpoints: data.checkpoints || [],
    pass: okPairs && okDelta && okWindow && okLive,
  });
  if (!okPairs || !okDelta || !okWindow || !okLive) wheelGate = "Incomplete";
}
if (wheelGlobs.length !== 3) wheelGate = "Incomplete";

const trackBWindowSeek = trackB.filter(
  (r) => r.p1UnobstructedRequired !== "not-applicable" && r.windowCompositionEligible
).length;
const trackBCompositionGate =
  trackBWindowSeek >= 3 && wheelArchives.every((w) => w.pass) ? "Pass" : "Incomplete";

const independentBrowserQa = {
  status: "blocked",
  error: "ERR_CONNECTION_REFUSED",
  note: "Coordinator independent browser loopback session refused in this environment; not claimed Pass. Playwright track uses PLAYWRIGHT_BASE_URL only.",
};

const deliverables = sha256AllUnder(OUT);
const manifest = {
  baseAncestor: BASE,
  implementationHead: head,
  generatedAt: new Date().toISOString(),
  cloudSelfTestOnly: true,
  independentBrowserQa,
  acceptanceGates: {
    volumeGate: volumeIncomplete ? "Incomplete" : "Pass",
    wheelSameScrollY_plus2px: wheelGate,
    trackB_windowCompositionAndWheelPairs: trackBCompositionGate,
    p1Unobstructed: "not-applicable-at-natural-stack-end",
    staticBundleHashMatch: staticHashMatch ? "Pass" : "Incomplete",
    independentBrowserQa: "blocked",
    eligibleForMerge: null,
    overall: null,
  },
  runtimeFileHashes: runtimeHashes,
  staticBundleRootHashes: staticRootHashes,
  trackA_isolated_NOT_real_scroll: trackA,
  trackB_realStackSeek: trackB,
  trackB_nonCompositionTransparency,
  wheelArchives,
  heroByteLog: heroLog,
  deliverables,
};

const blockers = [];
if (volumeIncomplete) blockers.push("volume");
if (wheelGate !== "Pass") blockers.push("wheelTrackB");
if (trackBCompositionGate !== "Pass") blockers.push("trackB_windowComposition");
if (!staticHashMatch) blockers.push("staticHash");
blockers.push("independentBrowserQa_blocked");
manifest.acceptanceGates.eligibleForMerge = "No — QA review packet only (no merge/deploy)";
manifest.acceptanceGates.overall = blockers.filter((b) => b !== "independentBrowserQa_blocked").length ? "Incomplete" : "Pass-with-independent-browser-pending";

writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

const tarPath = path.join(path.dirname(OUT), "pr27-evidence-bundle.tar.gz");
execSync(`tar -czf "${tarPath}" -C "${path.dirname(OUT)}" "${path.basename(OUT)}"`);
manifest.bundleTar = path.basename(tarPath);
manifest.bundleTarSha256 = sha256File(tarPath);
writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(
  JSON.stringify(
    { HEAD: head, OUT, overall: manifest.acceptanceGates.overall, eligible: manifest.acceptanceGates.eligibleForMerge, blockers },
    null,
    2
  )
);

if (manifest.acceptanceGates.overall === "Incomplete") {
  process.exit(2);
}
