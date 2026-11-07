import fs from "fs";
import path from "path";

const OLD = `<div class="lang-toggle" role="group" aria-label="Language">
          <button type="button" class="lang-btn is-active" data-set-lang="zh" aria-pressed="true">中</button>
          <span class="lang-sep" aria-hidden="true">|</span>
          <button type="button" class="lang-btn" data-set-lang="en" aria-pressed="false">EN</button>
        </div>`;

const NEW_INNER = `<div class="lang-dropdown" data-lang-dropdown>
          <div class="lang-dropdown__trigger-wrap">
            <button type="button" class="lang-dropdown__trigger" aria-haspopup="listbox" aria-expanded="false" data-i18n-aria="aria.langMenu">
              <span class="lang-dropdown__current" data-lang-current>中</span>
              <span class="lang-dropdown__chev" aria-hidden="true"></span>
            </button>
          </div>
          <ul class="lang-dropdown__menu" role="listbox" hidden>
            <li role="presentation">
              <button type="button" class="lang-dropdown__option lang-btn" role="option" data-set-lang="zh" data-i18n="lang.option.zh">中文</button>
            </li>
            <li role="presentation">
              <button type="button" class="lang-dropdown__option lang-btn" role="option" data-set-lang="en" data-i18n="lang.option.en">English</button>
            </li>
          </ul>
        </div>`;

const files = [
  "works/qingdao/index.html",
  "photography/index.html",
  "works/bipenggou/index.html",
  "works/emeishan/index.html",
  "about/index.html",
  "contact/index.html",
  "works/index.html",
];

const root = path.dirname(new URL(import.meta.url).pathname);
const repo = path.join(root, "..");

for (const rel of files) {
  const p = path.join(repo, rel);
  let html = fs.readFileSync(p, "utf8");
  if (!html.includes(OLD)) throw new Error("pattern missing in " + rel);
  html = html.replace(OLD, NEW_INNER);
  if (!html.includes("lang-dropdown.js")) {
    html = html.replace(
      /(<script src="[^"]*i18n\.js"><\/script>)/,
      '$1\n  <script src="' + (rel.startsWith("works/") ? "../../" : "../") + 'assets/js/lang-dropdown.js"></script>'
    );
  }
  fs.writeFileSync(p, html);
  console.log("patched", rel);
}
