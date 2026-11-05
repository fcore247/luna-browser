# Übergabe: Luna Search im Glas-Look (für den macOS-Test und das Update)

Stand: Branch `feature/luna-search-glass`, noch **nicht** nach `main` gemergt und **kein Release**.
Auf Windows wurde ein lokaler Testbuild (1.3.4-test) gebaut und gestartet; auf macOS ist nichts getestet.
Bitte erst auf dem Mac testen, dann wie unten unter „Update veröffentlichen" vorgehen.

## Was neu ist

**Luna Search**
- Eigenes Suchfeld auf der Ergebnisseite entfernt; gesucht wird weiter in der Adressleiste.
- Filter *Alle · Bilder · Nachrichten · Videos* sitzen als Pillen mit „Liquid"-Tropfen **in der Adressleiste**
  (`#urlPills` in `index.html`, Logik `renderSearchPills` in `main.js`, Markup `filterPillsHTML` in `searchview.js`).
- Ergebnisse als Glaskarten mit Lichtfleck unter dem Mauszeiger; Seitenkopf nur noch Marke + Status.
- **Bildersuche** (Brave Images): `internal/search/images.go`, Bindung `App.SearchImages` in `app.go`,
  `searchImages` in `api.js`; Raster, Großansicht mit Pfeiltasten/Esc. Mit Tavily gibt es keine Bilder (Hinweis).
  Go-Test: `TestImages` in `internal/search/search_test.go`.
- Ladeansicht der Bildersuche: Tunnel „Luna sucht…" (nach *Perspective Tunnel Hero*, 21st.dev), danach
  Nebel, der in die Bilder überblendet (`tunnelHTML` in `searchview.js`, `fogTransition` in `main.js`).
- Uhrzeit-Suche (`time`, `zeit`, `uhrzeit`, `wie spät` …) zeigt eine Flip-Disk-Matrix-Uhr
  (`flipclock.js`, nach *Flip Disk Matrix*, 21st.dev); keine Netzanfrage.

**Gesamtes Fenster**
- Werkzeugleiste und Lesezeichenleiste im Glas-Stil, keine Trennlinie mehr zur Seite.
- `styles/luna-glass.css`: gemeinsamer Glas-Look für Start, Luna Music, Chat, Einstellungen, Erweiterungen.
- Weiche Übergänge zwischen Luna-Seiten (View Transitions, `renderAll`/`paintAll` in `main.js`).
- Neues Theme **Tiefnacht** (`abyss`): fast schwarz, schaltet beim Wählen auf Dunkel; in Einstellungen und
  Schnelleinstellungen („theme" in der Adressleiste). Test `commands.spec.cjs` erwartet jetzt 11 Themes.

## Bewusst nicht enthalten
- Keine Versionsänderung, kein `UPDATES.md`-Eintrag, keine Sparkle-/Release-Dateien.
- `frontend/wailsjs/*`, `frontend/package.json.md5` und `go.mod` wurden vom lokalen Wails-Build verändert und
  **zurückgesetzt**. Auf dem Mac beim Build neu erzeugen lassen und nur committen, was sich wirklich ändert
  (die Bindings enthalten dann `SearchImages`).
- Die KI-/MCP-Farbliste in Go (`internal/browsermcp`, `internal/chat/apple_themes.go`) kennt Tiefnacht noch nicht.

## macOS-Testliste
Technisch relevant für WebKit (macOS 13+): `color-mix`, `:has()`, Container-Einheiten (`cqw`, `cqmin`),
`backdrop-filter`, View Transitions (nur ab neuerem Safari; ist per `typeof document.startViewTransition` abgesichert,
ältere Systeme springen wie bisher), `backface-visibility` (mit `-webkit-`).

- [ ] `cd frontend && npm ci && npm test` (Playwright) und `go test ./...`
- [ ] Startseite → etwas suchen: weicher Wechsel, Glas-Look, Adressleiste ohne Trennlinie.
- [ ] Ergebnisse: Pillen in der Adressleiste, Tropfen gleitet; Karten-Hover mit Lichtfleck.
- [ ] Reiter *Bilder* mit echtem Brave-Schlüssel: Tunnel → Nebel → Raster; Großansicht, Pfeiltasten, Esc.
- [ ] `time` eingeben: Flip-Disk-Uhr läuft, Scheiben klappen um (Hover kippt Scheibe).
- [ ] Theme Tiefnacht wählen (Einstellungen und `theme`): schaltet auf Dunkel, bleibt nach Neustart.
- [ ] Luna Music, Chat, Einstellungen, Erweiterungen im neuen Glas-Look, hell und dunkel.
- [ ] Englisch umschalten: neue Texte sind übersetzt (u. a. „Luna is searching", „Deep Night").
- [ ] „Bewegung reduzieren" im System: kein Nebel/Tunnel/Übergang, nichts bleibt hängen.

## Update veröffentlichen (nach bestandenem Test)
1. Branch auf aktuellen `main` bringen, CI (macOS + Windows) muss grün sein.
2. Version in `wails.json` → `info.productVersion` erhöhen (Vorschlag: 1.3.5) und Eintrag in `UPDATES.md`.
3. Vorgehen wie in `docs/RELEASES.md` („Gemeinsames Update veröffentlichen"), inklusive Branch `release/VERSION`
   auf den geprüften Commit.
