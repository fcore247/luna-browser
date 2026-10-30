# Seiten auf Änderungen überwachen

In Luna Chat oder einer per MCP verbundenen KI beispielsweise schreiben:

> Überwache https://example.com alle fünf Minuten und benachrichtige mich bei Änderungen.

Die KI verwendet `browser_page_monitors`:

```json
{"action":"add","url":"https://example.com","interval_minutes":5}
```

`list` zeigt Überwachungen, IDs, letzten Prüfzeitpunkt, letzte Änderung und Fehler.
`pause`, `resume` und `remove` benötigen die ID aus `list`.
Externe Webseiten benötigen keine Luna-Integration. Für externe KI-Clients muss
Lunas vorhandener MCP-Zugang eingeschaltet und verbunden sein (siehe MCP_SETUP.md).
Die interne KI erhält dasselbe Werkzeug über Lunas vorhandene Werkzeuganbindung.

## Seiten hinter einem Login

Die Seite in Luna öffnen und anmelden. Die KI liest sie mit `browser_page/read`
und wählt einen CSS-Selektor für einen Inhaltsbereich, der ausschließlich im
angemeldeten Zustand vorhanden ist, beispielsweise die Auftragsliste:

```json
{"action":"add","url":"https://example.com/account/orders","source":"browser","selector":"#authenticated-orders","interval_minutes":5}
```

Der Selektor ist ein Beispiel und muss durch einen tatsächlich vorhandenen
Selektor der Zielseite ersetzt werden. Nicht den gesamten Body oder einen auch
auf der Loginseite vorhandenen Container auswählen.

Luna liest den gerenderten Inhalt des geöffneten Tabs einschließlich durch
JavaScript erzeugter Texte. Cookies und Passwörter verlassen den Browser nicht.
Ist der Tab geschlossen, die Seite noch am Laden oder der angemeldete Bereich
nicht vorhanden, bleibt die Aufgabe gespeichert und wartet. Sichtbare
Passwortfelder blockieren ebenfalls den Vergleich. Der letzte erfolgreiche
Vergleich bleibt erhalten. Nach erneutem Öffnen derselben URL und Anmeldung
geht es automatisch weiter, auch nach einem Luna-Neustart. Wartende Aufgaben
versuchen es alle 15 Sekunden erneut. Erkennbare Textänderungen seit dem letzten
erfolgreichen Vergleich lösen dann eine Meldung aus.

Es wird kein automatischer Login durchgeführt. Standardmäßig lädt Luna den
Tab vor jeder Prüfung neu, damit auch Seiten ohne Live-Aktualisierung neue
Serverdaten liefern. Bei einer laufenden Eingabe, erkennbar ungespeicherten
Formularen oder einem sichtbaren bearbeitbaren Inhaltsbereich wartet Luna.
In den Einstellungen lässt sich das Neuladen pro Aufgabe abschalten
(`auto_refresh=false` per MCP). Die URL einschließlich
Pfad und Suchparametern muss übereinstimmen; der Fragmentteil wird ignoriert.
Ein korrekt gewählter Login-Inhaltsselektor ist erforderlich, da es keine
universelle zuverlässige Erkennung aller Login-/SSO-Seiten gibt.

Die erste erfolgreiche Prüfung speichert den Ausgangszustand ohne Meldung.
Weitere Änderungen des lesbaren HTML-/Textinhalts erzeugen eine Luna-Meldung
und eine Systembenachrichtigung unter Windows/macOS. Systemmeldungen unterliegen
den Einstellungen des Betriebssystems. Zeitstempel und Fehler sind per `list`
abrufbar; es wird kein vollständiger Seiteninhalt gespeichert.

Standardintervall: fünf Minuten, einstellbar zwischen einer Minute und sieben Tagen.
Die Prüfung startet spätestens 15 Sekunden nach Fälligkeit, bei mehreren Seiten
können laufende Anfragen die Prüfung weiter verzögern. Bis zu 100 URLs sind möglich.
Aufträge und Vergleichswerte bleiben nach einem Neustart erhalten.
Luna muss geöffnet bleiben; geschlossene Tabs sind kein Hindernis.

Im Standardmodus `source=public` werden öffentliche HTTP-/HTTPS-Seiten bis
2 MiB unterstützt, ohne Login, Browser-Cookies oder JavaScript-Ausführung.
Private Netzadressen werden bei diesen HTTP-Abfragen auch
nach Weiterleitungen gesperrt. Skripte, Styles und reine Leerraumänderungen
lösen keine Meldung aus. Dynamische Inhalte wie Uhrzeiten oder Werbung können
Meldungen auslösen. Ausschließlich durch JavaScript erzeugte Inhalte, visuelle
Änderungen ohne Textänderung und Änderungen zwischen zwei Prüfungen werden nicht
zuverlässig erfasst. Im Browsermodus werden JavaScript-Inhalte im gewählten
Bereich unterstützt. Fehlerseiten ersetzen den letzten Vergleichswert nicht.

Dies ist eine Quellcode-Erweiterung. Eine signierte Veröffentlichung folgt dem
vorhandenen Release-Verfahren des Projekts und ist davon getrennt.

## Verwaltung in Luna

Die Adressleiste zeigt für gespeicherte Aufgaben den Zustand „Überwacht“,
„Wartet“ oder „Pausiert“. Ein Klick öffnet die Schnellsteuerung im selben
ausklappenden Menü wie die Theme-Auswahl. Auch `watch`, `monitor` und
`überwachen` in der Adressleiste öffnen sie ohne Enter.

Unter Einstellungen → Seitenüberwachung stehen alle Aufgaben mit letzter
Prüfung, letzter Änderung und Fehlermeldung. Dort und in der Schnellsteuerung
können Aufgaben pausiert, fortgesetzt, entfernt oder zur sofortigen Prüfung
vorgemerkt werden. Prüfintervall und Neuladen werden direkt gespeichert.
„Jetzt prüfen“ startet spätestens beim nächsten 15-Sekunden-Durchlauf,
sofern keine andere Prüfung läuft. Das Browsermenü enthält ebenfalls den
Eintrag Seitenüberwachung. Per MCP ändern `update` mit `id`, optionalem
`interval_minutes` und `auto_refresh` dieselben Einstellungen; `check` mit
`id` merkt eine Prüfung vor.
