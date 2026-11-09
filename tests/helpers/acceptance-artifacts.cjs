// @ts-check
const fs = require("fs");
const path = require("path");

const ACCEPTANCE_ROOT = path.join(process.cwd(), "artifacts", "acceptance-evidence");

function ensureDir(sub) {
  const dir = sub ? path.join(ACCEPTANCE_ROOT, sub) : ACCEPTANCE_ROOT;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeArtifact(relPath, data) {
  const full = path.join(ACCEPTANCE_ROOT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  if (typeof data === "string") fs.writeFileSync(full, data);
  else fs.writeFileSync(full, JSON.stringify(data, null, 2));
  return full;
}

function readArtifact(relPath) {
  return fs.readFileSync(path.join(ACCEPTANCE_ROOT, relPath), "utf8");
}

module.exports = { ACCEPTANCE_ROOT, ensureDir, writeArtifact, readArtifact };
