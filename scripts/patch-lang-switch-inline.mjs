import fs from "fs";
import path from "path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(ROOT, "..");

const OLD = /\s*<div class="lang-dropdown" data-lang-dropdown>[\s\S]*?<\/div>\s*\n(\s*)(?=<\/div>)/g;

const SNIPPET = `
        <div class="lang-switch" data-lang-switch role="radiogroup" data-i18n-aria="aria.langMenu">
          <button type="button" class="lang-switch__btn lang-btn" role="radio" data-set-lang="zh" aria-checked="true" data-i18n-aria="aria.lang.zh">
            <span class="lang-switch__label" data-i18n="lang.switch.zh">中文</span>
          </button>
          <span class="lang-switch__sep" aria-hidden="true">/</span>
          <button type="button" class="lang-switch__btn lang-btn" role="radio" data-set-lang="en" aria-checked="false" data-i18n-aria="aria.lang.en">
            <span class="lang-switch__label" data-i18n="lang.switch.en">English</span>
          </button>
        </div>
`;

const files = [
  "index.html",
  "about/index.html",
  "contact/index.html",
  "photography/index.html",
  "works/index.html",
  "works/bipenggou/index.html",
  "works/emeishan/index.html",
  "works/qingdao/index.html",
];

for (const rel of files) {
  const fp = path.join(REPO, rel);
  let html = fs.readFileSync(fp, "utf8");
  if (!html.includes("data-lang-dropdown")) {
    console.warn("skip (no dropdown):", rel);
    continue;
  }
  html = html.replace(OLD, SNIPPET + "\n$1");
  html = html.replace(/lang-dropdown\.js/g, "lang-switch.js");
  fs.writeFileSync(fp, html);
  console.log("patched", rel);
}
