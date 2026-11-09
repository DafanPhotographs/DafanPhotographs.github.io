import { execSync } from "child_process";
import fs from "fs";
import crypto from "crypto";

const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const HEAD_A = process.env.HEAD_A || "d603323d9704a7772aa12317b58d2b032760ab65";
const HEAD_B = process.env.HEAD_B || execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

const RUNTIME_PREFIXES = [
  "index.html",
  "about.html",
  "contact.html",
  "work.html",
  "about/",
  "contact/",
  "photography/",
  "works/",
  "series/",
  "assets/",
  "data/",
  "styles.css",
  "tokens.css",
  ".nojekyll",
];

function listAt(ref) {
  const raw = execSync(`git ls-tree -r --name-only ${ref}`, { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  return raw.filter((rel) => RUNTIME_PREFIXES.some((p) => rel === p || rel.startsWith(p))).sort();
}

function hashAt(ref, rel) {
  return execSync(`git rev-parse ${ref}:${rel}`, { encoding: "utf8" }).trim();
}

function blobShaAt(ref, rel) {
  const oid = hashAt(ref, rel);
  const buf = execSync(`git cat-file -p ${oid}`, { maxBuffer: 20 * 1024 * 1024 });
  return crypto.createHash("sha256").update(buf).digest("hex");
}

const filesA = listAt(HEAD_A);
const filesB = listAt(HEAD_B);
const all = [...new Set([...filesA, ...filesB])].sort();

const rows = [];
for (const path of all) {
  const inA = filesA.includes(path);
  const inB = filesB.includes(path);
  const shaA = inA ? blobShaAt(HEAD_A, path) : null;
  const shaB = inB ? blobShaAt(HEAD_B, path) : null;
  rows.push({
    path,
    inA,
    inB,
    sha256AtA: shaA,
    sha256AtB: shaB,
    identical: inA && inB && shaA === shaB,
  });
}

const report = {
  comparedAt: new Date().toISOString(),
  headA: HEAD_A,
  headB: HEAD_B,
  headALabel: "lang/layout commit (runtime unchanged vs B)",
  headBLabel: "current capture HEAD",
  runtimeFileCountA: filesA.length,
  runtimeFileCountB: filesB.length,
  identicalCount: rows.filter((r) => r.identical).length,
  diffCount: rows.filter((r) => r.inA && r.inB && !r.identical).length,
  onlyInA: rows.filter((r) => r.inA && !r.inB).map((r) => r.path),
  onlyInB: rows.filter((r) => !r.inA && r.inB).map((r) => r.path),
  diffs: rows.filter((r) => r.inA && r.inB && !r.identical),
  nonRuntimeDiffAtHeads: execSync(`git diff --name-only ${HEAD_A}..${HEAD_B}`, { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean),
  rows,
};

fs.writeFileSync(`${OUT}/head-runtime-compare.json`, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      identical: report.identicalCount,
      runtimeDiff: report.diffCount,
      nonRuntimeDiff: report.nonRuntimeDiffAtHeads,
    },
    null,
    2
  )
);
