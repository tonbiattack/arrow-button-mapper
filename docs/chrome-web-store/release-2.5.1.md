# Chrome Web Store 再提出用（2.5.1）

2.5.0 の審査で指摘された未使用の `tabs` 権限を削除しました。`chrome.tabs.query` によるアクティブタブの ID 取得と `chrome.tabs.sendMessage` は引き続き使用しますが、これらの操作に `tabs` 権限は不要です。

## パッケージ

`C:\Users\teni2\AppData\Local\Temp\opencode\arrow-button-mapper-2.5.1.zip`

ストアに登録済みのどのバージョンよりも 2.5.1 が大きいことを確認してください。

## 審査担当者への説明欄がある場合

```text
ご指摘ありがとうございます。未使用の tabs 権限を manifest.json から削除しました。残りの storage はユーザー設定の保存、contextMenus は右クリックによる登録に使用します。HTTP / HTTPS ページへのアクセスは、ユーザーが選んだ対象の記録と、登録済みの矢印キー操作を実行するために使用します。
```

## 権限の利用目的

[dashboard/permission-justifications.md](dashboard/permission-justifications.md) の `storage`、`contextMenus`、HTTP / HTTPS ページアクセスを、Dashboard に表示される項目に応じて利用してください。`tabs` の説明は不要です。

掲載文・画像・プライバシー情報は [release-2.5.0.md](release-2.5.0.md) と同じです。ただし、前回の ZIP は使わず、上記 2.5.1 の ZIP をアップロードしてください。審査ダッシュボード上の権限・データ利用申告は、現在のマニフェストと一致するよう確認してください。
