(function () {
  function initFilters() {
    const root = document.querySelector("[data-filter-root]");
    if (!root) return;

    const buttons = root.querySelectorAll("[data-filter]");
    const cards = document.querySelectorAll("[data-category]");
    const empty = document.querySelector("[data-filter-empty]");

    function setFilter(value) {
      let visible = 0;
      cards.forEach(function (card) {
        const cat = card.getAttribute("data-category") || "";
        const show = value === "all" || cat === value;
        card.classList.toggle("is-hidden", !show);
        if (show) visible += 1;
      });
      buttons.forEach(function (btn) {
        const active = btn.getAttribute("data-filter") === value;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
      if (empty) empty.classList.toggle("is-visible", visible === 0);
      document.dispatchEvent(new CustomEvent("works-filter-change"));
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        setFilter(btn.getAttribute("data-filter") || "all");
      });
    });

    setFilter("all");
  }

  function initNavRoll() {
    document.querySelectorAll(".site-nav .nav-link-label").forEach(function (label) {
      if (label.querySelector(".nav-roll")) return;
      var text = (label.textContent || "").trim();
      if (!text) return;
      label.textContent = "";
      var track = document.createElement("span");
      track.className = "nav-roll";
      track.setAttribute("data-roll", text);
      var current = document.createElement("span");
      current.className = "nav-roll__a";
      current.textContent = text;
      track.appendChild(current);
      label.appendChild(track);
    });
  }

  function initMailtoForm() {
    const form = document.querySelector("[data-mailto-form]");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const name = (form.querySelector('[name="name"]') || {}).value || "";
      const email = (form.querySelector('[name="email"]') || {}).value || "";
      const message = (form.querySelector('[name="message"]') || {}).value || "";
      const subject = encodeURIComponent("DaFan / 大樊 — contact from " + (name || "website"));
      const body = encodeURIComponent("Name: " + name + "\nEmail: " + email + "\n\n" + message);
      window.location.href = "mailto:vanwuuuu@gmail.com?subject=" + subject + "&body=" + body;
    });
  }

  function initImageFallback() {
    document.querySelectorAll("img[data-cloud-fallback]").forEach(function (img) {
      img.addEventListener("error", function () {
        img.removeAttribute("src");
        img.setAttribute("data-broken", "true");
        var fig = img.closest(".series-figure");
        if (fig) fig.classList.add("is-placeholder");
      });
    });
  }

  function init() {
    initNavRoll();
    initFilters();
    initMailtoForm();
    initImageFallback();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  document.addEventListener("langchange", function () {
    window.setTimeout(initNavRoll, 0);
  });
})();
