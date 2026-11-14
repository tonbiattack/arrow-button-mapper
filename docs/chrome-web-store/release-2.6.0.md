# 英語対応リリース（2.6.0 / #20）

2.5.1 の再審査とは分けた次回更新です。Chrome の UI 言語が日本語なら日本語、それ以外なら英語を表示します。ページ自体の言語や既存設定は変更しません。手動の言語選択 UI はありません。

## 変更内容

```text
・Chrome の言語設定に応じた日本語・英語表示に対応しました。
・ポップアップ、右クリックメニュー、記録ガイド、通知、確認ダイアログを翻訳しました。
```

English release notes:

```text
Added English and Japanese UI based on your Chrome language, including the popup, context menus, recording guides, notifications, and confirmation dialogs.
```

## ストア掲載

- 英語の概要: `dashboard/en/item-summary.txt`
- 英語の詳細説明: `dashboard/en/detailed-description.md`
- ダッシュボードで英語の言語別掲載を追加し、上記の内容を貼り付けます。日本語掲載は維持してください。Chrome Web Store の掲載言語は `chrome.i18n` とは別に設定します。
- 英語の画像は英語 UI の実機キャプチャを使用してください。撮影方法は `screenshots.md` を参照。日本語画像を英語画像として加工しないでください。
- 権限は 2.5.1 と同じ `storage` と `contextMenus` です。新しいデータ収集・外部通信はありません。

## ZIP の作成

```powershell
powershell -NoProfile -File scripts/package-extension.ps1
```

既定の出力は `C:\Users\teni2\AppData\Local\Temp\opencode\arrow-button-mapper-2.6.0.zip` です。同名ファイルがある場合は上書きせず停止します。スクリプトは `_locales/en/messages.json`、`_locales/ja/messages.json` と `popup-localize.js` も含めます。従来の手動ファイル指定で ZIP を作るとこれらが欠けるため、このスクリプトを使用してください。

## 検証

`npm test` は日本語と英語で既存の記録・設定移行テストを実行し、翻訳漏れ、日英のキー・置換値の一致、ポップアップの翻訳と右クリックメニューを確認します。

ブラウザーでは本物の HTML / CSS / JS を通常ページとして表示し、Chrome API をモックしたプレビューで、英語 UI の横幅 410px の配置と保存・編集の表示を確認しました。拡張機能としての Chrome ネイティブ API と言語切り替えの実機確認、および英語の実機スクリーンショット撮影は別途必要です。

実機では Chrome の UI 言語を変更・再起動した後、拡張機能を読み込み直してください。ページの表示言語や DevTools の表示言語を変更するだけでは切り替わりません。非対応言語での英語フォールバック、記録と保存、Esc、失敗通知、上書き確認・インポート確認も確認してください。
