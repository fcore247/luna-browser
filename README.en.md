# Luna Browser — English and German edition

Luna Browser 1.3.1 adds English and German interfaces, Tavily search and refreshed setup controls.

## Choose your language

The first setup screen asks **Choose your language** in English. Choose **English** or
**Deutsch** before continuing with setup. You can change your choice later under
**Settings → Appearance → Language** (German: **Einstellungen → Darstellung**).

The selection is saved on this computer. Changing language reloads Luna's shell;
open browser tabs and tab groups are carried over, even when normal session
restoration is disabled. Existing profiles continue in German until a language is
selected. The `settings` and `einstellungen` address-bar commands both work.

The application interface, setup, settings, menus, dialogs, accessibility labels,
dates, numbers and search preferences support English. Website content, extension
names, bookmarks, notes, chat messages and other user content keep their original
language. System-provided dialogs follow the operating system's language.

## Windows package

Extract the complete ZIP, then open **Luna Browser.exe**. Keep the `native`
directory beside the executable; it contains the native WebView2 host. Windows
support is experimental in the upstream project. Microsoft Edge WebView2 Runtime
must be available. This development package is unsigned.

## Source and validation

Requirements: Go 1.25+, Node.js 22+, Wails v2.16, and the native dependencies for
your platform. Windows additionally needs the .NET 8 SDK for building its host.
For macOS, build on macOS using the upstream build instructions.

```sh
cd frontend
npm ci
npx playwright install chromium
npm run check
cd ..
go test ./...
```

Windows native host:

```powershell
dotnet publish native/windows/Luna.Windows.csproj -c Release -r win-x64 --self-contained true -o build/bin/native
wails build -platform windows/amd64 -webview2 download -ldflags "-X browser-mac/internal/buildinfo.Version=1.3.1"
# Wails may clean build/bin; publish the host into the final bundle again.
dotnet publish native/windows/Luna.Windows.csproj -c Release -r win-x64 --self-contained true -o build/bin/native
```

## Translation implementation

`frontend/src/i18n.js` provides the language preference, formatting locale,
static message lookup, and an interpolation-safe template tag. The shared English
catalogue is `frontend/src/locales/en.json`; German source text is the fallback.
Translations are bundled and work offline, with no translation service at runtime.
Only authored template parts are translated. Interpolated content is preserved
verbatim, and the existing HTML escaping remains in place.

`language.go` embeds the same catalogue for the native shell. The `englishUI`
backend preference persists across restarts. Native macOS menus, macOS error pages
and cancel labels, and the Windows permission prompt use that preference.

Language coverage and regression tests are in `frontend/tests/i18n.spec.cjs`,
`language_test.go`, and `internal/search/search_test.go`. Native macOS validation
requires a Mac; a Windows build cannot verify macOS compilation or runtime behavior.
