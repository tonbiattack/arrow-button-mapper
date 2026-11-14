"use strict";

// Chrome message substitution for browser-free tests; production uses chrome.i18n.
module.exports = function createI18n(locale = process.env.TEST_LOCALE || "ja") {
  const language = locale.split(/[-_]/)[0] === "ja" ? "ja" : "en";
  const messages = require(`./_locales/${language}/messages.json`);
  return {
    getMessage(key, values = []) {
      if (key === "@@ui_locale") return locale;
      if (!messages[key]) throw new Error(`Missing translation: ${language}/${key}`);
      const substitutions = Array.isArray(values) ? values : [values];
      return messages[key].message.replace(/\$(\d+)/g, (_, number) => substitutions[Number(number) - 1] ?? "");
    }
  };
};
