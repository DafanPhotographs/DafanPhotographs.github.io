# 大樊 / DaFan — Photography site

Mobile-first static portfolio for GitHub Pages. Large display type, large images, bilingual UI. Public info: name, Chengdu, email `vanwuuuu@gmail.com`, Instagram `@van_wuuuu`, taglines **摄一瞬，记一程** / **Capture a moment, record a journey**.

**Navigation copy (locked):** visible nav uses **作品** (zh) and **Work** (en) for the work index — not “Design”, not “Works”. URL paths stay under `/works/`.

## Live URL (after Pages is on)

Organization site repo `DafanPhotographs.github.io` → **https://DafanPhotographs.github.io/**

(Repo must be **Public**. Settings → Pages → Build and deployment → Source → **GitHub Actions**, or branch **main** / folder **/ (root)** if using branch deploy.)

## Local preview

```bash
cd /path/to/DafanPhotographs.github.io
python3 -m http.server 8080
```

Open http://127.0.0.1:8080/

## Layout (clean URLs)

```
index.html                 Home (three photo scenes + closing)
works/index.html           Work index (+ filters)
works/<slug>/index.html    Series case pages
photography/index.html     Photography hub (three series)
about/index.html
contact/index.html         mailto form → vanwuuuu@gmail.com
data/series.json           Series metadata (Cloudinary prefixes)
assets/css/                tokens, base, home, works, project
assets/js/                 i18n.js, main.js, hero.js (back-to-top only), home-stages.js
styles.css                 Bundled @import for legacy paths
```

**Legacy redirects (no-JS friendly):** `work.html`, `about.html`, `contact.html`, `series/*.html` → meta refresh + visible links to the new paths.

## Deploy to GitHub Pages

1. Merge to `main` (e.g. via PR). The workflow **Deploy static site to Pages** uploads the repo root as the site artifact.
2. Repository **Settings → Pages**: source **GitHub Actions** (if using the workflow).

## Update content

- Add series: upload assets to Cloudinary under `dafan/series/<slug>/` (public ids `cover`, `02`, `03`, `04` — delivery URLs use `f_auto,q_auto` in HTML); add `works/<slug>/index.html`, update `data/series.json`, and link from `index.html`, `works/`, and `photography/`. This repo does not store photo binaries; use Cloudinary (or your own backup) for source files.
- UI strings (nav, taglines, alt text, series titles): edit `assets/js/i18n.js` for `zh` / `en`.
- Language preference: `localStorage` key `dafan-lang`; legacy `vanwu-lang` is read once and migrated.

## Fonts

Inter is loaded from Google Fonts in each HTML `<head>` (weights 400 / 500 / 600 / 700).

## Collaborators (history rewrite)

`main` was rewritten to remove all committed files under `images/` from every revision. If you have an old clone, run `git fetch origin` and `git reset --hard origin/main`, or delete the folder and **clone again** — do not merge old branches that still contain the removed blobs.
