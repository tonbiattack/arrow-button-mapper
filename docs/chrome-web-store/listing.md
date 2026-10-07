# Chrome Web Store Developer Dashboard 入力一覧

Chrome Web Store Developer Dashboard の入力欄ごとに、貼り付ける文面と選択・確認事項を分けて管理する。公開前には、`manifest.json`、実際の拡張機能、[プライバシーポリシー](privacy-policy.md) のすべてと内容が一致することを確認する。

## テキスト入力欄

| Dashboard の入力欄 | ファイル | 備考 |
| --- | --- | --- |
| Item summary | [item-summary.txt](dashboard/item-summary.txt) | 132文字以内のプレーンテキスト |
| Detailed description | [detailed-description.md](dashboard/detailed-description.md) | Store 掲載ページの本文 |
| Single purpose description | [single-purpose.md](dashboard/single-purpose.md) | Privacy practices の審査向け説明 |
| Permissions justification | [permission-justifications.md](dashboard/permission-justifications.md) | manifest に表示された権限ごとに貼り付ける |
| Remote code | [remote-code.md](dashboard/remote-code.md) | Privacy practices の回答 |
| Support / URLs | [contact-and-urls.md](dashboard/contact-and-urls.md) | URL・問い合わせ先の入力欄 |

## 選択・アップロード項目

| Dashboard の項目 | ファイル | 確認内容 |
| --- | --- | --- |
| Data usage / Limited Use | [data-usage-checklist.md](dashboard/data-usage-checklist.md) | 選択式の設問に回答する根拠 |
| Category / language / image assets | [listing-settings.md](dashboard/listing-settings.md) | 生産性、日本語、画像ファイル |

スクリーンショットの内容とアップロード手順は [screenshots.md](screenshots.md) を参照する。ページ URL、CSS セレクタ、同期ストレージの利用はプライバシーポリシーにも記載している。
