"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

class Element {
  constructor(tag = "div", attrs = {}, text = "") {
    this.tagName = tag.toUpperCase(); this.attrs = attrs; this.id = attrs.id || ""; this.innerText = text;
    this.textContent = ""; this.style = {}; this.children = []; this.handlers = {}; this.value = ""; this.isConnected = true;
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  setAttribute(name, value) { this.attrs[name] = value; }
  closest(selector) { return selector.startsWith("[hidden]") && this.attrs.hidden ? this : null; }
  getClientRects() { return this.attrs.invisible ? [] : [{}]; }
  querySelector() { return null; }
  append(...items) { this.children.push(...items); }
  attachShadow() { return this.shadow = new Element(); }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  scrollIntoView() {}
  remove() { this.removed = true; }
}
const prev = new Element("a", { id: "prev", rel: "prev" }, "前へ");
const next = new Element("button", { id: "next", "aria-label": "Next" });
const next2 = new Element("button", { id: "other" }, "次へ");
const hidden = new Element("button", { id: "hidden", invisible: true }, "次へ");
const nodes = [prev, next, next2, hidden];
const root = new Element("html");
const document = { documentElement: root, createElement: tag => new Element(tag), querySelectorAll(selector) {
  if (selector.startsWith("a, button")) return nodes;
  return nodes.filter(node => selector === `#${node.id}`);
} };
let message, confirmResult = false, confirmations = 0;
const stored = { enabled: true, mappings: [{ id: "1", urlPattern: "https://example.com/book", leftSelector: "#old", rightSelector: "#keep" }] };
const chrome = { runtime: { lastError: null, onMessage: { addListener(fn) { message = fn; } } }, storage: {
  onChanged: { addListener() {} }, sync: { get(defaults, cb) { cb({ ...defaults, ...stored }); }, set(value, cb) { Object.assign(stored, value); cb(); } }
} };
const window = { location: { origin: "https://example.com", pathname: "/book", href: "https://example.com/book" }, getComputedStyle: () => ({ display: "block", visibility: "visible" }), addEventListener() {}, removeEventListener() {}, setTimeout() {}, confirm() { confirmations++; return confirmResult; } };
vm.runInNewContext(fs.readFileSync("content.js", "utf8"), { chrome, window, document, Element, console, crypto: { randomUUID: () => "id" } });
function start() {
  let response; message({ type: "detectNavigation" }, {}, value => { response = value; }); assert(response.ok);
  const overlay = [...root.children].reverse().find(node => node.shadow && !node.removed);
  return overlay.shadow.children[0];
}
function controls(panel) { return { selects: panel.children.filter(el => el.tagName === "LABEL").map(el => el.children[0]), buttons: panel.children.filter(el => el.tagName === "BUTTON") }; }
let panel = start();
let { selects, buttons } = controls(panel);
assert.equal(selects[0].children.length, 2, "rel=prev candidate");
assert.equal(selects[1].children.length, 3, "aria-label and text candidates; hidden excluded");
assert.equal(selects[0].value, "0");
assert.equal(selects[1].value, "", "multiple candidates require selection");
buttons[0].handlers.click();
assert.equal(prev.style.outline, "3px solid #3284ff");
buttons[2].handlers.click();
assert.equal(confirmations, 1);
assert.equal(stored.mappings[0].leftSelector, "#old", "reject overwrite");
confirmResult = true;
buttons[2].handlers.click();
assert.equal(stored.mappings[0].leftSelector, "#prev");
assert.equal(stored.mappings[0].rightSelector, "#keep", "preserve unselected direction");
assert.equal(prev.style.outline, undefined, "restore highlight");
panel = start(); ({ selects, buttons } = controls(panel));
selects[0].value = ""; selects[1].value = "1";
buttons[3].handlers.click();
assert.equal(stored.mappings[0].rightSelector, "#keep", "cancel does not save");
panel = start(); ({ selects, buttons } = controls(panel));
selects[0].value = ""; selects[1].value = "1";
next2.isConnected = false;
buttons[2].handlers.click();
assert.equal(stored.mappings[0].rightSelector, "#keep", "stale candidate not saved");
nodes.length = 0;
panel = start();
assert(panel.children.some(node => node.textContent.includes("候補が見つかりません")), "empty result offers manual fallback");
console.log("自動検出、複数候補、強調、上書き確認、片側保持とキャンセルを検証しました。");
