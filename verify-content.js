"use strict";

const fs = require("fs");
const vm = require("vm");

class ElementMock {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName;
    this.attributes = attributes;
    this.isContentEditable = Boolean(attributes.contenteditable);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
}

function createClickableElement({ disabled = false, ariaDisabled = false } = {}) {
  return {
    disabled,
    clicks: 0,
    getAttribute(name) {
      return name === "aria-disabled" && ariaDisabled ? "true" : null;
    },
    click() {
      this.clicks += 1;
    }
  };
}

const targets = {
  "#site-prev": createClickableElement(),
  "#site-next": createClickableElement(),
  "#gallery-prev": createClickableElement(),
  "#gallery-next": createClickableElement(),
  "#disabled-next": createClickableElement({ disabled: true })
};

const listeners = {};
let storageChangeListener;

const chromeMock = {
  runtime: {
    lastError: null,
    onMessage: { addListener() {} }
  },
  storage: {
    sync: {
      get(defaults, callback) {
        callback({
          ...defaults,
          enabled: true,
          mappings: [
            {
              id: "site",
              urlPattern: "https://e-hentai.org/*",
              leftSelector: "#site-prev",
              rightSelector: "#site-next"
            },
            {
              id: "gallery",
              urlPattern: "https://e-hentai.org/g/",
              leftSelector: "#gallery-prev",
              rightSelector: "#gallery-next"
            }
          ]
        });
      }
    },
    onChanged: {
      addListener(listener) {
        storageChangeListener = listener;
      }
    }
  }
};

const context = {
  chrome: chromeMock,
  Element: ElementMock,
  console,
  document: {
    querySelector(selector) {
      if (selector === "[invalid") throw new Error("Invalid selector");
      return targets[selector] || null;
    }
  },
  window: {
    location: { href: "https://e-hentai.org/g/4126828/98c7949b6f/?p=1" },
    addEventListener(type, listener) {
      listeners[type] = listener;
    }
  }
};

vm.runInNewContext(fs.readFileSync("content.js", "utf8"), context, { filename: "content.js" });

function createKeyEvent(key, path = []) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.propagationStopped = true; },
    composedPath() { return path; }
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(typeof listeners.keydown === "function", "keydown のキャプチャリスナーが登録されていません。");

const galleryRight = createKeyEvent("ArrowRight");
listeners.keydown(galleryRight);
assert(targets["#gallery-next"].clicks === 1, "子 URL 条件の → ボタンがクリックされていません。");
assert(targets["#site-next"].clicks === 0, "親 URL 条件が子 URL 条件より優先されています。");
assert(galleryRight.defaultPrevented && galleryRight.propagationStopped, "クリック成功時にキーイベントが抑制されていません。");

const galleryLeft = createKeyEvent("ArrowLeft");
listeners.keydown(galleryLeft);
assert(targets["#gallery-prev"].clicks === 1, "子 URL 条件の ← ボタンがクリックされていません。");

context.window.location.href = "https://e-hentai.org/tag/to-love-ru?next=4129455";
const siteRight = createKeyEvent("ArrowRight");
listeners.keydown(siteRight);
assert(targets["#site-next"].clicks === 1, "親 URL 条件がギャラリー外の URL に適用されていません。");

storageChangeListener({
  mappings: {
    newValue: [{
      id: "prefix-only",
      urlPattern: "https://e-hentai.org/",
      leftSelector: "#site-prev",
      rightSelector: "#site-next"
    }]
  }
}, "sync");
const prefixOnly = createKeyEvent("ArrowRight");
listeners.keydown(prefixOnly);
assert(targets["#site-next"].clicks === 2, "末尾の * がない URL 条件で配下 URL に一致していません。");

const input = new ElementMock("INPUT", { type: "text" });
const inputEvent = createKeyEvent("ArrowRight", [input]);
listeners.keydown(inputEvent);
assert(targets["#site-next"].clicks === 2 && !inputEvent.defaultPrevented, "入力欄での → キーを奪っています。");

storageChangeListener({
  mappings: {
    newValue: [{
      id: "disabled",
      urlPattern: "https://e-hentai.org/",
      leftSelector: "",
      rightSelector: "#disabled-next"
    }]
  }
}, "sync");
const disabled = createKeyEvent("ArrowRight");
listeners.keydown(disabled);
assert(targets["#disabled-next"].clicks === 0 && !disabled.defaultPrevented, "無効化された要素をクリックまたはイベント抑制しています。");

console.log("content.js の前方一致、親子 URL 条件の優先順位、左右クリックを検証しました。");
