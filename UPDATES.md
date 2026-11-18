# Gemeinsame Updates: macOS und Windows

Ab dem gemeinsamen Projekt ersetzt [docs/RELEASES.md](docs/RELEASES.md) den bisherigen
Mac-only-Release-Ablauf. `scripts/release.sh RUN_ID` verarbeitet ausschließlich einen
vollständig erfolgreichen CI-Lauf für beide Plattformen und bereitet ein Draft-Release vor.
Mit `--publish` wird dieses Release nach allen Uploads gemeinsam sichtbar.
Windows ist weiterhin **experimentell / instabil**.

macOS nutzt den bestehenden Sparkle-Schlüssel; Windows prüft ein signiertes Manifest
mit demselben öffentlichen Ed25519-Schlüssel, prüft SHA-256 und Größe des ZIPs und
installiert nach bewusstem Klick auf das Update. Beide Clients nutzen dasselbe
GitHub-Latest-Release. Ein Release ist gleichzeitig verfügbar; die einzelnen Geräte
finden es bei der nächsten Prüfung (oder sofort über „Nach Updates suchen“).

Der private Schlüssel verbleibt im Schlüsselbund dieses Macs. CI erhält keine
privaten Schlüssel. Während der Testphase werden nur CI-Artefakte erzeugt; ein Push
allein veröffentlicht weiterhin **kein** Update.

## Version 1.3.7 · 18. November 2026

- Die KI-Schnittstelle (MCP) kann jetzt in eingebettete Iframes sehen und sie bedienen, auch bei fremden Ursprüngen. `browser_page` `read` listet die Frames unter `frames`; mit `frame_id` lassen sich lesen, klicken, ausfüllen, auswählen und scrollen im jeweiligen Frame. Das hilft zum Beispiel bei Lernplattformen, die ihre Inhalte in einem Iframe laden. Passwortfelder bleiben wie bisher gesperrt. Unter Windows (experimentell) ist das noch nicht verfügbar.

## Version 1.3.6 · 16. November 2026

- Auf dem Mac können Webseiten Videos und andere Elemente über die Vollbild-API öffnen. Der YouTube-Player bleibt beim Wechsel im Luna-Fenster. Beim Verlassen stellt Luna die Fenstergröße und den Tastaturfokus wieder her.
- Unter **Einstellungen → Darstellung → Vollbild-Ladebildschirm** lässt sich die Sanduhr von 0 bis 60 Sekunden einstellen. Standard ist eine Sekunde. Mit 0 lässt sich die Sanduhr abschalten.
- Nach einer Anmeldung auf dem Mac bietet Luna **Speichern**, **Aktualisieren** oder **Nicht jetzt** direkt über der Webseite an. Unter **Einstellungen → Passwörter** lässt sich pro Website ein Konto für die automatische Anmeldung wählen. Erkannte Anmeldeformulare lassen sich mit Touch ID oder dem Mac-Passwort bestätigen.
- Luna Search zeigt die Ladeansicht sofort in der Größe der Seite. Die Ergebnisse erscheinen an derselben Stelle.

Windows bleibt **experimentell / instabil**.

## Version 1.3.5 · 5. November 2026

- Luna Search im Glas-Look mit Filtern direkt in der Adressleiste.
- Brave-Bildersuche mit animierter Ladeansicht, Bildraster und Großansicht mit Pfeiltasten/Escape.
- Lokale Flip-Disk-Matrix-Uhr für Uhrzeit-Suchen, ohne Netzanfrage.
- Gemeinsamer Glas-Look und weiche Übergänge zwischen Luna-Seiten; berücksichtigt reduzierte Bewegung.
- Neues Theme Tiefnacht mit automatischem Wechsel auf Dunkel und Unterstützung in Chat, KI und MCP.
- Aktualisierte Wails-Bindings einschließlich `SearchImages`, übersetzte Bildnavigation und korrigierte Oberflächentests.

Windows bleibt **experimentell / instabil**.

## Bestehende macOS-Technik


Luna verwendet Sparkle 2.10.0 im Hauptprozess. Das Framework wird beim Build aus
seinem offiziellen Release geladen und anhand einer fest hinterlegten SHA-256
geprüft. Die Lizenz liegt im eingebetteten Framework.

- Feed: https://github.com/fcore247/luna-browser/releases/latest/download/appcast.xml
- Automatische Prüfung alle vier Stunden während Luna läuft; Sparkle verwaltet
  den Zeitplan und Downloads/Installation, wenn möglich im Hintergrund.
- Manuelle Prüfung: App-Menü → **Nach Updates suchen …**.
- Sparkle kann für Abschluss/Neustart oder fehlende Schreibrechte eine Anfrage
  anzeigen. Benutzerpräferenzen von Sparkle haben Vorrang vor den Defaults.
- Archive werden mit Ed25519 signiert. Luna vertraut ausschließlich dem in
  `Info.plist` hinterlegten öffentlichen Schlüssel. Keine GitHub-Tokens im Client.
- Privater Schlüssel: macOS-Schlüsselbund, Sparkle-Account `luna-browser-updates`.
  Nicht löschen: Er wird für zukünftige Releases benötigt. Nicht ins Repo exportieren.
- Keine Übermittlung des optionalen Sparkle-Systemprofils.

## Downloadseite und Erstinstallation

GitHub Pages veröffentlicht `docs/` von `main`. Der Download-Dialog erklärt die Terminal-Installation; alternativ gibt es den direkten DMG-Download. `docs/install.sh` lädt die neueste Release-Version, prüft SHA-256 und die App-Signatur und öffnet das Installationsfenster (Luna-Symbol und Ordner „Programme“ zum Hineinziehen); mit `--auto` kopiert es Luna ohne sudo selbst in `/Applications` (ersatzweise `~/Applications`) und legt eine ältere Installation in den Papierkorb. `--verify-only` prüft den vollständigen Download ohne Installation. Bestehende Installationen werden gesichert.

`scripts/release.sh` veröffentlicht auch DMG und SHA256SUMS. `scripts/make-dmg.sh` benötigt eine unveränderte, signierte App. Für bereits laufende Builds die App aus dem Release-ZIP extrahieren, da das dynamische Dock-Icon die lokale Bundle-Signatur verändern kann.

Der Text jedes GitHub-Releases (mit dem Installationsbefehl) steht in `scripts/release-notes.md`; `scripts/release.sh` übernimmt ihn. Die DMG soll nicht einzeln aus dem Browser geladen werden, solange Luna nicht notarisiert ist.
