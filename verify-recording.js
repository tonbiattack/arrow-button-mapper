"use strict";

const fs = require("fs");
const vm = require("vm");

// ブラウザを起動せず、content.js を VM 上で評価するための最小限の DOM モック。
class ElementMock {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = attributes;
    this.id = attributes.id || "";
    this.children = [];
    this.style = {};
    this.parentElement = null;
    this.disabled = false;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  append(...nodes) {
    this.children.push(...nodes);
    for (const node of nodes) node.parentElement = this;
  }

  attachShadow() {
    return new ElementMock("shadow-root");
  }

  remove() {
    this.removed = true;
  }

  closest(selector) {
    if (selector === "a, button, input[type='button'], input[type='submit'], [role='button'], [role='link']") {
      return this.tagName === "A" ? this : null;
    }
    if (selector === "nav, [role='navigation']") {
      return this.parentElement?.tagName === "NAV" ? this.parentElement : null;
    }
    return null;
  }
}

// ページ番号が変わる「次のページ」リンクを含むページネーションをテスト用に再現する。
const target = new ElementMock("a", { href: "/topics/claude?order=daily&page=4" });
const nav = new ElementMock("nav");
nav.append(target);
const listeners = {};
let recordingMessageListener;
const stored = { enabled: true, mappings: [] };

// 設定の読書きとポップアップからの録画開始要求だけを再現する Chrome API モック。
const chromeMock = {
  runtime: {
    lastError: null,
    onMessage: {
      addListener(listener) {
        recordingMessageListener = listener;
      }
    }
  },
  storage: {
    sync: {
      get(defaults, callback) {
        callback({ ...defaults, ...stored });
      },
      set(partial, callback) {
        Object.assign(stored, partial);
        callback();
      }
    },
    onChanged: { addListener() {} }
  }
};

// 生成される selector が、対象リンクだけに一致するよう querySelectorAll を定義する。
const documentMock = {
  documentElement: new ElementMock("html"),
  createElement(tagName) {
    return new ElementMock(tagName);
  },
  querySelector() {
    return null;
  },
  querySelectorAll(selector) {
    if (selector === 'nav a[href^="/topics/claude?order=daily&page="]:last-child') return [target];
    return [];
  }
};

const context = {
  chrome: chromeMock,
  Element: ElementMock,
  console,
  crypto: { randomUUID: () => "recorded-id" },
  document: documentMock,
  window: {
    location: {
      origin: "https://zenn.dev",
      pathname: "/topics/claude",
      href: "https://zenn.dev/topics/claude?order=daily&page=3"
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    removeEventListener(type) {
      delete listeners[type];
    },
    setTimeout(callback) {
      callback();
    }
  }
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 本物の content.js を読み込み、登録されたメッセージ・クリックリスナーをテストする。
vm.runInNewContext(fs.readFileSync("content.js", "utf8"), context, { filename: "content.js" });

// 左キーの記憶開始を要求すると、ページ側にクリック監視が登録される。
let response;
recordingMessageListener({ type: "startRecording", direction: "left" }, {}, (value) => { response = value; });
assert(response?.ok === true, "録画モードを開始できません。");
assert(typeof listeners.click === "function", "録画用のクリックリスナーが登録されていません。");

// 対象リンクをクリックしたイベントを渡し、遷移を止めて設定だけを保存できることを確認する。
const clickEvent = {
  target,
  composedPath() { return [target]; },
  preventDefault() { this.defaultPrevented = true; },
  stopImmediatePropagation() { this.propagationStopped = true; }
};
listeners.click(clickEvent);

assert(clickEvent.defaultPrevented && clickEvent.propagationStopped, "記憶対象クリックが遷移前に捕捉されていません。");
// URL の query を除いた条件と、ページ番号に依存しない selector が保存されることが重要である。
assert(stored.mappings.length === 1, "記憶した操作ペアが保存されていません。");
assert(stored.mappings[0].urlPattern === "https://zenn.dev/topics/claude", "URL 条件が現在ページの origin と path から作られていません。");
assert(stored.mappings[0].leftSelector === 'nav a[href^="/topics/claude?order=daily&page="]:last-child', "動的ページ番号に対応する CSS セレクタが保存されていません。");

console.log("content.js のクリック記憶、URL 条件生成、動的ページネーションセレクタ保存を検証しました。");
