import fs from "fs";
import { execSync, spawnSync } from "child_process";
import crypto from "crypto";
import path from "path";

const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const REPO = process.cwd();
const BASELINE = process.env.WORDMARK_BASELINE_SHA || "76f6d61529a5cbc8aa31f270f6ada6197fd3c664";
const captureHead = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

const logLines = [];
const stepRecords = [];

function log(msg) {
  logLines.push(`[${new Date().toISOString()}] ${msg}`);
  console.log(msg);
}

function run(cmd, env = {}, { required = true, label = cmd } = {}) {
  log(`$ ${cmd}`);
  const r = spawnSync(cmd, { shell: true, cwd: REPO, env: { ...process.env, ...env }, encoding: "utf8" });
  const status = r.status ?? 1;
  const rec = {
    label,
    command: cmd,
    exitCode: status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    required,
  };
  stepRecords.push(rec);
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  log(`exit ${status}`);
  if (required && status !== 0) {
    const err = new Error(`Required evidence step failed (${status}): ${label}`);
    err.step = rec;
    throw err;
  }
  return status;
}

fs.mkdirSync(OUT, { recursive: true });

log(`captureGitSha=${captureHead}`);

let testStatus = null;

const requiredSteps = [
  ["EVIDENCE_PREFIX=after-fix node scripts/g24-wordmark-evidence.mjs", {}, "after-fix-wordmark"],
  ["node scripts/lang-switch-preview-screenshots.mjs", {}, "lang-switch-screenshots"],
  ["node scripts/lang-nav-invert-parity.mjs", {}, "lang-nav-invert-parity"],
  ["node scripts/qa-interaction-evidence.mjs", {}, "qa-interaction"],
  ["node scripts/qa-home-regression-evidence.mjs", {}, "qa-home-regression"],
  [
    "REVERT_OVERLAY_LANG_TYPO=1 READABILITY_TAG=before node scripts/lang-readability-baseline.mjs",
    {},
    "lang-readability-before",
  ],
  ["READABILITY_TAG=after node scripts/lang-readability-baseline.mjs", {}, "lang-readability-after"],
];

try {
  run("node scripts/head-runtime-compare.mjs", {}, { label: "head-runtime-compare" });

  const cssPath = path.join(REPO, "assets/css/base.css");
  const cssBackup = fs.readFileSync(cssPath);
  const baselineCss = execSync(`git show ${BASELINE}:assets/css/base.css`, { encoding: "utf8", maxBuffer: 2_000_000 });

  fs.writeFileSync(cssPath, baselineCss);
  run("EVIDENCE_PREFIX=before-fix node scripts/g24-wordmark-evidence.mjs", {}, { label: "before-fix-wordmark" });
  fs.writeFileSync(cssPath, cssBackup);

  try {
    fs.unlinkSync(path.join(OUT, "lang-nav-invert-parity.json"));
  } catch {
    /* ok if absent */
  }

  for (const spec of requiredSteps) {
    const [cmd, env, label] = spec;
    run(cmd, env, { label });
  }

  const testLog = `${OUT}/playwright-qa-regression.log`;
  testStatus = run(
    `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8765 npx playwright test tests/lang-switch.spec.js tests/header-lang-toggle.spec.js tests/home-stages.spec.js --reporter=line 2>&1 | tee "${testLog}"`,
    {},
    { label: "playwright-regression" }
  );
} catch (bundleErr) {
  const failManifest = {
    bundle: "pr26-qa-evidence-v2",
    lockedHead: captureHead,
    packagedAt: new Date().toISOString(),
    failed: true,
    error: String(bundleErr.message || bundleErr),
    exportLog: logLines,
    steps: stepRecords,
  };
  fs.writeFileSync(`${OUT}/pr26-evidence-v2-manifest.json`, JSON.stringify(failManifest, null, 2));
  console.error(JSON.stringify(failManifest, null, 2));
  process.exit(1);
}

const artifacts = [
  "head-runtime-compare.json",
  "before-fix-wordmark-evidence.json",
  "after-fix-wordmark-evidence.json",
  "lang-switch-preview-evidence.json",
  "lang-nav-invert-parity.json",
  "qa-interaction-evidence.json",
  "qa-home-regression-evidence.json",
  "playwright-qa-regression.log",
  "before-fix-1440-bright-sky-header.png",
  "before-fix-1440-dark-forest-header.png",
  "before-fix-1440-closing-solid-header.png",
  "before-fix-375-bright-sky-header.png",
  "before-fix-375-dark-forest-header.png",
  "before-fix-375-closing-white-header.png",
  "after-fix-1440-bright-sky-header.png",
  "after-fix-1440-dark-forest-header.png",
  "after-fix-1440-closing-solid-header.png",
  "after-fix-375-bright-sky-header.png",
  "after-fix-375-dark-forest-header.png",
  "after-fix-375-closing-white-header.png",
  "lang-switch-1440-zh-bright.png",
  "lang-switch-1440-en-bright.png",
  "lang-switch-1440-zh-dark.png",
  "lang-switch-1440-en-dark.png",
  "lang-switch-1440-zh-closing.png",
  "lang-switch-1440-en-closing.png",
  "lang-switch-1440-zh-closing-full.png",
  "lang-switch-1440-en-closing-full.png",
  "lang-switch-375-zh-bright.png",
  "lang-switch-375-en-bright.png",
  "lang-switch-375-zh-dark.png",
  "lang-switch-375-en-dark.png",
  "lang-switch-375-zh-closing.png",
  "lang-switch-375-en-closing.png",
  "parity-1440-scene1-same-bright-band-header.png",
  "qa-lang-focus-tab.png",
  "qa-lang-focus-arrow-en.png",
  "qa-lang-persist-reload-en.png",
  "qa-closing-1440-full.png",
  "qa-scale-scene0-rest.png",
  "qa-scale-scene1-mid.png",
  "qa-scale-scene2-end.png",
  "qa-closing-bottom-1440.png",
  "lang-readability-1440-zh-bright-before.json",
  "lang-readability-1440-zh-bright-after.json",
  "before-lang-readability-1440-zh-bright-user-baseline.png",
  "after-lang-readability-1440-zh-bright-user-baseline.png",
  "user-baseline-lang-switch-1440-zh-bright.png",
];

const jsonMustMatchHead = [
  "lang-nav-invert-parity.json",
  "lang-switch-preview-evidence.json",
  "after-fix-wordmark-evidence.json",
  "qa-interaction-evidence.json",
  "qa-home-regression-evidence.json",
];
for (const name of jsonMustMatchHead) {
  const p = path.join(OUT, name);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const sha = j.captureGitSha || j.head;
  if (sha !== captureHead) {
    throw new Error(`Stale evidence ${name}: captureGitSha=${sha} expected ${captureHead}`);
  }
}

const manifest = {
  bundle: "pr26-qa-evidence-v2",
  lockedHead: captureHead,
  packagedAt: new Date().toISOString(),
  captureGitSha: captureHead,
  playwrightExitCode: testStatus,
  beforeFixNote: `before-fix-wordmark uses baseline ${BASELINE} assets/css/base.css only (single_file_css_swap)`,
  headRuntimeCompare: "head-runtime-compare.json",
  exportLog: logLines,
  steps: stepRecords.map((s) => ({
    label: s.label,
    exitCode: s.exitCode,
    stderrTail: s.stderr.slice(-4000),
    stdoutTail: s.stdout.slice(-2000),
  })),
  files: [],
};

const zipPath = `${OUT}/pr26-qa-evidence-v2.zip`;
const existing = [];
for (const f of artifacts) {
  const p = path.join(OUT, f);
  if (fs.existsSync(p)) {
    const buf = fs.readFileSync(p);
    manifest.files.push({
      path: f,
      bytes: buf.length,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
    });
    existing.push(p);
  } else {
    manifest.files.push({ path: f, missing: true });
  }
}

fs.writeFileSync(`${OUT}/pr26-evidence-v2-manifest.json`, JSON.stringify(manifest, null, 2));
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execSync(
  `zip -j "${zipPath}" ${existing.map((p) => `"${p}"`).join(" ")} "${OUT}/pr26-evidence-v2-manifest.json"`,
  { stdio: "inherit" }
);

console.log(JSON.stringify({ zipPath, captureHead, testStatus, fileCount: existing.length }, null, 2));
