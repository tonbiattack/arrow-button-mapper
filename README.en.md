# Arrow Button Mapper

Map links and buttons on web pages to the left and right arrow keys. Useful for previous/next navigation in readers, galleries, and search results.

The extension follows your Chrome UI language: Japanese for Japanese, English for other languages. You can map elements on pages in any language. Existing settings work in either UI language.

## Install from source

1. Download or clone this repository.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Reload any pages that were open before loading the extension.

## Record actions

Open the extension popup and choose **Record Back and Next**. Click the page's previous button, then its next button. Recording prevents those clicks from activating their normal actions. You can skip a direction, start over, or cancel with Esc. If saving fails, retry from the guide.

You can also record one direction at a time, or right-click a link or button and choose **Arrow Button Mapper → Assign to Back (←)** or **Assign to Next (→)**.

Automatic recording saves a URL pattern made from the page's origin and path, without the query string or fragment. Recording one direction preserves the other direction's setting for that URL pattern.

## Manual settings

Enter a URL pattern and at least one CSS selector in the popup. URL patterns use prefix matching; `*` inside a pattern matches any text. When multiple patterns match, the most specific one wins.

Each selector should uniquely identify the intended element. A website redesign may require recording the element again. Restricted pages and iframe contents are not supported. Arrow keys retain their normal behavior in input fields and editable areas.

These are page element mappings, not browser-history Back and Forward commands.

## Privacy and settings

Settings use Chrome sync storage. The developer does not receive your page contents, browsing history, or settings. Export and import settings as JSON from the popup; importing replaces the current settings after confirmation.

Permissions: `storage` for settings and `contextMenus` for right-click registration. Content scripts run in the top frame of HTTP / HTTPS pages to record and trigger mapped elements. No `tabs` permission or external AI service is used.

## Development

Run `npm test` with Node.js. The tests check English and Japanese catalogs, placeholders, popup localization, context menus, recording, and settings transfer. They use mocked Chrome APIs and do not replace testing an unpacked extension in Chrome.

To package on Windows, run `powershell -NoProfile -File scripts/package-extension.ps1`. The ZIP includes both locale catalogs. See [release preparation](docs/chrome-web-store/release-2.6.0.md) for English store text and screenshot instructions.

Report problems via [GitHub Issues](https://github.com/tonbiattack/arrow-button-mapper/issues). Include the affected page, expected action, and Chrome version; do not include sensitive page contents or credentials.
