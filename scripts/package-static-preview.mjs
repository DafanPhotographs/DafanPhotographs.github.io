import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { runtimeFileHashes } from "./evidence-lib.mjs";

const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const HEAD = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const files = runtimeFileHashes();
const manifest = {
  captureGitSha: HEAD,
  packagedAt: new Date().toISOString(),
  note: "Static runtime tree only — no credentials, no .git, no bundled original photos",
  files,
};
const manifestPath = `${OUT}/pr26-qa-static-preview-manifest.json`;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const zipPath = `${OUT}/pr26-qa-static-preview-${HEAD.slice(0, 7)}.zip`;
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const paths = files.map((f) => path.join(process.cwd(), f.path));
execSync(`zip -j "${zipPath}" ${paths.map((p) => `"${p}"`).join(" ")} "${manifestPath}"`, { stdio: "inherit" });
console.log(JSON.stringify({ zipPath, captureGitSha: HEAD, fileCount: files.length }, null, 2));
