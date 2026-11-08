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
      "footer.copy.zh": "© 2026 大樊",
      "footer.copy.en": "© 2026 DaFan",
      "footer.city": "成都",
      "footer.igLabel": "Instagram @van_wuuuu",
      "home.tagline": "摄一瞬，记一程",
      "home.lede": "风景与旅途，以系列慢慢展开。",
      "home.meta": "成都 · Chengdu",
      "home.workHeading": "精选系列",
      "home.hero.pause": "暂停",
      "home.hero.play": "继续",
      "home.hero.pauseAria": "暂停首页作品轮播",
      "home.hero.playAria": "继续首页作品轮播",
      "home.alt.bipenggou": "毕棚沟系列作品封面",
      "home.alt.emeishan": "峨眉山系列作品封面",
      "home.alt.qingdao": "青岛系列作品封面",
      "work.title": "作品",
      "work.lede": "三个系列，以途为序。",
      "work.filter.all": "全部",
      "work.filter.travel": "旅行",
      "work.filter.landscape": "风景",
      "work.empty": "该分类暂无系列。",
      "photography.title": "摄影",
      "photography.lede": "以系列为单位的风景与旅途片段。",
      "card.view": "查看",
      "about.title": "关于",
      "about.p1": "大樊是一名风景摄影师，现居成都。",
      "about.p2": "摄一瞬，记一程。作品以系列为单位呈现，慢看、少打扰。",
      "about.p3": "更多片刻在 Instagram（页脚）。",
      "contact.title": "联络",
      "contact.emailLabel": "邮箱",
      "contact.igLabel": "Instagram",
      "contact.formName": "姓名",
      "contact.formEmail": "你的邮箱",
      "contact.formMessage": "留言",
      "contact.formSubmit": "用邮件发送",
      "contact.formNote": "将打开你的邮件应用，收件人为 vanwuuuu@gmail.com。",
      "series.back": "← 作品",
      "series.alt.cover": "系列作品，第 1 张",
      "series.alt.frame2": "系列作品，第 2 张",
      "series.alt.frame3": "系列作品，第 3 张",
      "series.alt.frame4": "系列作品，第 4 张",
      "s1.title": "毕棚沟",
      "s1.year": "2024",
      "s1.cat": "风景",
      "s1.copy": "山谷与林线之间的薄雾与冷色光线。",
      "s2.title": "峨眉山",
      "s2.year": "2024",
      "s2.cat": "风景",
      "s2.copy": "山线与云海之间，缓慢攀登的一程。",
      "s3.title": "青岛",
      "s3.year": "2024",
      "s3.cat": "旅行",
      "s3.copy": "海风、岸线与城市霓虹交叠的一段路。"
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
      "footer.copy.zh": "© 2026 大樊",
      "footer.copy.en": "© 2026 DaFan",
      "footer.city": "Chengdu",
      "footer.igLabel": "Instagram @van_wuuuu",
      "home.tagline": "Capture a moment, record a journey",
      "home.lede": "Landscapes and journeys, unfolding as series.",
      "home.meta": "Chengdu · 成都",
      "home.workHeading": "Featured series",
      "home.hero.pause": "Pause",
      "home.hero.play": "Play",
      "home.hero.pauseAria": "Pause the home hero rotation",
      "home.hero.playAria": "Resume the home hero rotation",
      "home.alt.bipenggou": "Bipenggou series cover photograph",
      "home.alt.emeishan": "Mount Emei series cover photograph",
      "home.alt.qingdao": "Qingdao series cover photograph",
      "work.title": "Work",
      "work.lede": "Three series, ordered by the road.",
      "work.filter.all": "All",
      "work.filter.travel": "Travel",
      "work.filter.landscape": "Landscape",
      "work.empty": "No series in this category yet.",
      "photography.title": "Photography",
      "photography.lede": "Fragments of landscape and travel, told as series.",
      "card.view": "View",
      "about.title": "About",
      "about.p1": "DaFan is a landscape photographer based in Chengdu.",
      "about.p2": "Capture a moment, record a journey. Work is shown as series—slow and unobtrusive.",
      "about.p3": "More fragments on Instagram (footer).",
      "contact.title": "Contact",
      "contact.emailLabel": "Email",
      "contact.igLabel": "Instagram",
      "contact.formName": "Name",
      "contact.formEmail": "Your email",
      "contact.formMessage": "Message",
      "contact.formSubmit": "Send via email",
      "contact.formNote": "Opens your mail app to vanwuuuu@gmail.com.",
      "series.back": "← Work",
      "series.alt.cover": "Series photograph 1 of 4",
      "series.alt.frame2": "Series photograph 2 of 4",
      "series.alt.frame3": "Series photograph 3 of 4",
      "series.alt.frame4": "Series photograph 4 of 4",
      "s1.title": "Bipenggou",
      "s1.year": "2024",
      "s1.cat": "Landscape",
      "s1.copy": "Mist and cool light between the valley and the treeline.",
      "s2.title": "Mount Emei",
      "s2.year": "2024",
      "s2.cat": "Landscape",
      "s2.copy": "Ridgelines and sea of clouds—a slow climb.",
      "s3.title": "Qingdao",
      "s3.year": "2024",
      "s3.cat": "Travel",
      "s3.copy": "Sea breeze, shoreline, and city light along the route."
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
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    document.querySelectorAll("[data-lang-current]").forEach(function (el) {
      el.textContent = lang === "en" ? "EN" : "中";
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
