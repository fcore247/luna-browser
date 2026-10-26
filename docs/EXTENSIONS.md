# Chrome-Erweiterungen in Luna

Das Puzzleteil neben dem Menü öffnet eine kompakte Erweiterungsliste. Ein Klick auf eine aktive Erweiterung öffnet ihr Steuerungsfenster. **Erweiterungen verwalten** öffnet die Einstellungen.

Auf einer Chrome-Web-Store-Detailseite erscheint automatisch eine Installationsleiste. Die Erweiterungs-ID in der URL löst sie aus; Store-Name und Icon werden unabhängig vom Ladezustand der Webseite anhand dieser ID ergänzt. Die Leiste schiebt die Webseite nach unten, sodass der Store bedienbar bleibt. **In Luna installieren** lädt das Paket und zeigt die Berechtigungen direkt in dieser Leiste. **Zugriff erlauben & installieren** installiert es, ohne die Einstellungen zu öffnen. Auf Store-Übersichts- und Suchseiten erscheint das Angebot nicht.

Icons werden als begrenzte Rasterbilder lokal angezeigt. Die Verwaltung und das Puzzleteil verwenden bei installierten Erweiterungen die Icons aus deren Paket. Die neue Verwaltung bietet eine Suche, Status und Schalter zum Aktivieren sowie direkten Zugriff auf das Steuerungsfenster.

Alternativ unter **Einstellungen → Erweiterungen** einen Chrome-Web-Store-Link / eine Erweiterungs-ID einfügen und **Prüfen** wählen. Alternativ ein ZIP oder eine CRX3-Datei importieren. Das Manifest muss direkt im ZIP liegen.

Luna lädt Store-Pakete über Googles HTTPS-Download, prüft die CRX3-Entwicklersignatur und die angeforderte Erweiterungs-ID und zeigt Name, Version, API-Rechte und Webseitenzugriffe an. Erst **Zugriff erlauben & installieren** aktiviert das Paket. ZIP-Dateien haben keine CRX-Signatur und sollten nur aus vertrauenswürdigen Quellen stammen.

Installierte Erweiterungen können aktiviert, deaktiviert, geöffnet und entfernt werden. Nach einer Änderung betroffene Webseiten neu laden. Für eine neue Version die alte Erweiterung entfernen und neu importieren; Erweiterungsdaten werden dabei nicht übernommen. Es gibt noch keine automatischen Erweiterungsupdates.

## Plattformen

- Windows verwendet die native WebView2-Erweiterungsunterstützung. Ein aktuelles Microsoft Edge WebView2 Runtime wird benötigt. Erweiterungen mit Popup oder Optionsseite können über **Öffnen** bedient werden. Reine `action.onClicked`-Aktionen ohne Popup werden derzeit nicht ausgelöst.
- macOS verwendet native WKWebExtensions ab macOS 15.4. Auf älteren Systemen bleibt Luna nutzbar; die Erweiterungsverwaltung erklärt die Mindestversion. Popups, Content-Skripte, Erweiterungsspeicher und die angebotenen WebKit-WebExtension-APIs laufen in nativen Seiten-Tabs.
- Eine Chrome-Erweiterung ist nicht automatisch auf beiden Engines kompatibel. Insbesondere Chrome-spezifische APIs, native Messaging-Hosts, DevTools-Erweiterungen und Chrome-Anmeldung/OAuth sind nicht als kompatibel zugesichert. Auf macOS fehlt insbesondere `chrome.identity` mit `getRedirectURL()` und `launchWebAuthFlow()`; Erweiterungen, die darauf angewiesen sind, können ihre Anmeldung nicht ausführen.
- Erweiterungen sehen nur die nativen Webseiten-Tabs. Lunas Wails-Oberfläche, Einstellungen und API-Schlüssel sind nicht als Erweiterungs-Tabs registriert. Webseitenberechtigungen können trotzdem sensible Daten der freigegebenen Websites einschließen.

## Prüfung

Die nativen Integrationstests laden eine lokale Manifest-V3-Erweiterung in die echte Engine und prüfen DOM-Injektion, `chrome.storage.local`, Deaktivierung, Reaktivierung und den Erhalt der gespeicherten Daten. Go-Tests prüfen Signatur und ID, manipulierte Pakete, Pfadgrenzen, Berechtigungsanzeige und Installationszustände. Der Oberflächentest prüft die explizite Bestätigung vor der Installation.

Eine lokal separat verpackte Test-App hat eine eigene Bundle-ID und wird mit `-X browser-mac/internal/buildinfo.TestMode=1` gebaut. Sie verwendet ein separates Luna-Profil und startet den automatischen Browser-Updater nicht.
