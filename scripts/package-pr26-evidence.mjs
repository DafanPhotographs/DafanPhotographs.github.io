import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const HEAD = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const zipPath = `${OUT}/pr26-acceptance-evidence.zip`;

const files = [
  "before-fix-wordmark-evidence.json",
  "after-fix-wordmark-evidence.json",
  "lang-switch-preview-evidence.json",
  "lang-nav-invert-parity.json",
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
  "lang-switch-375-zh-bright.png",
  "lang-switch-375-en-bright.png",
  "lang-switch-375-zh-dark.png",
  "lang-switch-375-en-dark.png",
  "lang-switch-375-zh-closing.png",
  "lang-switch-375-en-closing.png",
  "parity-1440-scene1-same-bright-band-header.png",
];

const manifest = { head: HEAD, packagedAt: new Date().toISOString(), files: [] };
const existing = [];
for (const f of files) {
  const p = path.join(OUT, f);
  if (fs.existsSync(p)) existing.push(p);
  else manifest.files.push({ file: f, missing: true });
}

fs.writeFileSync(
  `${OUT}/pr26-evidence-manifest.json`,
  JSON.stringify({ ...manifest, included: existing.map((p) => path.basename(p)) }, null, 2)
);

if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
if (existing.length) {
  execSync(`zip -j "${zipPath}" ${existing.map((p) => `"${p}"`).join(" ")} "${OUT}/pr26-evidence-manifest.json"`, {
    stdio: "inherit",
  });
}
console.log(JSON.stringify({ zipPath, count: existing.length, head: HEAD }, null, 2));
