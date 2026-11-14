# Reviewer information — English reference

These are optional English equivalents of the existing Japanese reviewer-facing descriptions. Use them only where the Dashboard asks for the corresponding information; do not add a `tabs` permission justification.

## Single purpose

Enable users to operate links or buttons they choose on web pages using the left and right arrow keys.

## storage

Used to save URL patterns, CSS selectors for the left and right arrow keys, and the extension's enabled state in Chrome sync storage. These settings are used only to perform, edit, export, and import the page actions configured by the user.

## contextMenus

Used to let users assign a page link or button to the left or right arrow key from the extension's context menu. A selector is saved to settings only when the user chooses a registration action.

## HTTP and HTTPS page access

Used to click elements corresponding to the arrow keys on pages configured by the user and to generate CSS selectors for links or buttons the user chooses during recording or context-menu registration. Chrome internal pages, the Chrome Web Store, and iframe contents are not supported. Page contents and browsing history are not transmitted to the developer.

## Remote code

No remote code is used. All JavaScript, HTML, CSS, and images are included in the extension package. The extension does not fetch, execute, or evaluate code from an external server.
