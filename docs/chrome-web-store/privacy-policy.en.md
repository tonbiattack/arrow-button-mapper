# Arrow Button Mapper Privacy Policy

[日本語](privacy-policy.md)

Last updated: November 14, 2026

Arrow Button Mapper (the “extension”) lets users operate links or buttons on web pages they choose using the ← and → keys.

## Information handled

The extension saves user-configured URL patterns, CSS selectors, and the enabled or disabled state in Chrome sync storage. When a user records an action or registers one through the context menu, the extension saves the current page's origin and path, along with a CSS selector generated from the selected link or button.

To support registration from the context menu, the extension temporarily keeps a reference in page memory to the candidate element right-clicked on an HTTP or HTTPS page. Keeping this candidate alone does not save it to settings. When registering an element, the extension may inspect attributes such as its ID, accessibility attributes, and link destination to identify it.

To perform configured actions, the extension processes left and right arrow-key events and configured CSS selectors on the page. It does not intercept normal arrow-key input in input fields or editable areas.

## How information is used

This information is used only to record, perform, edit, and transfer the page actions the user chooses, which is the extension's single purpose.

## Sharing and third parties

The developer does not collect, transmit to the developer, sell, or share browsing history, page contents, URL patterns, CSS selectors, or settings. The extension does not use external advertising, analytics, or tracking services.

Settings may sync between the user's own Chrome profiles through Chrome sync storage, according to the user's Chrome settings. This synchronization does not pass through a server operated by the developer.

When the user exports settings, a JSON file is created only in the location the user chooses. The extension reads only the JSON file the user selects for import.

## Contact

For privacy questions, use the contact information on the [support page](support.en.md).
