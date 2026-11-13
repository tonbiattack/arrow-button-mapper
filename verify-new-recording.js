"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

class Element {
  constructor(tag, id = "") { this.tagName = tag.toUpperCase(); this.id = id; this.style = {}; this.children = []; this.isConnected = true; this.handlers = {}; }
  getAttribute(name) { return name === "id" ? this.id : null; }
  setAttribute() {}
  append(...children) { this.children.push(...children); }
  attachShadow() { return this.shadow = new Element("shadow"); }
  remove() { this.removed = true; }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  closest(selector) { return selector.startsWith("a, button") && this.tagName === "BUTTON" ? this : null; }
}
const left = new Element("button", "prev");
const right = new Element("button", "next");
const listeners = {};
let message;
let fail = false;
const stored = { enabled: true, mappings: [{ id: "old", urlPattern: "https://example.com/path", leftSelector: "#old", rightSelector: "#keep" }] };
const chrome = {
  runtime: { lastError: null, onMessage: { addListener(fn) { message = fn; } } },
  storage: { onChanged: { addListener() {} }, sync: {
    get(defaults, cb) { cb({ ...defaults, ...stored }); },
    set(value, cb) { if (fail) chrome.runtime.lastError = { message: "failure" }; else Object.assign(stored, value); cb(); chrome.runtime.lastError = null; }
  } }
};
const root = new Element("html");
const document = { documentElement: root, createElement: tag => new Element(tag), querySelectorAll: selector => selector === "#prev" ? [left] : selector === "#next" ? [right] : [] };
const window = { location: { origin: "https://example.com", pathname: "/path", href: "https://example.com/path?q=1" }, addEventListener(type, fn) { listeners[type] = fn; }, removeEventListener(type) { delete listeners[type]; }, setTimeout() {} };
vm.runInNewContext(fs.readFileSync("content.js", "utf8"), { chrome, document, window, Element, crypto: { randomUUID: () => "new" }, console, Date });
const send = data => { let result; message(data, {}, value => { result = value; }); return result; };
const event = target => ({ target, composedPath: () => [target], preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } });
const button = label => {
  const overlay = [...root.children].reverse().find(node => node.shadow && !node.removed);
  const control = overlay.shadow.children[0].children.find(node => node.textContent === label);
  assert(control, `missing ${label}`);
  control.handlers.click();
};

assert(send({ type: "startRecording", direction: "both" }).ok);
let click = event(left); listeners.click(click);
assert(click.prevented && click.stopped);
assert.equal(stored.mappings[0].leftSelector, "#old");
click = event(right); listeners.click(click);
assert(click.prevented && click.stopped);
assert.equal(stored.mappings[0].leftSelector, "#prev");
assert.equal(stored.mappings[0].rightSelector, "#next");

send({ type: "startRecording", direction: "both" });
button("スキップ");
listeners.click(event(left));
fail = true; button("保存");
assert.equal(stored.mappings[0].rightSelector, "#next");
fail = false; button("保存");
assert.equal(stored.mappings[0].leftSelector, "#prev");
assert.equal(stored.mappings[0].rightSelector, "#prev");

send({ type: "startRecording", direction: "both" });
listeners.click(event(right));
button("やり直し");
listeners.keydown({ key: "Escape", preventDefault() {}, stopImmediatePropagation() {} });
assert.equal(stored.mappings[0].leftSelector, "#prev");

listeners.contextmenu(event(right));
assert(send({ type: "registerContextTarget", direction: "left" }).ok);
assert.equal(stored.mappings[0].leftSelector, "#next");
assert.equal(stored.mappings[0].rightSelector, "#prev");
assert.equal(send({ type: "registerContextTarget", direction: "right" }).ok, false);
listeners.contextmenu(event(left)); left.isConnected = false;
assert.equal(send({ type: "registerContextTarget", direction: "right" }).ok, false);
listeners.contextmenu(event(new Element("div")));
assert.equal(send({ type: "registerContextTarget", direction: "right" }).ok, false);
console.log("一括登録、スキップ、再試行、中止、右クリック対象の検証を確認しました。");
