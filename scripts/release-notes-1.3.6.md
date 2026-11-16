# Luna Browser 1.3.6

## Deutsch

- **Vollbild auf dem Mac.** YouTube-Videos bleiben beim Öffnen und Verlassen des Vollbilds im selben Luna-Fenster. Mit Escape oder der Vollbildtaste im Player kehrst du ins Browserfenster zurück. Auch andere Webseiten können die Vollbild-API für Videos und weitere Inhalte nutzen.
- **Dauer der Sanduhr.** Unter **Einstellungen → Darstellung → Vollbild-Ladebildschirm** wählst du zwischen 0 und 60 Sekunden in Zehntelsekundenschritten. Standard ist eine Sekunde. Mit 0 schaltest du die Sanduhr aus.
- **Passwörter auf dem Mac.** Nach einer Anmeldung kannst du das Passwort direkt über der Webseite speichern oder aktualisieren. Unter **Einstellungen → Passwörter** kannst du für jede Website ein Konto für die automatische Anmeldung auswählen. Wenn Luna das Formular erkennt, bestätigst du mit Touch ID oder deinem Mac-Passwort. Bei unterstützten Anmeldungen in zwei Schritten reicht eine Bestätigung.
- **Luna Search.** Die Suche lädt sofort in der vollen Seitengröße und behält diese Größe beim Anzeigen der Ergebnisse bei.

## English

- **Fullscreen on Mac.** YouTube videos stay in the same Luna window when entering and leaving fullscreen. Press Escape or use the player’s fullscreen button to return to the browser window. Other websites can also use the Fullscreen API for video and other content.
- **Hourglass duration.** In **Settings → Appearance → Fullscreen loading screen**, choose a duration from 0 to 60 seconds in tenths of a second. The default is one second. Set it to 0 to turn the hourglass off.
- **Passwords on Mac.** After signing in, you can save or update the password directly above the page. In **Settings → Passwords**, you can select one account per website for automatic sign-in. When Luna recognizes its sign-in form, confirm with Touch ID or your Mac password. Supported two-step forms need just one confirmation.
- **Luna Search.** Search opens at its full page size while loading and keeps that size when results appear.

## Installation und Updates / Installation and updates

**macOS** · Apple Silicon, macOS 13 oder neuer. Bereits installierte Versionen erhalten das signierte Update über Sparkle. Für eine Neuinstallation den folgenden Befehl im Terminal ausführen, Luna im Finder nach **Programme** ziehen und das Terminal geöffnet lassen, bis die Installation abgeschlossen ist.

**macOS** · Apple Silicon, macOS 13 or later. Existing installations receive the signed update through Sparkle. For a new installation, run the command below in Terminal, drag Luna into **Applications** in Finder, and keep Terminal open until installation completes.

```sh
( installer=$(mktemp) && trap 'rm -f "$installer"' EXIT && curl --fail --location --proto '=https' --proto-redir '=https' https://raw.githubusercontent.com/fcore247/luna-browser/main/docs/install.sh -o "$installer" && /bin/bash "$installer" )
```

**Windows x64 bleibt experimentell.** Für eine Neuinstallation das ZIP vollständig in einen eigenen Ordner entpacken und `Luna Browser.exe` starten. Der Unterordner `native` muss daneben liegen. Bestehende Installationen prüfen die signierten Update-Metadaten. [Windows-ZIP herunterladen](https://github.com/fcore247/luna-browser/releases/download/v1.3.6/Luna-Browser-1.3.6-windows-amd64.zip)

**Windows x64 remains experimental.** For a new installation, extract the entire ZIP into its own folder and open `Luna Browser.exe`. Keep the `native` subfolder beside it. Existing installations verify the signed update metadata. [Download the Windows ZIP](https://github.com/fcore247/luna-browser/releases/download/v1.3.6/Luna-Browser-1.3.6-windows-amd64.zip)
