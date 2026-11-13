# Chrome Web Store 更新用セット（2.5.0）

このファイルは入力用の案です。Dashboard に表示される項目と公開中の設定を確認してから貼り付けてください。掲載画像と拡張機能パッケージはテキストではなくファイルとしてアップロードします。

## 公開前の確認

1. ストアの現在のバージョンが **2.5.0 より小さい**ことを確認する。同じか大きい場合、`manifest.json` のバージョンを現在版より大きい番号に変更し、ZIP を作り直す。
2. `contextMenus` 権限が追加されていることと、プライバシー申告を確認する。
3. 公開中のプライバシーポリシー URL に、右クリック登録を追記した最新版が表示されることを確認する。このリポジトリのローカル変更は GitHub に反映するまで公開 URL に表示されない。
4. 画像に個人情報がないことを確認する。3 枚目には以前撮影したサンプルの `qiita.com` の URL が含まれる。不要であれば 1・2 枚目だけを使用する。

## パッケージと画像

- 拡張機能の ZIP: `C:\Users\teni2\AppData\Local\Temp\opencode\arrow-button-mapper-2.5.0.zip`
- スクリーンショット 1: `docs/chrome-web-store/assets/screenshots/1.png`
- スクリーンショット 2: `docs/chrome-web-store/assets/screenshots/2.png`
- スクリーンショット 3: `docs/chrome-web-store/assets/screenshots/3.png`（以前撮影した登録済み画面）
- マーキープロモーションタイル: `docs/chrome-web-store/assets/marquee-1400x560.png`（1400×560、24 ビット PNG）

スクリーンショットはすべて 1280×800、24 ビット PNG。左側の説明文はありません。アイコンと小さいプロモーションタイルは今回変更していないため、既存の掲載画像を維持できます。

## 概要（Item summary）

```text
Webページの「前へ」「次へ」を、サイトごとに ← / → キーへ割り当てる拡張機能です。
```

## 詳細説明（Detailed description）

[dashboard/detailed-description.md](dashboard/detailed-description.md) の本文をそのまま貼り付けてください。

## 更新内容（入力欄がある場合）

```text
・戻る・進むの対象を続けて登録できるようにしました。
・リンクやボタンの右クリックメニューから、左右キーへの登録ができるようにしました。
・操作を記憶する画面の配置を改善しました。
```

## 単一目的の説明

```text
ユーザーが指定した Web ページ上のリンクまたはボタンを、左右矢印キーで操作できるようにすること。
```

## 権限の利用目的

Dashboard に表示される権限ごとに、[dashboard/permission-justifications.md](dashboard/permission-justifications.md) の該当する段落を貼り付けてください。今回新しく追加した権限は以下です。

### contextMenus

```text
ユーザーがページ上のリンクやボタンを右クリックしたとき、拡張機能のメニューから ← または → に登録できるようにするために使用します。登録操作が選択された場合にのみ、対象のセレクタを設定として保存します。
```

## その他の確認項目

- データ利用・Limited Use: [dashboard/data-usage-checklist.md](dashboard/data-usage-checklist.md) を実際の設問と照合して選択。
- リモートコード: 使用しない。[dashboard/remote-code.md](dashboard/remote-code.md) を参照。
- サポート・プライバシーポリシー URL: [dashboard/contact-and-urls.md](dashboard/contact-and-urls.md) を参照。
- カテゴリ・言語: [dashboard/listing-settings.md](dashboard/listing-settings.md) を参照。
- ZIP や画像をアップロード後、ダッシュボードのプレビューと警告を確認し、審査に提出する。
