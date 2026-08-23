(() => {
  "use strict";

  const DEFAULT_SETTINGS = {
    enabled: true,
    mappings: []
  };
  // 設定ファイルの互換性を判定する識別子と、読み込み可能な上限サイズ。
  const EXPORT_FORMAT = "arrow-button-mapper";
  const EXPORT_VERSION = 1;
  const MAX_IMPORT_BYTES = 1024 * 1024;

  // 描画と編集の基準となる、現在読み込んだ操作ペアのローカル状態。
  const state = {
    enabled: true,
    mappings: []
  };

  const enabled = document.querySelector("#enabled");
  const mappingForm = document.querySelector("#mappingForm");
  const editingId = document.querySelector("#editingId");
  const urlPattern = document.querySelector("#urlPattern");
  const leftSelector = document.querySelector("#leftSelector");
  const rightSelector = document.querySelector("#rightSelector");
  const formTitle = document.querySelector("#formTitle");
  const saveButton = document.querySelector("#saveButton");
  const cancelButton = document.querySelector("#cancelButton");
  const formMessage = document.querySelector("#formMessage");
  const mappingList = document.querySelector("#mappingList");
  const mappingCount = document.querySelector("#mappingCount");
  const exportButton = document.querySelector("#exportButton");
  const importInput = document.querySelector("#importInput");
  const transferMessage = document.querySelector("#transferMessage");
  const recordLeftButton = document.querySelector("#recordLeftButton");
  const recordRightButton = document.querySelector("#recordRightButton");
  const recordMessage = document.querySelector("#recordMessage");

  function createId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  // ストレージやインポート JSON から取得した値を、安全に扱える操作ペアだけへ絞り込む。
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

  function setMessage(message, type = "") {
    formMessage.textContent = message;
    formMessage.className = `message ${type}`.trim();
  }

  function setTransferMessage(message, type = "") {
    transferMessage.textContent = message;
    transferMessage.className = `message ${type}`.trim();
  }

  function setRecordMessage(message, type = "") {
    recordMessage.textContent = message;
    recordMessage.className = `message ${type}`.trim();
  }

  function isValidUrlPattern(value) {
    return /^(https?|\*):\/\/\S+$/.test(value) && !/\s/.test(value);
  }

  function isValidSelector(value) {
    if (!value) return true;
    try {
      document.querySelector(value);
      return true;
    } catch {
      return false;
    }
  }

  // 保存失敗時の表示を一箇所に集約し、フォームとインポートの両方から再利用する。
  function saveSettings(partialSettings, onSaved, onError) {
    chrome.storage.sync.set(partialSettings, () => {
      if (chrome.runtime.lastError) {
        const message = "設定を保存できませんでした。もう一度お試しください。";
        if (onError) {
          onError(message);
        } else {
          setMessage(message, "error");
        }
        console.error("Arrow Button Mapper: 設定を保存できませんでした。", chrome.runtime.lastError);
        return;
      }
      onSaved?.();
    });
  }

  function saveMappings(mappings, message) {
    saveSettings({ mappings }, () => {
      // 保存成功前に state を変えると、失敗時の画面表示やエクスポートだけが未保存の値になる。
      state.mappings = mappings;
      renderMappingList();
      resetForm();
      setMessage(message, "success");
    });
  }

  function resetForm() {
    mappingForm.reset();
    editingId.value = "";
    formTitle.textContent = "新しい操作ペア";
    saveButton.textContent = "操作ペアを保存";
    cancelButton.hidden = true;
  }

  function beginEdit(id) {
    const mapping = state.mappings.find((item) => item.id === id);
    if (!mapping) return;

    editingId.value = mapping.id;
    urlPattern.value = mapping.urlPattern;
    leftSelector.value = mapping.leftSelector;
    rightSelector.value = mapping.rightSelector;
    formTitle.textContent = "操作ペアを編集";
    saveButton.textContent = "変更を保存";
    cancelButton.hidden = false;
    setMessage("");
    urlPattern.focus();
  }

  function renderSelector(label, selector) {
    const item = document.createElement("p");
    item.className = "mapping-selector";

    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    const code = document.createElement("code");
    code.textContent = selector || "未設定";

    item.append(strong, code);
    return item;
  }

  function renderMappingList() {
    mappingList.replaceChildren();
    mappingCount.textContent = String(state.mappings.length);

    if (state.mappings.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "登録済みの操作ペアはありません。";
      mappingList.append(empty);
      return;
    }

    for (const mapping of state.mappings) {
      const card = document.createElement("article");
      card.className = "mapping-card";

      const pattern = document.createElement("p");
      pattern.className = "mapping-pattern";
      const patternCode = document.createElement("code");
      patternCode.textContent = mapping.urlPattern;
      pattern.append(patternCode);

      const controls = document.createElement("div");
      controls.className = "mapping-controls";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.dataset.action = "edit";
      editButton.dataset.id = mapping.id;
      editButton.textContent = "編集";

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "danger";
      deleteButton.dataset.action = "delete";
      deleteButton.dataset.id = mapping.id;
      deleteButton.textContent = "削除";

      controls.append(editButton, deleteButton);
      card.append(pattern, renderSelector("←", mapping.leftSelector), renderSelector("→", mapping.rightSelector), controls);
      mappingList.append(card);
    }
  }

  // 対象のクリックはコンテンツスクリプトで捕捉する。ポップアップは開始要求だけを現在のタブへ送る。
  function startRecording(direction) {
    setRecordMessage("");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      if (chrome.runtime.lastError || !tab?.id) {
        setRecordMessage("現在のページを取得できませんでした。", "error");
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: "startRecording", direction }, (response) => {
        if (chrome.runtime.lastError) {
          setRecordMessage("このページでは記憶を開始できません。対象ページを再読み込みしてからお試しください。", "error");
          return;
        }
        if (!response?.ok) {
          setRecordMessage(response?.message || "記憶を開始できませんでした。", "error");
          return;
        }

        const keyLabel = direction === "left" ? "←" : "→";
        setRecordMessage(`${keyLabel} の操作を記憶中です。ページ上の対象を 1 回クリックしてください。`, "success");
        // ページ側が監視を開始できたことを確認してから閉じる。失敗時はポップアップを残して理由を表示する。
        window.close();
      });
    });
  }

  // 余分な UI 状態を含めず、移行に必要な設定だけをバージョン付きで書き出す。
  function createExportPayload() {
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      settings: {
        enabled: state.enabled,
        mappings: state.mappings.map((mapping) => ({
          id: mapping.id,
          urlPattern: mapping.urlPattern,
          leftSelector: mapping.leftSelector,
          rightSelector: mapping.rightSelector
        }))
      }
    };
  }

  function exportSettings() {
    const json = `${JSON.stringify(createExportPayload(), null, 2)}\n`;
    const blob = new Blob([json], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    link.href = objectUrl;
    link.download = `arrow-button-mapper-settings-${date}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    setTransferMessage("設定ファイルをエクスポートしました。", "success");
  }

  // 同じ ID を含むファイルでも、編集・削除が衝突しないよう読み込み時に重複を解消する。
  function createUniqueId(requestedId, usedIds) {
    let id = typeof requestedId === "string" && requestedId.trim() ? requestedId.trim() : createId();
    while (usedIds.has(id)) {
      id = createId();
    }
    usedIds.add(id);
    return id;
  }

  // 保存前に JSON の形式・URL・CSS セレクタをすべて検証し、不正な設定で既存データを壊さない。
  function parseImportedSettings(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("JSON の最上位は設定オブジェクトである必要があります。");
    }
    if (payload.format && payload.format !== EXPORT_FORMAT) {
      throw new Error("このファイルは Arrow Button Mapper の設定ファイルではありません。");
    }

    const source = payload.settings && typeof payload.settings === "object" ? payload.settings : payload;
    if (!Array.isArray(source.mappings)) {
      throw new Error("操作ペアの配列が見つかりません。");
    }
    if ("enabled" in source && typeof source.enabled !== "boolean") {
      throw new Error("有効・無効の設定値が正しくありません。");
    }

    const usedIds = new Set();
    const mappings = source.mappings.map((mapping, index) => {
      if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
        throw new Error(`${index + 1} 件目の操作ペアの形式が正しくありません。`);
      }

      const pattern = typeof mapping.urlPattern === "string" ? mapping.urlPattern.trim() : "";
      const left = typeof mapping.leftSelector === "string" ? mapping.leftSelector.trim() : "";
      const right = typeof mapping.rightSelector === "string" ? mapping.rightSelector.trim() : "";

      if (!isValidUrlPattern(pattern)) {
        throw new Error(`${index + 1} 件目の URL パターンが正しくありません。`);
      }
      if (!left && !right) {
        throw new Error(`${index + 1} 件目には左右いずれかの CSS セレクタが必要です。`);
      }
      if (!isValidSelector(left) || !isValidSelector(right)) {
        throw new Error(`${index + 1} 件目の CSS セレクタの書式が正しくありません。`);
      }

      return {
        id: createUniqueId(mapping.id, usedIds),
        urlPattern: pattern,
        leftSelector: left,
        rightSelector: right
      };
    });

    return {
      enabled: "enabled" in source ? source.enabled : DEFAULT_SETTINGS.enabled,
      mappings
    };
  }

  // インポートは操作ペア全体を置き換えるため、ファイルサイズ確認とユーザー確認を先に行う。
  async function importSettings(file) {
    if (!file) return;

    try {
      if (file.size > MAX_IMPORT_BYTES) {
        throw new Error("設定ファイルが大きすぎます。1 MB 以下の JSON ファイルを選択してください。");
      }

      const text = await file.text();
      const imported = parseImportedSettings(JSON.parse(text));
      if (!window.confirm(`現在の ${state.mappings.length} 件の操作ペアを、ファイル内の ${imported.mappings.length} 件で置き換えます。続行しますか？`)) {
        setTransferMessage("インポートを取り消しました。");
        return;
      }

      saveSettings(imported, () => {
        state.enabled = imported.enabled;
        enabled.checked = imported.enabled;
        state.mappings = imported.mappings;
        renderMappingList();
        resetForm();
        setMessage("");
        setTransferMessage(`${imported.mappings.length} 件の操作ペアをインポートしました。`, "success");
      }, (message) => setTransferMessage(message, "error"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "設定ファイルを読み込めませんでした。";
      setTransferMessage(`インポートできませんでした: ${message}`, "error");
    } finally {
      importInput.value = "";
    }
  }

  enabled.addEventListener("change", () => {
    const nextEnabled = enabled.checked;
    saveSettings({ enabled: nextEnabled }, () => {
      state.enabled = nextEnabled;
    }, () => {
      enabled.checked = state.enabled;
      setMessage("設定を保存できませんでした。もう一度お試しください。", "error");
    });
  });

  mappingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const pattern = urlPattern.value.trim();
    const left = leftSelector.value.trim();
    const right = rightSelector.value.trim();

    if (!isValidUrlPattern(pattern)) {
      setMessage("URL パターンは https://、http://、または *:// で始めてください。", "error");
      urlPattern.focus();
      return;
    }

    if (!left && !right) {
      setMessage("← または → の CSS セレクタを少なくとも 1 つ入力してください。", "error");
      leftSelector.focus();
      return;
    }

    if (!isValidSelector(left) || !isValidSelector(right)) {
      setMessage("CSS セレクタの書式が正しくありません。", "error");
      return;
    }

    const id = editingId.value || createId();
    const nextMapping = { id, urlPattern: pattern, leftSelector: left, rightSelector: right };
    const index = state.mappings.findIndex((mapping) => mapping.id === id);

    const mappings = [...state.mappings];
    if (index >= 0) {
      mappings[index] = nextMapping;
      saveMappings(mappings, "操作ペアを更新しました。");
    } else {
      saveMappings([...mappings, nextMapping], "操作ペアを保存しました。");
    }
  });

  cancelButton.addEventListener("click", () => {
    resetForm();
    setMessage("");
  });

  mappingList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;
    if (action === "edit") {
      beginEdit(id);
      return;
    }

    if (action === "delete") {
      const mapping = state.mappings.find((item) => item.id === id);
      if (!mapping || !window.confirm(`「${mapping.urlPattern}」の操作ペアを削除しますか？`)) return;

      saveMappings(state.mappings.filter((item) => item.id !== id), "操作ペアを削除しました。");
    }
  });

  exportButton.addEventListener("click", exportSettings);
  importInput.addEventListener("change", () => importSettings(importInput.files[0]));
  recordLeftButton.addEventListener("click", () => startRecording("left"));
  recordRightButton.addEventListener("click", () => startRecording("right"));

  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    if (chrome.runtime.lastError) {
      setMessage("設定を読み込めませんでした。", "error");
      console.error("Arrow Button Mapper: 設定を読み込めませんでした。", chrome.runtime.lastError);
      return;
    }

    state.enabled = Boolean(settings.enabled);
    enabled.checked = state.enabled;
    state.mappings = normalizeMappings(settings.mappings);
    renderMappingList();
  });
})();
