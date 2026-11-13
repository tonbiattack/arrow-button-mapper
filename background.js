"use strict";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "arrow-mapper", title: "Arrow Button Mapper", contexts: ["all"], documentUrlPatterns: ["http://*/*", "https://*/*"] });
  chrome.contextMenus.create({ id: "arrow-left", parentId: "arrow-mapper", title: "戻る（←）に登録", contexts: ["all"] });
  chrome.contextMenus.create({ id: "arrow-right", parentId: "arrow-mapper", title: "進む（→）に登録", contexts: ["all"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const direction = info.menuItemId === "arrow-left" ? "left" : info.menuItemId === "arrow-right" ? "right" : null;
  if (!direction || !tab?.id || (info.frameId ?? 0) !== 0) return;
  chrome.tabs.sendMessage(tab.id, { type: "registerContextTarget", direction }, { frameId: 0 }, () => {
    // 制限ページや再読み込み前のページには content script が存在しない。
    void chrome.runtime.lastError;
  });
});
