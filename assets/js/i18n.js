(function () {
  const STORAGE_KEY = "dafan-lang";
  const LEGACY_STORAGE_KEY = "vanwu-lang";
  const DEFAULT = "zh";

  const dict = {
    zh: {
      "nav.work": "作品",
      "nav.photography": "摄影",
      "nav.about": "关于",
      "nav.contact": "联络",
      "wordmark.zh": "大樊",
      "wordmark.en": "DaFan",
      "aria.wordmark": "大樊 / DaFan",
      "aria.langMenu": "选择语言",
      "aria.lang.zh": "中文",
      "aria.lang.en": "English",
      "lang.option.zh": "中",
      "lang.option.en": "EN",
      "lang.switch.zh": "中文",
      "lang.switch.en": "English",
      "footer.copy.zh": "© 2026 大樊",
      "footer.copy.en": "© 2026 DaFan",
      "footer.city": "成都",
      "footer.igLabel": "Instagram @van_wuuuu",
      "home.tagline": "摄一瞬，记一程",
      "home.lede": "风景与旅途，以系列慢慢展开。",
      "home.meta": "成都 · Chengdu",
      "home.workHeading": "精选系列",
      "home.closing.works": "作品",
      "home.closing.viewAll": "查看全部",
      "home.closing.follow": "Follow",
      "home.closing.ig": "@van_wuuuu",
      "home.closing.backToTop": "回到顶部 ↑",
      "home.closing.cta.zh": "联络 ↗",
      "home.closing.cta.en": "Let's talk ↗",
      "work.title": "作品",
      "work.empty": "该分类暂无系列。",
      "photography.title": "摄影",
      "photography.lede": "风景与旅途，一张一张地看。",
      "card.view": "查看",
      "about.title": "关于",
      "about.p1": "大樊是一名立志成为摄影师的程序员。",
      "about.p2": "摄一瞬，记一程。作品以照片为单位呈现。",
      "about.p3.prefix": "更多作品请关注我",
      "about.p3.sep": "，",
      "about.p3.xhs": "小红书",
      "about.p3.end": "。",
      "contact.title": "联络",
      "contact.emailLabel": "邮箱",
      "contact.igLabel": "Instagram",
      "contact.xhsLabel": "小红书",
      "contact.formName": "姓名",
      "contact.formEmail": "你的邮箱",
      "contact.formMessage": "留言",
      "contact.formSubmit": "用邮件发送",
      "contact.formNote": "将打开你的邮件应用，收件人为 vanwuuuu@gmail.com。",
      "series.back": "← 作品",
      /* series:data:start — 由 tools/new-series.mjs 依据 data/series.json 生成，请勿手改 */
      "work.lede": "三个系列，以途为序。",
      "work.filter.all": "全部",
      "work.filter.travel": "旅行",
      "work.filter.landscape": "风景",
      "home.alt.bipenggou": "毕棚沟系列作品封面",
      "series.bipenggou.title": "毕棚沟",
      "series.bipenggou.year": "2024",
      "series.bipenggou.cat": "风景",
      "series.bipenggou.copy": "山谷与林线之间的薄雾与冷色光线。",
      "series.bipenggou.alt.1": "系列作品，第 1 张",
      "series.bipenggou.alt.2": "系列作品，第 2 张",
      "series.bipenggou.alt.3": "系列作品，第 3 张",
      "series.bipenggou.alt.4": "系列作品，第 4 张",
      "home.alt.emeishan": "峨眉山系列作品封面",
      "series.emeishan.title": "峨眉山",
      "series.emeishan.year": "2024",
      "series.emeishan.cat": "风景",
      "series.emeishan.copy": "山线与云海之间，缓慢攀登的一程。",
      "series.emeishan.alt.1": "系列作品，第 1 张",
      "series.emeishan.alt.2": "系列作品，第 2 张",
      "series.emeishan.alt.3": "系列作品，第 3 张",
      "series.emeishan.alt.4": "系列作品，第 4 张",
      "home.alt.qingdao": "青岛系列作品封面",
      "series.qingdao.title": "青岛",
      "series.qingdao.year": "2024",
      "series.qingdao.cat": "旅行",
      "series.qingdao.copy": "海风、岸线与城市霓虹交叠的一段路。",
      "series.qingdao.alt.1": "系列作品，第 1 张",
      "series.qingdao.alt.2": "系列作品，第 2 张",
      "series.qingdao.alt.3": "系列作品，第 3 张",
      "series.qingdao.alt.4": "系列作品，第 4 张"
      /* series:data:end */
    },
    en: {
      "nav.work": "Work",
      "nav.photography": "Photography",
      "nav.about": "About",
      "nav.contact": "Contact",
      "wordmark.zh": "大樊",
      "wordmark.en": "DaFan",
      "aria.wordmark": "DaFan / 大樊",
      "aria.langMenu": "Choose language",
      "aria.lang.zh": "Chinese",
      "aria.lang.en": "English",
      "lang.option.zh": "中",
      "lang.option.en": "EN",
      "lang.switch.zh": "中文",
      "lang.switch.en": "English",
      "footer.copy.zh": "© 2026 大樊",
      "footer.copy.en": "© 2026 DaFan",
      "footer.city": "Chengdu",
      "footer.igLabel": "Instagram @van_wuuuu",
      "home.tagline": "Capture a moment, record a journey",
      "home.lede": "Landscapes and journeys, unfolding as series.",
      "home.meta": "Chengdu · 成都",
      "home.workHeading": "Featured series",
      "home.closing.works": "Works",
      "home.closing.viewAll": "View all",
      "home.closing.follow": "Follow",
      "home.closing.ig": "@van_wuuuu",
      "home.closing.backToTop": "Back to top ↑",
      "home.closing.cta.zh": "联络 ↗",
      "home.closing.cta.en": "Let's talk ↗",
      "work.title": "Work",
      "work.empty": "No series in this category yet.",
      "photography.title": "Photography",
      "photography.lede": "Landscape and travel, one photograph at a time.",
      "card.view": "View",
      "about.title": "About",
      "about.p1": "DaFan is a programmer determined to become a photographer.",
      "about.p2": "Capture a moment, record a journey. Work is shown as individual photographs.",
      "about.p3.prefix": "For more work, follow me on ",
      "about.p3.sep": " and ",
      "about.p3.xhs": "Xiaohongshu",
      "about.p3.end": ".",
      "contact.title": "Contact",
      "contact.emailLabel": "Email",
      "contact.igLabel": "Instagram",
      "contact.xhsLabel": "Xiaohongshu",
      "contact.formName": "Name",
      "contact.formEmail": "Your email",
      "contact.formMessage": "Message",
      "contact.formSubmit": "Send via email",
      "contact.formNote": "Opens your mail app to vanwuuuu@gmail.com.",
      "series.back": "← Work",
      /* series:data:start — 由 tools/new-series.mjs 依据 data/series.json 生成，请勿手改 */
      "work.lede": "Three series, ordered by the road.",
      "work.filter.all": "All",
      "work.filter.travel": "Travel",
      "work.filter.landscape": "Landscape",
      "home.alt.bipenggou": "Bipenggou series cover photograph",
      "series.bipenggou.title": "Bipenggou",
      "series.bipenggou.year": "2024",
      "series.bipenggou.cat": "Landscape",
      "series.bipenggou.copy": "Mist and cool light between the valley and the treeline.",
      "series.bipenggou.alt.1": "Series photograph 1 of 4",
      "series.bipenggou.alt.2": "Series photograph 2 of 4",
      "series.bipenggou.alt.3": "Series photograph 3 of 4",
      "series.bipenggou.alt.4": "Series photograph 4 of 4",
      "home.alt.emeishan": "Mount Emei series cover photograph",
      "series.emeishan.title": "Mount Emei",
      "series.emeishan.year": "2024",
      "series.emeishan.cat": "Landscape",
      "series.emeishan.copy": "Ridgelines and sea of clouds—a slow climb.",
      "series.emeishan.alt.1": "Series photograph 1 of 4",
      "series.emeishan.alt.2": "Series photograph 2 of 4",
      "series.emeishan.alt.3": "Series photograph 3 of 4",
      "series.emeishan.alt.4": "Series photograph 4 of 4",
      "home.alt.qingdao": "Qingdao series cover photograph",
      "series.qingdao.title": "Qingdao",
      "series.qingdao.year": "2024",
      "series.qingdao.cat": "Travel",
      "series.qingdao.copy": "Sea breeze, shoreline, and city light along the route.",
      "series.qingdao.alt.1": "Series photograph 1 of 4",
      "series.qingdao.alt.2": "Series photograph 2 of 4",
      "series.qingdao.alt.3": "Series photograph 3 of 4",
      "series.qingdao.alt.4": "Series photograph 4 of 4"
      /* series:data:end */
    }
  };

  function getLang() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "zh" || stored === "en") return stored;
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === "zh" || legacy === "en") {
      localStorage.setItem(STORAGE_KEY, legacy);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return legacy;
    }
    return DEFAULT;
  }

  function applyLang(lang) {
    const pack = dict[lang] || dict.zh;
    /* Use BCP47 `zh` so CSS lang selectors (e.g. [lang^="zh"]) and legacy `zh` matches stay aligned */
    document.documentElement.lang = lang === "en" ? "en" : "zh";

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      const key = el.getAttribute("data-i18n");
      if (pack[key] != null) {
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.setAttribute("placeholder", pack[key]);
        } else {
          el.textContent = pack[key];
        }
      }
    });

    document.querySelectorAll("[data-i18n-alt]").forEach(function (el) {
      const key = el.getAttribute("data-i18n-alt");
      if (pack[key] != null) el.setAttribute("alt", pack[key]);
    });

    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      const key = el.getAttribute("data-i18n-aria");
      if (pack[key] != null) el.setAttribute("aria-label", pack[key]);
    });

    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      const key = el.getAttribute("data-i18n-title");
      if (pack[key] != null) el.setAttribute("title", pack[key]);
    });

    document.querySelectorAll(".lang-btn").forEach(function (btn) {
      const isActive = btn.getAttribute("data-set-lang") === lang;
      btn.classList.toggle("is-active", isActive);
      if (btn.getAttribute("role") === "radio") {
        btn.setAttribute("aria-checked", isActive ? "true" : "false");
        btn.tabIndex = isActive ? 0 : -1;
      } else {
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      }
    });

    localStorage.setItem(STORAGE_KEY, lang);
    document.dispatchEvent(new CustomEvent("langchange", { detail: { lang: lang } }));
  }

  function init() {
    const lang = getLang();
    applyLang(lang);

    document.querySelectorAll(".lang-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const next = btn.getAttribute("data-set-lang");
        if (next) applyLang(next);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.DaFanI18n = { applyLang: applyLang, getLang: getLang, dict: dict };
})();
