"use strict";

const fs = require("fs");
const vm = require("vm");

class MockElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.listeners = {};
    this.dataset = {};
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.checked = false;
    this.hidden = false;
    this.files = [];
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  dispatch(type, event = {}) {
    return this.listeners[type]?.({
      preventDefault() {},
      target: this,
      ...event
    });
  }

  click() {
    if (this.tagName === "A") {
      downloads.push({ href: this.href, download: this.download });
      return;
    }
    return this.dispatch("click");
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
  }

  remove() {
    this.removed = true;
  }

  reset() {
    this.resetCalled = true;
  }

  focus() {}

  closest() {
    return null;
  }
}

class BlobMock {
  constructor(parts, options) {
    this.text = parts.join("");
    this.type = options.type;
  }
}

const downloads = [];
const recordingMessages = [];
let exportedBlob;
let confirmationCount = 0;
const selectors = [
  "#enabled", "#mappingForm", "#editingId", "#urlPattern", "#leftSelector", "#rightSelector",
  "#formTitle", "#saveButton", "#cancelButton", "#formMessage", "#mappingList", "#mappingCount",
  "#exportButton", "#importInput", "#transferMessage", "#recordLeftButton", "#recordRightButton", "#recordMessage"
];
const elements = Object.fromEntries(selectors.map((selector) => [selector, new MockElement()]));
const storage = {
  enabled: true,
  mappings: [{
    id: "original",
    urlPattern: "https://example.com/",
    leftSelector: "#old-left",
    rightSelector: "#old-right"
  }]
};

const chromeMock = {
  runtime: { lastError: null },
  tabs: {
    query(_queryInfo, callback) {
      callback([{ id: 42 }]);
    },
    sendMessage(tabId, message, callback) {
      recordingMessages.push({ tabId, message });
      callback({ ok: true });
    }
  },
  storage: {
    sync: {
      get(defaults, callback) {
        callback({ ...defaults, ...storage });
      },
      set(partial, callback) {
        Object.assign(storage, partial);
        callback();
      }
    }
  }
};

const context = {
  Blob: BlobMock,
  chrome: chromeMock,
  console,
  crypto: { randomUUID: () => "generated-id" },
  document: {
    body: new MockElement("body"),
    querySelector(selector) {
      if (selector === "[invalid") throw new Error("Invalid selector");
      return elements[selector] || new MockElement();
    },
    createElement(tagName) {
      return new MockElement(tagName);
    }
  },
  URL: {
    createObjectURL(blob) {
      exportedBlob = blob;
      return "blob:settings-export";
    },
    revokeObjectURL() {}
  },
  window: {
    confirm() {
      confirmationCount += 1;
      return true;
    }
  },
  setTimeout(callback) {
    callback();
  }
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verify() {
  vm.runInNewContext(fs.readFileSync("popup.js", "utf8"), context, { filename: "popup.js" });

  assert(typeof elements["#exportButton"].listeners.click === "function", "エクスポート操作が登録されていません。");
  elements["#exportButton"].click();
  assert(downloads.length === 1 && downloads[0].download.endsWith(".json"), "JSON ダウンロードが開始されていません。");

  elements["#recordLeftButton"].click();
  assert(recordingMessages.length === 1 && recordingMessages[0].tabId === 42, "録画開始メッセージが現在のタブへ送信されていません。");
  assert(recordingMessages[0].message.type === "startRecording" && recordingMessages[0].message.direction === "left", "左キー用の録画開始メッセージが不正です。");
  assert(elements["#recordMessage"].textContent.includes("記憶中"), "録画開始状態が表示されていません。");

  const exported = JSON.parse(exportedBlob.text);
  assert(exported.format === "arrow-button-mapper" && exported.version === 1, "エクスポート形式が不正です。");
  assert(exported.settings.enabled === true && exported.settings.mappings.length === 1, "エクスポート設定が不正です。");

  const importedPayload = {
    format: "arrow-button-mapper",
    version: 1,
    settings: {
      enabled: false,
      mappings: [{
        id: "gallery",
        urlPattern: "https://e-hentai.org/g/",
        leftSelector: "#ptt td:first-child > a",
        rightSelector: "#ptt td:last-child > a"
      }]
    }
  };

  elements["#importInput"].files = [{
    size: JSON.stringify(importedPayload).length,
    text: async () => JSON.stringify(importedPayload)
  }];
  elements["#importInput"].dispatch("change");
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert(confirmationCount === 1, "インポート時の置換確認が行われていません。");
  assert(storage.enabled === false, "インポート時の有効状態が保存されていません。");
  assert(storage.mappings.length === 1 && storage.mappings[0].id === "gallery", "インポート時に操作ペアが置き換わっていません。");
  assert(elements["#mappingCount"].textContent === "1", "インポート後の操作ペア表示が更新されていません。");

  console.log("popup.js の録画開始、JSON エクスポート、検証付きインポート、設定置換を確認しました。");
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
