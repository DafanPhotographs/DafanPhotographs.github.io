# 大樊 / DaFan — Photography site

Mobile-first static portfolio for GitHub Pages. Large display type, large images, bilingual UI. Public info: name, Chengdu, email `vanwuuuu@gmail.com`, Instagram `@van_wuuuu`, taglines **摄一瞬，记一程** / **Capture a moment, record a journey**.

## Live URL (after Pages is on)

Organization site repo `DafanPhotographs.github.io` → **https://DafanPhotographs.github.io/**

(Repo must be **Public**. Settings → Pages → Build and deployment → Source → **GitHub Actions**, or branch **main** / folder **/ (root)** if using branch deploy.)

## Local preview

```bash
cd /path/to/DafanPhotographs.github.io
python3 -m http.server 8080
```

Open http://127.0.0.1:8080/

## Layout

```
index.html          Home (hero + stacked series rows)
work.html           Series index + category filters
about.html
contact.html        mailto form → vanwuuuu@gmail.com
series/             Series pages (four images each: cover + 02–04)
images/series/      Local JPG copies (kept for verification; series images load from Cloudinary CDN in HTML)
styles.css          Layout + components
tokens.css          Design tokens
i18n.js             中 | EN (localStorage)
main.js             Filters + mailto
.github/workflows/deploy-static-pages.yml   GitHub Pages deploy
```

## Deploy to GitHub Pages

1. Merge to `main` (e.g. via PR). The workflow **Deploy static site to Pages** uploads the repo root as the site artifact.
2. Repository **Settings → Pages**: source **GitHub Actions** (if using the workflow).

## Update content

- Add series: upload assets to Cloudinary under `dafan/series/<slug>/` (public ids `cover`, `02`, `03`, `04` — delivery URLs use `f_auto,q_auto` in `index.html` / `work.html` / `series/*.html`); keep a matching folder under `images/series/<slug>/` locally if you want repo copies, new `series/<slug>.html`, and link from `index.html` / `work.html`.
- UI strings (nav, taglines, alt text, series titles): edit `i18n.js` for `zh` / `en`.
- Language preference: `localStorage` key `dafan-lang`; legacy `vanwu-lang` is read once and migrated.

## Fonts

Inter is loaded from Google Fonts in each HTML `<head>` (weights 400 / 500 / 600).
