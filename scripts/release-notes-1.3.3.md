Luna Browser 1.3.3 bringt gespeicherte Seitenüberwachungen für öffentliche Webseiten und angemeldete Browserseiten – auch außerhalb von Luna.

- Änderungen am überwachten Text erzeugen eine Meldung in Luna und eine Systembenachrichtigung.
- Aufgaben, Vergleichsstand, Prüfintervall und Neuladen bleiben gespeichert. Nach erneutem Öffnen und Anmelden setzt die Überwachung fort.
- Automatisches Neuladen erkennt auch Änderungen auf Seiten ohne Live-Aktualisierung. Bei einer laufenden Eingabe oder erkennbar ungespeicherten Formulardaten wartet Luna.
- Die Adressleiste zeigt „Überwacht“, „Wartet“ oder „Pausiert“. Ein Klick öffnet die Schnellsteuerung im Stil der Theme-Auswahl.
- `watch`, `monitor` oder `überwachen` öffnet die Schnellsteuerung direkt beim Tippen.
- Einstellungen → Seitenüberwachung verwaltet alle Aufgaben: Prüfintervall, Neuladen, Pausieren, Fortsetzen, Jetzt prüfen und Entfernen.
- Einrichtung und Verwaltung sind über das neue MCP-Werkzeug `browser_page_monitors` möglich.
- Windows-Testpakete verwenden für GUI und MCP-Anbindung dasselbe fest hinterlegte Testprofil. Verbindungsfehler nennen das verwendete Profil, ohne Zugangsschlüssel auszugeben.

Luna muss für die Überwachung geöffnet bleiben. Bei Login-Seiten muss außerdem der angemeldete Tab geöffnet sein. Erkannt werden Textänderungen bei der nächsten erfolgreichen Prüfung; Änderungen zwischen zwei Prüfungen können unbemerkt bleiben. Zugangsdaten und Cookies werden nicht exportiert.

**Windows bleibt experimentell / instabil.** Windows: ZIP vollständig entpacken und `Luna Browser.exe` starten; der Unterordner `native` muss daneben bleiben. macOS: den vorhandenen Installer oder das signaturgeprüfte Update verwenden.

Ein gemeinsames Release für macOS ARM64 und Windows x64. Beide Plattformen müssen für denselben Quellcommit den Workflow „Build and test both platforms“ vollständig bestehen. Die Update-Dateien werden mit dem vorhandenen Sparkle-Schlüssel signiert.
