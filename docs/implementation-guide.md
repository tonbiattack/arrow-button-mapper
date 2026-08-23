# Arrow Button Mapper の実装を読むためのガイド

この文書は、Arrow Button Mapper のコードを自分で追えるようになることを目的に、処理の入口から保存・テストまでを実装順に説明します。利用方法は [README](../README.md) を参照してください。

## 最初に見る順序

次の順に読むと、ファイル間の役割を迷わず追えます。

1. `manifest.json` で、どのページに `content.js` を注入するかを確認します。
2. `popup.html` と `popup.js` で、設定画面と録画開始の入口を確認します。
3. `content.js` で、矢印キー処理とクリック記憶の本体を追います。
4. `verify-*.js` で、重要な振る舞いをどのように確認しているかを読みます。

```text
ポップアップ
  │ 録画開始メッセージ
  ▼
content.js ── 対象クリックを監視 ──► chrome.storage.sync
  │
  └─ ← / → キー ──► 保存済みセレクタで要素を click()
```

## `manifest.json`: 実行される場所を決める

`content_scripts.matches` は `http://*/*` と `https://*/*` です。そのため、通常の Web ページのトップレベルフレームで `content.js` が動きます。`chrome://`、Chrome Web Store、iframe 内の要素は対象にしません。

`run_at` は `document_start` です。ページ側の後続処理より先にキーイベントを判定できるようにしています。ただし、登録済みのすべてのページ操作を奪うわけではなく、後述する条件を満たしたときだけ止めます。

## `popup.js`: 設定画面と録画の開始だけを担当する

ポップアップは、URL 条件と左右の CSS セレクタを編集し、`chrome.storage.sync` に保存します。また、設定の JSON エクスポート・インポートを提供します。

録画ボタンを押すと、現在のタブへ `startRecording` メッセージを送ります。ページ側が録画を開始できたと応答してから `window.close()` を呼ぶため、次のクリックをそのまま記憶対象に使えます。

保存処理では、画面上の `state` を先に変更しません。`chrome.storage.sync.set()` が成功した後にだけ `state` と一覧を更新します。保存失敗時に、画面やエクスポート内容だけが未保存の値になることを防ぐためです。同じ考え方で、有効・無効トグルも保存に失敗した場合は直前の保存済み状態に戻します。

## `content.js`: ページ上で動く本体

### 1. 設定を読み込み、変更を反映する

`loadSettings()` が `chrome.storage.sync` から `enabled` と `mappings` を読み込みます。`chrome.storage.onChanged` も監視しているため、ポップアップや別タブで設定を変更しても、現在のページを再読み込みせずに反映できます。

各 mapping は次の形です。

```js
{
  id: "...",
  urlPattern: "https://reader.example.com/book/",
  leftSelector: "button.previous",
  rightSelector: "button.next"
}
```

### 2. 矢印キーで最も具体的な URL 条件を選ぶ

`handleKeydown()` が `ArrowLeft` と `ArrowRight` を受け取ります。入力欄、IME 入力中、Ctrl・Meta・Alt との組み合わせ、すでにキャンセルされたイベントでは何もしません。

`findBestMapping()` は URL に一致する mapping のうち、固定部分が長いものを優先します。これにより、サイト全体向けの設定と `/book/42/` のような個別設定を併用できます。`*` は任意文字列として扱いますが、条件は常に URL の先頭から照合します。

選ばれたセレクタが実際にクリック可能な要素へ一致したときだけ、`clickSelector()` が `HTMLElement.click()` を呼び、元のキーイベントを `preventDefault()` します。要素がない、無効、または CSS セレクタが不正な場合は、ページ本来のキー操作を残します。

### 3. クリックを記憶する

`startRecording()` は、一時的なクリックリスナーをキャプチャ段階で登録します。クリックされた子要素から `closest()` でリンクまたはボタンまでたどり、`buildSelector()` で CSS セレクタを作ります。

記憶中のクリックでは、リンク遷移を防ぐために `preventDefault()` と `stopImmediatePropagation()` を呼びます。セレクタが作れたら `saveRecordedOperation()` が現在のオリジンとパス、左右どちらかのセレクタを保存します。同じ URL 条件の設定があれば、反対側のセレクタを残したまま選んだ方向だけを更新します。

## `buildSelector()`: 壊れにくい候補から試す

`buildSelector()` は候補がページ内で対象要素だけに一意に一致することを確認してから採用します。試す順序は次のとおりです。

|順序|候補|ねらい|
|---:|---|---|
|1|`id`|意味が明確で、通常は一意です。|
|2|`data-testid`、`data-test`、`data-qa`、`data-cy`、`aria-label`、`name`|役割を表す属性を優先します。|
|3|既知のページング query を除いた `href` の固定部分|ページ番号が変わっても使える候補にします。|
|4|完全な `href`|固定 URL のリンクに使います。|
|5|`nth-of-type()` を含む DOM 階層|安定した属性がない場合の最後の手段です。|

ページングでは `page`、`p`、`offset`、`cursor` だけを動的な query とみなします。未知の URL 規則や複雑な DOM を万能に推測しようとはせず、候補が一意でなければ次の候補へ進みます。生成結果はポップアップから手編集できます。

## テストを読む

依存パッケージは不要です。リポジトリ直下で次を実行します。

```bash
npm test
```

|スクリプト|読むと分かること|
|---|---|
|`verify-content.js`|URL の前方一致と優先順位、入力欄の保護、クリック成功時だけキーイベントを止める条件|
|`verify-recording.js`|クリック記憶が遷移を止め、ページ番号に依存しない selector を保存する流れ|
|`verify-popup.js`|録画開始後のポップアップ終了、設定移行、保存失敗時に UI 状態を保つ処理|

これらは Node.js の VM と DOM モックを使った自動テストです。実際のサイトでは、Shadow DOM、SPA の画面遷移、ポインターイベントを要求する部品などが異なるため、拡張機能を再読み込みしたうえで代表サイトの手動確認も行います。

## 次に試す変更

理解を深めるには、小さな変更を加えてテストを読むのがおすすめです。

1. `isEditableTarget()` に扱いたい ARIA ロールを追加し、矢印キーが奪われないことをテストします。
2. `buildSelector()` の候補順を一時的に変え、`verify-recording.js` が守っている動的ページングの条件を確認します。
3. `saveSettings()` の成功処理を先に動かしてみて、`verify-popup.js` の保存失敗ケースがなぜ必要かを確認します。

変更後は必ず `npm test` を実行してください。
