(function () {
  const STORAGE_KEY = "dafan-lang";
  const LEGACY_STORAGE_KEY = "vanwu-lang";
  const DEFAULT = "zh";

  const dict = {
    zh: {
      "nav.work": "作品",
      "nav.about": "关于",
      "nav.contact": "联络",
      "nav.ig": "Instagram",
      "wordmark": "大樊",
      "footer.copy": "© 2026 大樊",
      "home.tagline": "摄一瞬，记一程",
      "home.meta": "风景摄影师 · 成都",
      "home.selected": "精选系列",
      "work.title": "作品",
      "work.filter.all": "全部",
      "work.filter.travel": "旅行",
      "work.filter.landscape": "风景",
      "work.filter.personal": "个人",
      "work.empty": "该分类暂无系列。",
      "about.title": "关于",
      "about.p1": "大樊是一名风景摄影师，现居成都。",
      "about.p2": "摄一瞬，记一程。作品以系列为单位呈现，慢看、少打扰。",
      "about.p3": "日常也会在 Instagram 分享片刻。",
      "contact.title": "联络",
      "contact.emailLabel": "邮箱",
      "contact.igLabel": "Instagram",
      "contact.formName": "姓名",
      "contact.formEmail": "你的邮箱",
      "contact.formMessage": "留言",
      "contact.formSubmit": "用邮件发送",
      "contact.formNote": "将打开你的邮件应用，收件人为 vanwuuuu@gmail.com。",
      "series.back": "← 作品",
      "series.placeholder": "照片位置预留，稍后替换为成片。",
      "s1.title": "北境疏林",
      "s1.year": "2024",
      "s1.cat": "风景",
      "s1.copy": "疏林、薄雾与北境的冷色光线。",
      "s2.title": "海边公路",
      "s2.year": "2023",
      "s2.cat": "旅行",
      "s2.copy": "沿着海岸线缓慢前行的一段行程。",
      "s3.title": "窗边日记",
      "s3.year": "2025",
      "s3.cat": "个人",
      "s3.copy": "日常光影里的安静片刻。"
    },
    en: {
      "nav.work": "Work",
      "nav.about": "About",
      "nav.contact": "Contact",
      "nav.ig": "Instagram",
      "wordmark": "DaFan",
      "footer.copy": "© 2026 DaFan",
      "home.tagline": "Capture a moment, record a journey",
      "home.meta": "Landscape photographer · Chengdu",
      "home.selected": "Selected series",
      "work.title": "Work",
      "work.filter.all": "All",
      "work.filter.travel": "Travel",
      "work.filter.landscape": "Landscape",
      "work.filter.personal": "Personal",
      "work.empty": "No series in this category yet.",
      "about.title": "About",
      "about.p1": "DaFan is a landscape photographer based in Chengdu.",
      "about.p2": "Capture a moment, record a journey. Work is presented as series—slow, quiet, unhurried.",
      "about.p3": "Moments also appear on Instagram.",
      "contact.title": "Contact",
      "contact.emailLabel": "Email",
      "contact.igLabel": "Instagram",
      "contact.formName": "Name",
      "contact.formEmail": "Your email",
      "contact.formMessage": "Message",
      "contact.formSubmit": "Send via email",
      "contact.formNote": "Opens your mail app to vanwuuuu@gmail.com.",
      "series.back": "← Work",
      "series.placeholder": "Image placeholder — replace with final photographs later.",
      "s1.title": "North Woods",
      "s1.year": "2024",
      "s1.cat": "Landscape",
      "s1.copy": "Sparse woods, mist, and cool northern light.",
      "s2.title": "Coast Road",
      "s2.year": "2023",
      "s2.cat": "Travel",
      "s2.copy": "A slow stretch along the coastline.",
      "s3.title": "Window Notes",
      "s3.year": "2025",
      "s3.cat": "Personal",
      "s3.copy": "Quiet fragments of everyday light."
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
    document.documentElement.lang = lang === "en" ? "en" : "zh-Hans";

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

    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      const key = el.getAttribute("data-i18n-aria");
      if (pack[key] != null) el.setAttribute("aria-label", pack[key]);
    });

    document.querySelectorAll(".lang-btn").forEach(function (btn) {
      const isActive = btn.getAttribute("data-set-lang") === lang;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
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
