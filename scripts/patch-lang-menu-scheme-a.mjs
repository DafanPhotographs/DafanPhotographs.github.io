import fs from "fs";
import path from "path";

const MENU_OLD = /<ul class="lang-dropdown__menu" role="listbox" hidden>[\s\S]*?<\/ul>/;

const MENU_HOME = `<ul class="lang-dropdown__menu header-chrome-blend" role="listbox" hidden>
            <li role="presentation">
              <button type="button" class="lang-dropdown__option lang-btn" role="option" data-set-lang="zh" data-i18n-aria="aria.lang.zh">
                <span class="lang-dropdown__label" data-i18n="lang.option.zh">中</span>
                <span class="lang-dropdown__check" aria-hidden="true"></span>
              </button>
            </li>
            <li role="presentation">
              <button type="button" class="lang-dropdown__option lang-btn" role="option" data-set-lang="en" data-i18n-aria="aria.lang.en">
                <span class="lang-dropdown__label" data-i18n="lang.option.en">EN</span>
                <span class="lang-dropdown__check" aria-hidden="true"></span>
              </button>
            </li>
          </ul>`;

const MENU_INNER = `<ul class="lang-dropdown__menu" role="listbox" hidden>
            <li role="presentation">
              <button type="button" class="lang-dropdown__option lang-btn" role="option" data-set-lang="zh" data-i18n-aria="aria.lang.zh">
                <span class="lang-dropdown__label" data-i18n="lang.option.zh">中</span>
                <span class="lang-dropdown__check" aria-hidden="true"></span>
              </button>
            </li>
            <li role="presentation">
              <button type="button" class="lang-dropdown__option lang-btn" role="option" data-set-lang="en" data-i18n-aria="aria.lang.en">
                <span class="lang-dropdown__label" data-i18n="lang.option.en">EN</span>
                <span class="lang-dropdown__check" aria-hidden="true"></span>
              </button>
            </li>
          </ul>`;

const files = [
  "index.html",
  "works/index.html",
  "photography/index.html",
  "about/index.html",
  "contact/index.html",
  "works/bipenggou/index.html",
  "works/emeishan/index.html",
  "works/qingdao/index.html",
];

const repo = path.join(path.dirname(new URL(import.meta.url).pathname), "..");

for (const rel of files) {
  const p = path.join(repo, rel);
  let html = fs.readFileSync(p, "utf8");
  if (!MENU_OLD.test(html)) throw new Error("menu block not found in " + rel);
  html = html.replace(MENU_OLD, rel === "index.html" ? MENU_HOME : MENU_INNER);
  fs.writeFileSync(p, html);
  console.log("patched", rel);
}
