"use strict";

const assert = require("assert");
const manifest = require("./manifest.json");

assert.deepStrictEqual([...manifest.permissions].sort(), ["contextMenus", "storage"].sort(), "不要な権限を要求しないこと");
assert.deepStrictEqual(manifest.content_scripts[0].matches, ["http://*/*", "https://*/*"], "ページアクセスの範囲を維持すること");
assert.strictEqual(manifest.content_scripts[0].all_frames, false, "トップフレームのみを対象にすること");
console.log("manifest.json の権限とページアクセス範囲を検証しました。");
