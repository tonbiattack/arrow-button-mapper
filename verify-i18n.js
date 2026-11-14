"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { execFileSync } = require("child_process");
const createI18n = require("./test-i18n");
const en = require("./_locales/en/messages.json");
const ja = require("./_locales/ja/messages.json");
const html = fs.readFileSync("popup.html", "utf8");
const manifest = require("./manifest.json");

assert.equal(manifest.default_locale, "en");
assert.equal(manifest.description, "__MSG_extensionDescription__");
assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(ja).sort());
for (const key of Object.keys(en)) {
  assert(en[key].message.trim() && ja[key].message.trim(), `Empty translation: ${key}`);
  assert(!/[ぁ-んァ-ン一-龠]/u.test(en[key].message), `Japanese in English translation: ${key}`);
  const placeholders = text => (text.match(/\$\d+/g) || []).sort();
  assert.deepStrictEqual(placeholders(en[key].message), placeholders(ja[key].message), `Placeholders: ${key}`);
}
for (const file of ["content.js", "popup.js", "background.js"]) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/\b(?:t|(?:chrome\.)?i18n\.getMessage)\("([a-zA-Z0-9_]+)"/g)) {
    assert(en[match[1]], `Missing message in ${file}: ${match[1]}`);
  }
  const executableLines = source.split("\n").filter(line => !line.trim().startsWith("//"));
  assert(!executableLines.some(line => /[ぁ-んァ-ン一-龠]/u.test(line)), `Untranslated UI in ${file}`);
}

// Every Japanese text node and placeholder in the fallback HTML must be localized.
for (const match of html.matchAll(/<([a-z][a-z0-9]*)([^>]*)>([^<]+)<\//g)) {
  if (/[ぁ-んァ-ン一-龠]/u.test(match[3])) assert(match[2].includes("data-i18n="), match[0]);
}
for (const match of html.matchAll(/<input[^>]*placeholder="[^"]+"[^>]*>/g)) {
  assert(match[0].includes("data-i18n-placeholder="), match[0]);
}

for (const locale of ["ja", "en", "en_US", "de"]) {
  const i18n = createI18n(locale);
  const textNodes = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(match => ({ dataset: { i18n: match[1] } }));
  const inputs = [...html.matchAll(/data-i18n-placeholder="([^"]+)"/g)].map(match => ({
    dataset: { i18nPlaceholder: match[1] }, setAttribute(key, value) { this[key] = value; }
  }));
  const document = {
    documentElement: {},
    querySelectorAll(selector) { return selector === "[data-i18n]" ? textNodes : inputs; }
  };
  vm.runInNewContext(fs.readFileSync("popup-localize.js", "utf8"), { chrome: { i18n }, document });
  assert.equal(document.documentElement.lang, locale.replaceAll("_", "-"));
  for (const node of textNodes) assert.equal(node.textContent, i18n.getMessage(node.dataset.i18n));
  for (const node of inputs) assert.equal(node.placeholder, i18n.getMessage(node.dataset.i18nPlaceholder));
  if (locale !== "ja") assert(textNodes.every(node => !/[ぁ-んァ-ン一-龠]/u.test(node.textContent)));

  const menus = [];
  const events = {};
  vm.runInNewContext(fs.readFileSync("background.js", "utf8"), { chrome: {
    i18n, runtime: { lastError: null, onInstalled: { addListener(fn) { events.install = fn; } }, onStartup: { addListener(fn) { events.startup = fn; } } },
    contextMenus: { create(menu) { menus.push(menu); }, removeAll(cb) { menus.length = 0; cb(); }, onClicked: { addListener(fn) { events.click = fn; } } },
    tabs: { sendMessage() {} }
  } });
  for (const event of [events.install, events.startup]) {
    event();
    assert.equal(menus.length, 3);
    assert.equal(menus[1].title, i18n.getMessage("contextLeft"));
    assert.equal(menus[2].title, i18n.getMessage("contextRight"));
  }
}

// Run the actual popup/content regression suites in English as well as Japanese.
for (const file of ["verify-content.js", "verify-recording.js", "verify-new-recording.js", "verify-popup.js"]) {
  execFileSync(process.execPath, [file], { env: { ...process.env, TEST_LOCALE: "en" }, stdio: "pipe" });
}
console.log("日英の翻訳・プレースホルダー・ポップアップ・メニューと言語別の登録動作を検証しました。");
