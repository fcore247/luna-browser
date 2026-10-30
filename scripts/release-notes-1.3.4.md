## Windows Installation

1. [Download Luna Browser for Windows](https://github.com/fcore247/luna-browser/releases/download/v1.3.4/Luna-Browser-1.3.4-windows-amd64.zip).
2. Extract the entire ZIP file into its own folder.
3. Open `Luna Browser.exe`. Keep the `native` subfolder beside it.
4. If Windows displays “Windows protected your PC”, click **More info**, then **Run anyway**.
5. Follow the setup steps in Luna.

To update an existing installation, close Luna first, extract the new version into a new folder, and open its `Luna Browser.exe`. Your saved settings remain in your user profile.

## macOS Installation

For Macs with Apple Silicon running macOS 13 or later:

1. Open **Terminal** (search for “Terminal” using Spotlight).
2. Copy this entire command, paste it into Terminal, and press **Return**:

```bash
installer=$(mktemp) && trap 'rm -f "$installer"' EXIT && curl --fail --location --proto '=https' --proto-redir '=https' https://raw.githubusercontent.com/fcore247/luna-browser/main/docs/install.sh -o "$installer" && /bin/bash "$installer"
```

3. In the Finder window that opens, drag **Luna Browser** into **Applications**. If Luna is already installed, quit it first and choose **Replace**.
4. Keep Terminal open until installation finishes. Luna will then start automatically.
5. Follow the setup steps in Luna.

The installer verifies the download checksum and app signature. The macOS download includes a DMG with drag-and-drop installation.

## Luna Browser 1.3.4

- Page monitoring now follows your selected language throughout its controls, status messages, errors and notifications.
- The monitoring badge in the address bar is shown only for pages with a saved monitor. Unmonitored pages stay uncluttered.
- Quick controls remain available by typing `watch`, `monitor` or `überwachen` in the address bar, including on unmonitored pages.

This update retains the saved page monitoring introduced in 1.3.3. Keep Luna open for monitoring; signed-in pages also need their authenticated tab to remain open.

**Windows remains experimental.** Extract the complete ZIP and keep the `native` folder beside `Luna Browser.exe`.

Signed automatic updates are available for macOS ARM64 and Windows x64. Both packages are built and tested together from the same release commit.

Fix commit: `008348ed34718036d01130565f96e9f625111ecd`.
