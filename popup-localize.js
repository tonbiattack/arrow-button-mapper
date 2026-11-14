(() => {
  "use strict";

  document.documentElement.lang = chrome.i18n.getMessage("@@ui_locale").replaceAll("_", "-");
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = chrome.i18n.getMessage(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
    element.setAttribute("placeholder", chrome.i18n.getMessage(element.dataset.i18nPlaceholder));
  }
})();
