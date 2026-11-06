# 小五 / Van Wu — Photography site

Mobile-first static portfolio for GitHub Pages. Near-white quiet luxury. Public info only: name, Chengdu, email, Instagram, tagline.

## Live URL (after Pages is on)

Organization site repo `DafanPhotographs.github.io` → **https://DafanPhotographs.github.io/**

(Repo must be **Public**. Settings → Pages → Deploy from branch **main** / folder **/ (root)**.)

## Local preview

```bash
# From repository root (this repo)
python3 -m http.server 8080
```

Open http://127.0.0.1:8080/

## Layout

```
index.html          Home
work.html           Series index + filters
about.html
contact.html        mailto form → vanwuuuu@gmail.com
series/             Placeholder series pages
styles.css          Component styles
tokens.css          Design tokens
i18n.js             中 | EN (localStorage)
main.js             Filters + mailto
```

## Deploy to GitHub Pages

1. Ensure this public org repo is `DafanPhotographs.github.io` with files at the **repository root** (as in this branch).
2. Merge to `main` (via PR) or push directly to `main`.
3. Settings → Pages → Source: Deploy from a branch → **main** / **/ (root)**.
4. Wait briefly for the build; open https://DafanPhotographs.github.io/

## Update content

- Copy / edit HTML under `series/` for new work; link cards from `index.html` and `work.html`.
- Replace CSS photo placeholders (`.photo-block`, `.series-card-media`) with `<img>` when finals are ready.
- Chrome strings (nav, taglines, series titles): edit `i18n.js` dict for `zh` / `en`.
- Language preference persists in `localStorage` key `vanwu-lang`.

## Public fields used

- 小五 / Van Wu · 成都 / Chengdu
- vanwuuuu@gmail.com
- https://www.instagram.com/van_wuuuu/
- 摄一瞬，记一程 / Capture a moment, record a journey
