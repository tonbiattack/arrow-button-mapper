(() => {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    mappings: []
  });
  // 記憶モードで対象にできる、一般的なリンク・ボタン要素だけを候補にする。
  const RECORDABLE_SELECTOR = "a, button, input[type='button'], input[type='submit'], [role='button'], [role='link']";

  // ストレージを毎回読むのではなく、ページごとにメモリ上の設定を保持する。
  let settings = { ...DEFAULT_SETTINGS };
  // 録画中だけ方向と案内オーバーレイを保持する。null は通常のキー操作が有効な状態。
  let recorder = null;

  function createId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeMappings(value) {
    if (!Array.isArray(value)) return [];

    return value
      .filter((mapping) => mapping && typeof mapping === "object" && typeof mapping.urlPattern === "string")
      .map((mapping) => ({
        id: String(mapping.id || createId()),
        urlPattern: mapping.urlPattern.trim(),
        leftSelector: typeof mapping.leftSelector === "string" ? mapping.leftSelector.trim() : "",
        rightSelector: typeof mapping.rightSelector === "string" ? mapping.rightSelector.trim() : ""
      }))
      .filter((mapping) => mapping.urlPattern && (mapping.leftSelector || mapping.rightSelector));
  }

  function loadSettings() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      if (chrome.runtime.lastError) {
        console.warn("Arrow Button Mapper: 設定を読み込めませんでした。", chrome.runtime.lastError);
        return;
      }

      settings = {
        enabled: Boolean(stored.enabled),
        mappings: normalizeMappings(stored.mappings)
      };
    });
  }

  // ポップアップや他のタブからの変更を、再読み込みせずに現在のページへ反映する。
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;

    if (changes.enabled) {
      settings.enabled = Boolean(changes.enabled.newValue);
    }
    if (changes.mappings) {
      settings.mappings = normalizeMappings(changes.mappings.newValue);
    }
  });

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function matchesUrlPattern(url, pattern) {
    try {
      // URL 条件は前方一致とする。末尾の * は不要で、途中の * は任意文字列として使える。
      const expression = `^${pattern.split("*").map(escapeRegExp).join(".*")}`;
      return new RegExp(expression).test(url);
    } catch {
      return false;
    }
  }

  function calculateSpecificity(pattern) {
    const firstWildcard = pattern.indexOf("*");
    return {
      fixedPrefixLength: firstWildcard === -1 ? pattern.length : firstWildcard,
      fixedLength: pattern.replaceAll("*", "").length,
      wildcardCount: [...pattern].filter((character) => character === "*").length
    };
  }

  function isMoreSpecific(candidate, currentBest) {
    if (!currentBest) return true;
    if (candidate.fixedPrefixLength !== currentBest.fixedPrefixLength) {
      return candidate.fixedPrefixLength > currentBest.fixedPrefixLength;
    }
    if (candidate.fixedLength !== currentBest.fixedLength) {
      return candidate.fixedLength > currentBest.fixedLength;
    }
    return candidate.wildcardCount < currentBest.wildcardCount;
  }

  // 汎用 URL と子画面用 URL が両方一致するときは、より具体的な条件を選ぶ。
  function findBestMapping(url) {
    let bestMapping = null;
    let bestSpecificity = null;

    for (const mapping of settings.mappings) {
      if (!matchesUrlPattern(url, mapping.urlPattern)) continue;

      const specificity = calculateSpecificity(mapping.urlPattern);
      if (isMoreSpecific(specificity, bestSpecificity)) {
        bestMapping = mapping;
        bestSpecificity = specificity;
      }
    }

    return bestMapping;
  }

  // 文章編集やフォーム操作のカーソル移動は、拡張機能より常に優先する。
  function isEditableTarget(event) {
    const path = event.composedPath ? event.composedPath() : [event.target];

    return path.some((node) => {
      if (!(node instanceof Element)) return false;

      const tagName = node.tagName;
      if (node.isContentEditable || tagName === "TEXTAREA" || tagName === "SELECT") {
        return true;
      }

      if (tagName === "INPUT") {
        const type = (node.getAttribute("type") || "text").toLowerCase();
        return !["button", "hidden", "image", "reset", "submit"].includes(type);
      }

      const role = (node.getAttribute("role") || "").toLowerCase();
      return ["textbox", "combobox", "listbox", "menu", "grid", "tree", "slider", "spinbutton", "radio"].includes(role);
    });
  }

  // HTMLElement.click() は click イベントを起こすが、pointerdown・mousedown・座標を伴う操作までは再現しない。
  function clickSelector(selector) {
    if (!selector) return false;

    let target;
    try {
      target = document.querySelector(selector);
    } catch {
      console.warn("Arrow Button Mapper: CSS セレクタの書式が正しくありません。", selector);
      return false;
    }

    if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") {
      return false;
    }

    target.click();
    return true;
  }

  function handleKeydown(event) {
    if (recorder || !settings.enabled || event.defaultPrevented || event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event)) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    const mapping = findBestMapping(window.location.href);
    if (!mapping) return;

    const selector = event.key === "ArrowLeft" ? mapping.leftSelector : mapping.rightSelector;
    if (!clickSelector(selector)) return;

    // 実際に対象要素をクリックできた場合だけ、ページ側のキー処理を止める。
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function escapeCssString(value) {
    return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\A ");
  }

  function escapeCssIdentifier(value) {
    if (globalThis.CSS?.escape) return globalThis.CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  }

  function isUniqueSelector(selector, expectedElement) {
    try {
      const matches = document.querySelectorAll(selector);
      // CSS として有効なだけでは不十分で、別の「次へ」を誤操作しないため対象 1 件だけに絞る。
      return matches.length === 1 && matches[0] === expectedElement;
    } catch {
      return false;
    }
  }

  function firstUniqueSelector(candidates, element) {
    for (const candidate of candidates) {
      if (candidate && isUniqueSelector(candidate, element)) return candidate;
    }
    return "";
  }

  // page / p / offset / cursor という既知のクエリ名だけを動的なページ番号として扱う。
  // URL の変化規則を推測できないリンクは、後続の完全 href または構造セレクタへフォールバックする。
  function getDynamicHrefPrefix(href) {
    const match = href.match(/^(.*[?&](?:page|p|offset|cursor)=)[^&]+/i);
    return match ? match[1] : "";
  }

  function getNavigationScope(element) {
    const navigation = element.closest?.("nav, [role='navigation']");
    if (!navigation) return "";
    if (navigation.id) return `#${escapeCssIdentifier(navigation.id)}`;
    return navigation.tagName.toLowerCase();
  }

  // 安定した属性がない場合だけ、要素階層と同種要素の位置を使う最後の候補を作る。
  function buildStructuralSelector(element) {
    const segments = [];
    let node = element;

    while (node instanceof Element && node !== document.documentElement) {
      const tag = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (!parent) break;

      const sameTagSiblings = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
      const position = sameTagSiblings.indexOf(node) + 1;
      const segment = sameTagSiblings.length > 1 ? `${tag}:nth-of-type(${position})` : tag;
      segments.unshift(segment);

      const candidate = segments.join(" > ");
      if (isUniqueSelector(candidate, element)) return candidate;
      node = parent;
    }

    return segments.join(" > ");
  }

  // セレクタは、ID・意味のある属性・動的 href・完全 href・構造の順に安定性を優先する。
  function buildSelector(element) {
    const tag = element.tagName.toLowerCase();
    const candidates = [];

    if (element.id) {
      candidates.push(`#${escapeCssIdentifier(element.id)}`);
    }

    for (const attribute of ["data-testid", "data-test", "data-qa", "data-cy", "aria-label", "name"]) {
      const value = element.getAttribute(attribute);
      if (value) {
        candidates.push(`${tag}[${attribute}="${escapeCssString(value)}"]`);
      }
    }

    if (tag === "a") {
      const href = element.getAttribute("href");
      if (href && !href.startsWith("javascript:")) {
        const prefix = getDynamicHrefPrefix(href);
        if (prefix) {
          // ページ番号のように変化する値より、固定 prefix とページネーション内の位置を優先する。
          const hrefPrefixSelector = `a[href^="${escapeCssString(prefix)}"]`;
          const navigationScope = getNavigationScope(element);
          if (navigationScope) {
            candidates.push(`${navigationScope} ${hrefPrefixSelector}:first-child`);
            candidates.push(`${navigationScope} ${hrefPrefixSelector}:last-child`);
          }
          candidates.push(hrefPrefixSelector);
        }
        candidates.push(`a[href="${escapeCssString(href)}"]`);
      }
    }

    const unique = firstUniqueSelector(candidates, element);
    return unique || buildStructuralSelector(element);
  }

  function getRecordableTarget(event) {
    const path = event.composedPath ? event.composedPath() : [event.target];
    const originalTarget = path.find((node) => node instanceof Element) || event.target;
    if (!(originalTarget instanceof Element)) return null;
    return originalTarget.closest(RECORDABLE_SELECTOR);
  }

  function currentUrlPattern() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  // ページの CSS と衝突しないよう、案内 UI は閉じた Shadow DOM に隔離する。
  function createOverlay(text) {
    const host = document.createElement("div");
    host.setAttribute("data-arrow-button-mapper-overlay", "");
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "closed" });
    const panel = document.createElement("div");
    panel.textContent = text;
    panel.style.cssText = "max-width:320px;padding:12px 14px;border:1px solid #7db4ff;border-radius:10px;background:#10233f;color:#fff;font:600 14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);";
    shadow.append(panel);
    document.documentElement.append(host);
    return host;
  }

  function showNotice(text) {
    const host = createOverlay(text);
    window.setTimeout(() => host.remove(), 3800);
  }

  function stopRecording() {
    if (!recorder) return;
    window.removeEventListener("click", handleRecordedClick, true);
    window.removeEventListener("keydown", handleRecordingKeydown, true);
    recorder.overlay.remove();
    recorder = null;
  }

  function showStorageSaveError() {
    const detail = chrome.runtime.lastError?.message || "";
    if (/quota|bytes|maximum write/i.test(detail)) {
      showNotice("設定の保存容量を超えました。不要な操作ペアを削除するか、設定をエクスポートして整理してください。");
      return;
    }
    showNotice("設定を保存できませんでした。もう一度お試しください。");
  }

  // 同じ URL 条件は 1 件に統合し、今回選んだ左右どちらかの値だけを更新する。
  function saveRecordedOperation(direction, selector) {
    const urlPattern = currentUrlPattern();
    const selectorKey = direction === "left" ? "leftSelector" : "rightSelector";

    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      if (chrome.runtime.lastError) {
        showStorageSaveError();
        return;
      }

      // タブ内キャッシュではなく保存済みの最新値を基準にし、左右の片側だけを更新する。
      const mappings = normalizeMappings(stored.mappings);
      let mapping = mappings.find((item) => item.urlPattern === urlPattern);
      if (!mapping) {
        mapping = { id: createId(), urlPattern, leftSelector: "", rightSelector: "" };
        mappings.push(mapping);
      }
      mapping[selectorKey] = selector;

      chrome.storage.sync.set({ mappings }, () => {
        if (chrome.runtime.lastError) {
          showStorageSaveError();
          return;
        }
        const keyLabel = direction === "left" ? "←" : "→";
        showNotice(`${keyLabel} の操作を記憶しました。必要に応じてポップアップから編集できます。`);
      });
    });
  }

  function handleRecordedClick(event) {
    if (!recorder) return;
    const target = getRecordableTarget(event);
    if (!target) {
      recorder.overlay.remove();
      recorder.overlay = createOverlay("リンクまたはボタンをクリックしてください。Esc で中止できます。");
      return;
    }

    // 既定のリンク遷移と、この時点より後のクリック処理を抑止する。
    // ただし、このリスナーより先に実行済みのページ側処理の副作用は取り消せない。
    event.preventDefault();
    event.stopImmediatePropagation();

    const { direction } = recorder;
    const selector = buildSelector(target);
    stopRecording();

    if (!selector) {
      showNotice("対象要素を特定できませんでした。手入力で設定してください。");
      return;
    }
    saveRecordedOperation(direction, selector);
  }

  function handleRecordingKeydown(event) {
    if (event.key !== "Escape" || !recorder) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stopRecording();
    showNotice("操作の記憶を中止しました。");
  }

  function startRecording(direction) {
    if (direction !== "left" && direction !== "right") {
      return { ok: false, message: "記憶するキーが正しくありません。" };
    }

    stopRecording();
    const keyLabel = direction === "left" ? "←" : "→";
    recorder = {
      direction,
      overlay: createOverlay(`${keyLabel} の操作を記憶中です。ページ上のリンクまたはボタンを 1 回クリックしてください。Esc で中止できます。`)
    };
    // ページ側のクリック処理より先に捕捉するため、キャプチャ段階で一時的に監視する。
    window.addEventListener("click", handleRecordedClick, { capture: true, passive: false });
    window.addEventListener("keydown", handleRecordingKeydown, { capture: true, passive: false });
    return { ok: true };
  }

  // 録画開始後にポップアップは閉じるため、対象クリック以降の処理はページ側で完結させる。
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "startRecording") return;
    sendResponse(startRecording(message.direction));
  });

  // document_start かつキャプチャ段階で登録し、ページ側の後続キー処理より先に評価する。
  window.addEventListener("keydown", handleKeydown, { capture: true, passive: false });
  loadSettings();
})();
