(function () {
  "use strict";

  function closeDropdown(root) {
    var menu = root.querySelector(".lang-dropdown__menu");
    var trigger = root.querySelector(".lang-dropdown__trigger");
    if (!menu || !trigger) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function openDropdown(root) {
    document.querySelectorAll("[data-lang-dropdown]").forEach(function (other) {
      if (other !== root) closeDropdown(other);
    });
    var menu = root.querySelector(".lang-dropdown__menu");
    var trigger = root.querySelector(".lang-dropdown__trigger");
    if (!menu || !trigger) return;
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  }

  function initDropdown(root) {
    var trigger = root.querySelector(".lang-dropdown__trigger");
    var menu = root.querySelector(".lang-dropdown__menu");
    if (!trigger || !menu) return;

    trigger.addEventListener("click", function () {
      if (menu.hidden) openDropdown(root);
      else closeDropdown(root);
    });

    menu.querySelectorAll(".lang-dropdown__option").forEach(function (opt) {
      opt.addEventListener("click", function () {
        closeDropdown(root);
      });
    });

    root.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (!menu.hidden) {
          e.preventDefault();
          closeDropdown(root);
          trigger.focus();
        }
      }
    });
  }

  function initGlobal() {
    document.querySelectorAll("[data-lang-dropdown]").forEach(initDropdown);

    document.addEventListener("click", function (e) {
      if (!(e.target instanceof Element)) return;
      document.querySelectorAll("[data-lang-dropdown]").forEach(function (root) {
        if (!root.contains(e.target)) closeDropdown(root);
      });
    });

    document.addEventListener("langchange", function () {
      document.querySelectorAll("[data-lang-dropdown]").forEach(closeDropdown);
    });
  }

  window.DaFanLangDropdown = { closeAll: function () {
    document.querySelectorAll("[data-lang-dropdown]").forEach(closeDropdown);
  } };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGlobal);
  } else {
    initGlobal();
  }
})();
