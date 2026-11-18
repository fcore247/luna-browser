# Luna Browser 1.3.7

## Deutsch

- **MCP auf dem Mac.** `browser_page` listet mit `read` eingebettete Iframes unter `frames`, auch wenn sie von einer anderen Domain stammen. Mit `frame_id` lassen sich Inhalte im ausgewählten Frame lesen, anklicken, ausfüllen, auswählen und scrollen. Passwortfelder bleiben gesperrt.

## English

- **MCP on Mac.** The `browser_page` read action lists embedded iframes in `frames`, including cross-origin frames. Use `frame_id` to read, click, fill, select, or scroll in the selected frame. Password fields remain blocked.

## Installation und Updates / Installation and updates

**macOS** · Apple Silicon, macOS 13 oder neuer. Bereits installierte Versionen erhalten das signierte Update über Sparkle. Für eine Neuinstallation den folgenden Befehl im Terminal ausführen, Luna im Finder nach **Programme** ziehen und das Terminal geöffnet lassen, bis die Installation abgeschlossen ist.

**macOS** · Apple Silicon, macOS 13 or later. Existing installations receive the signed update through Sparkle. For a new installation, run the command below in Terminal, drag Luna into **Applications** in Finder, and keep Terminal open until installation completes.

```sh
( installer=$(mktemp) && trap 'rm -f "$installer"' EXIT && curl --fail --location --proto '=https' --proto-redir '=https' https://raw.githubusercontent.com/fcore247/luna-browser/main/docs/install.sh -o "$installer" && /bin/bash "$installer" )
```

**Windows x64 bleibt experimentell.** Für eine Neuinstallation das ZIP vollständig in einen eigenen Ordner entpacken und `Luna Browser.exe` starten. Der Unterordner `native` muss daneben liegen. Bestehende Installationen prüfen die signierten Update-Metadaten. [Windows-ZIP herunterladen](https://github.com/fcore247/luna-browser/releases/download/v1.3.7/Luna-Browser-1.3.7-windows-amd64.zip)

**Windows x64 remains experimental.** For a new installation, extract the entire ZIP into its own folder and open `Luna Browser.exe`. Keep the `native` subfolder beside it. Existing installations verify the signed update metadata. [Download the Windows ZIP](https://github.com/fcore247/luna-browser/releases/download/v1.3.7/Luna-Browser-1.3.7-windows-amd64.zip)
