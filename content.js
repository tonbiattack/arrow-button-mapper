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
  let contextTarget = null;
  let detection = null;

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
    if (isEditableTarget(event)) return null;
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
    window.removeEventListener("mouseover", handleRecordingHover, true);
    clearHighlight();
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
  function saveRecordedOperation(direction, selector, done, urlPattern = currentUrlPattern(), confirmOverwrite = false) {
    const updates = typeof direction === "object" ? direction : { [direction === "left" ? "leftSelector" : "rightSelector"]: selector };

    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      if (chrome.runtime.lastError) {
        showStorageSaveError();
        done?.(false);
        return;
      }

      // タブ内キャッシュではなく保存済みの最新値を基準にし、左右の片側だけを更新する。
      const mappings = normalizeMappings(stored.mappings);
      let mapping = mappings.find((item) => item.urlPattern === urlPattern);
      if (confirmOverwrite && mapping && Object.keys(updates).some((key) => mapping[key] && mapping[key] !== updates[key]) &&
          !window.confirm("この URL の登録済み設定を変更します。選択した方向を上書きしますか？")) {
        done?.(false);
        return;
      }
      if (!mapping) {
        mapping = { id: createId(), urlPattern, leftSelector: "", rightSelector: "" };
        mappings.push(mapping);
      }
      Object.assign(mapping, updates);

      chrome.storage.sync.set({ mappings }, () => {
        if (chrome.runtime.lastError) {
          showStorageSaveError();
          done?.(false);
          return;
        }
        const keyLabel = typeof direction === "object" ? "選択した操作" : direction === "left" ? "←" : "→";
        showNotice(`${keyLabel} に登録しました。必要に応じてポップアップから編集できます。`);
        done?.(true);
      });
    });
  }

  function handleRecordedClick(event) {
    if (!recorder) return;
    if (event.composedPath?.().includes(recorder.overlay)) return;
    if (recorder.saving || recorder.step === "confirm") {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const target = getRecordableTarget(event);
    if (!target) {
      if (recorder.direction !== "both") {
        recorder.overlay.remove();
        recorder.overlay = createOverlay("リンクまたはボタンをクリックしてください。Esc で中止できます。");
      }
      return;
    }

    // 既定のリンク遷移と、この時点より後のクリック処理を抑止する。
    // ただし、このリスナーより先に実行済みのページ側処理の副作用は取り消せない。
    event.preventDefault();
    event.stopImmediatePropagation();

    const { direction } = recorder;
    const selector = buildSelector(target);

    if (!selector) {
      showNotice("対象要素を特定できませんでした。手入力で設定してください。");
      return;
    }
    if (direction === "both") {
      recorder.selections[recorder.step === "left" ? "leftSelector" : "rightSelector"] = selector;
      advanceRecording();
      return;
    }
    stopRecording();
    saveRecordedOperation(direction, selector);
  }

  function clearHighlight() {
    if (!recorder?.highlight) return;
    recorder.highlight.style.outline = recorder.oldOutline;
    recorder.highlight = null;
  }

  function handleRecordingHover(event) {
    if (!recorder || recorder.direction !== "both" || recorder.step === "confirm") return;
    const target = getRecordableTarget(event);
    if (target === recorder.highlight) return;
    clearHighlight();
    if (target) {
      recorder.highlight = target;
      recorder.oldOutline = target.style.outline;
      target.style.outline = "3px solid #3284ff";
    }
  }

  function renderBatchGuide(message) {
    recorder.overlay?.remove();
    const overlay = document.createElement("div");
    overlay.setAttribute("data-arrow-button-mapper-overlay", "");
    overlay.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
    const shadow = overlay.attachShadow({ mode: "closed" });
    const panel = document.createElement("div");
    panel.style.cssText = "max-width:360px;padding:14px;border-radius:10px;background:#10233f;color:white;font:14px/1.5 system-ui;box-shadow:0 10px 30px #0005";
    const text = document.createElement("p");
    text.textContent = message || (recorder.step === "left" ? "① 戻るボタンをクリック → ② 進むボタンをクリック" : recorder.step === "right" ? "① 完了 → ② 進むボタンをクリック" : `確認: ← ${recorder.selections.leftSelector || "スキップ"} / → ${recorder.selections.rightSelector || "スキップ"}`);
    panel.append(text);
    const addButton = (label, action) => {
      const button = document.createElement("button");
      button.textContent = label;
      button.type = "button";
      button.style.cssText = "margin:4px;padding:6px;cursor:pointer";
      button.addEventListener("click", action);
      panel.append(button);
    };
    if (recorder.step !== "confirm") addButton("スキップ", advanceRecording);
    if (recorder.step === "confirm") addButton("保存", saveBatch);
    addButton("やり直し", () => { recorder.selections = {}; recorder.step = "left"; renderBatchGuide(); });
    addButton("キャンセル", () => { stopRecording(); showNotice("操作の記憶を中止しました。"); });
    shadow.append(panel);
    document.documentElement.append(overlay);
    recorder.overlay = overlay;
  }

  function advanceRecording() {
    clearHighlight();
    recorder.step = recorder.step === "left" ? "right" : "confirm";
    renderBatchGuide();
    if (recorder.step === "confirm" && recorder.selections.leftSelector && recorder.selections.rightSelector) saveBatch();
  }

  function saveBatch() {
    if (!Object.keys(recorder.selections).length) {
      renderBatchGuide("少なくとも一方を選択してください。やり直し、またはキャンセルできます。");
      return;
    }
    const active = recorder;
    active.saving = true;
    saveRecordedOperation(active.selections, null, (ok) => {
      if (recorder !== active) return;
      active.saving = false;
      if (ok) stopRecording();
      else renderBatchGuide("保存に失敗しました。選択内容を確認して再試行してください。");
    }, active.urlPattern);
  }

  function handleRecordingKeydown(event) {
    if (event.key !== "Escape" || !recorder) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stopRecording();
    showNotice("操作の記憶を中止しました。");
  }

  function startRecording(direction) {
    if (direction !== "left" && direction !== "right" && direction !== "both") {
      return { ok: false, message: "記憶するキーが正しくありません。" };
    }

    stopDetection();
    stopRecording();
    const keyLabel = direction === "left" ? "←" : "→";
    recorder = {
      direction,
      step: "left", selections: {}, urlPattern: currentUrlPattern(),
      overlay: createOverlay(`${keyLabel} の操作を記憶中です。ページ上のリンクまたはボタンを 1 回クリックしてください。Esc で中止できます。`)
    };
    if (direction === "both") {
      renderBatchGuide();
      window.addEventListener("mouseover", handleRecordingHover, true);
    }
    // ページ側のクリック処理より先に捕捉するため、キャプチャ段階で一時的に監視する。
    window.addEventListener("click", handleRecordedClick, { capture: true, passive: false });
    window.addEventListener("keydown", handleRecordingKeydown, { capture: true, passive: false });
    return { ok: true };
  }

  // 明示的な操作時だけ一度走査し、曖昧な汎用語や非表示・広告の候補は除外する。
  function detectCandidates() {
    const candidates = { left: [], right: [] };
    const nodes = document.querySelectorAll(RECORDABLE_SELECTOR);
    const patterns = {
      left: /^(?:previous(?: page)?|prev(?: page)?|back|前へ|前のページ|前ページ|戻る|←|‹|«)$/i,
      right: /^(?:next(?: page)?|forward|次へ|次のページ|次ページ|進む|→|›|»)$/i
    };
    for (let i = 0; i < Math.min(nodes.length, 2000); i++) {
      const element = nodes[i];
      if (element.disabled || element.getAttribute("aria-disabled") === "true" ||
          element.closest("[hidden], [inert], [aria-hidden='true'], [contenteditable='true'], [role='advertisement'], aside, [class~='ad'], [class~='ads']") ||
          !element.getClientRects().length) continue;
      const style = window.getComputedStyle(element);
      if (style.visibility !== "visible" || style.display === "none") continue;
      const rel = (element.getAttribute("rel") || "").toLowerCase().split(/\s+/);
      const imageAlt = element.querySelector("img[alt]")?.getAttribute("alt") || "";
      const signals = [
        ["aria-label", element.getAttribute("aria-label")], ["title", element.getAttribute("title")],
        ["alt", element.getAttribute("alt") || imageAlt], ["表示テキスト", element.innerText]
      ];
      for (const direction of ["left", "right"]) {
        const relMatch = rel.includes(direction === "left" ? "prev" : "next");
        const signal = signals.find(([, value]) => value && patterns[direction].test(value.trim().replace(/\s+/g, " ")));
        if (!relMatch && !signal) continue;
        const label = (element.getAttribute("aria-label") || element.getAttribute("title") || imageAlt || element.innerText || (direction === "left" ? "前へ" : "次へ")).trim().replace(/\s+/g, " ").slice(0, 80);
        candidates[direction].push({ element, label, reason: relMatch ? `rel=${direction === "left" ? "prev" : "next"}` : signal[0], score: relMatch ? 3 : signal[0] === "表示テキスト" ? 1 : 2 });
      }
    }
    for (const direction of ["left", "right"]) candidates[direction].sort((a, b) => b.score - a.score);
    return candidates;
  }

  function stopDetection() {
    if (!detection) return;
    if (detection.highlight) detection.highlight.style.outline = detection.oldOutline;
    detection.overlay.remove();
    detection = null;
  }

  function startDetection() {
    stopRecording();
    stopDetection();
    const candidates = detectCandidates();
    const host = document.createElement("div");
    host.setAttribute("data-arrow-button-mapper-overlay", "");
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "closed" });
    const panel = document.createElement("div");
    panel.style.cssText = "width:340px;max-width:90vw;max-height:80vh;overflow:auto;padding:16px;border:1px solid #7db4ff;border-radius:10px;background:#10233f;color:white;font:14px/1.5 system-ui;box-shadow:0 10px 30px #0005";
    const title = document.createElement("strong");
    title.textContent = "戻る・進むの候補を確認";
    panel.append(title);
    const status = document.createElement("p");
    status.textContent = candidates.left.length || candidates.right.length ? "登録する候補を選んでください。複数候補は選択が必要です。" : "候補が見つかりません。ポップアップのまとめて登録または手入力をご利用ください。";
    panel.append(status);
    const selects = {};
    for (const direction of ["left", "right"]) {
      const label = document.createElement("label");
      label.textContent = direction === "left" ? "← 戻る" : "→ 進む";
      label.style.cssText = "display:block;margin:10px 0 4px";
      const select = document.createElement("select");
      select.style.cssText = "display:block;width:100%;padding:6px;margin:4px 0";
      const none = document.createElement("option");
      none.value = "";
      none.textContent = "登録しない";
      select.append(none);
      candidates[direction].forEach((candidate, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `${candidate.label}（${candidate.reason}・${candidate.score === 3 ? "高" : candidate.score === 2 ? "中" : "参考"}）`;
        select.append(option);
      });
      if (candidates[direction].length === 1) select.value = "0";
      selects[direction] = select;
      label.append(select);
      panel.append(label);
      const highlight = document.createElement("button");
      highlight.textContent = "選択した候補を強調";
      highlight.type = "button";
      highlight.addEventListener("click", () => {
        if (detection.highlight) detection.highlight.style.outline = detection.oldOutline;
        detection.highlight = null;
        const candidate = select.value === "" ? null : candidates[direction][Number(select.value)];
        if (!candidate?.element.isConnected) { status.textContent = "候補を選択するか、再検出してください。"; return; }
        detection.highlight = candidate.element;
        detection.oldOutline = candidate.element.style.outline;
        candidate.element.style.outline = "3px solid #3284ff";
        candidate.element.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      panel.append(highlight);
    }
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "このサイトに適用";
    apply.style.cssText = "margin:12px 8px 0 0;padding:7px";
    apply.addEventListener("click", () => {
      const active = detection;
      if (!active || active.saving) return;
      if (active.url !== currentUrlPattern()) { status.textContent = "ページが変わりました。自動検出をやり直してください。"; return; }
      const updates = {};
      for (const direction of ["left", "right"]) {
        const value = selects[direction].value;
        if (value === "") continue;
        const element = candidates[direction][Number(value)]?.element;
        if (!element?.isConnected || !element.getClientRects().length || element.disabled || element.getAttribute("aria-disabled") === "true") { status.textContent = "候補が変更されました。自動検出をやり直してください。"; return; }
        const selector = buildSelector(element);
        if (!selector || !isUniqueSelector(selector, element)) { status.textContent = "候補を一意に特定できません。手動で登録してください。"; return; }
        updates[direction === "left" ? "leftSelector" : "rightSelector"] = selector;
      }
      if (!Object.keys(updates).length) { status.textContent = "少なくとも一つ候補を選んでください。"; return; }
      active.saving = true;
      saveRecordedOperation(updates, null, (ok) => {
        if (detection !== active) return;
        active.saving = false;
        if (ok) stopDetection();
        else status.textContent = "保存されていません。選択内容を確認してください。";
      }, active.url, true);
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "キャンセル";
    cancel.addEventListener("click", stopDetection);
    panel.append(apply, cancel);
    shadow.append(panel);
    document.documentElement.append(host);
    detection = { overlay: host, url: currentUrlPattern(), highlight: null, saving: false };
    return { ok: true };
  }

  // 録画開始後にポップアップは閉じるため、対象クリック以降の処理はページ側で完結させる。
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "startRecording") sendResponse(startRecording(message.direction));
    if (message?.type === "detectNavigation") sendResponse(startDetection());
    if (message?.type === "registerContextTarget") {
      const candidate = contextTarget;
      contextTarget = null;
      if (!candidate || Date.now() - candidate.time > 30000 || candidate.url !== window.location.href || !candidate.element.isConnected || !["left", "right"].includes(message.direction)) {
        showNotice("右クリックした対象を特定できませんでした。もう一度お試しください。");
        sendResponse({ ok: false });
        return;
      }
      const selector = buildSelector(candidate.element);
      if (!selector || !isUniqueSelector(selector, candidate.element)) {
        showNotice("右クリックした対象を特定できませんでした。");
        sendResponse({ ok: false });
        return;
      }
      saveRecordedOperation(message.direction, selector);
      sendResponse({ ok: true });
    }
  });

  window.addEventListener("contextmenu", (event) => {
    const element = getRecordableTarget(event);
    contextTarget = element ? { element, time: Date.now(), url: window.location.href } : null;
  }, true);

  // document_start かつキャプチャ段階で登録し、ページ側の後続キー処理より先に評価する。
  window.addEventListener("keydown", handleKeydown, { capture: true, passive: false });
  loadSettings();
})();
