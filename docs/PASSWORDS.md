# Passwort-Tresor

Luna hat einen eigenen Passwort-Tresor. Er füllt Anmeldungen auf Webseiten aus, damit du dich auch bei
Seiten mit Login (zum Beispiel einem Schulportal) schnell anmelden kannst. Es gibt ihn bisher auf dem Mac.

## So funktioniert es

1. Du meldest dich auf einer Webseite an. Danach erscheint in der Adressleiste ein Schlüssel mit
   **Speichern** (oder **Aktualisieren**, wenn es das Konto schon gibt).
2. Ein Klick darauf fragt nach, ob Luna das Passwort speichern soll.
3. Später zeigt ein Schlüssel in der Adressleiste, dass für diese Seite ein Konto gespeichert ist. Ein Klick,
   dann **Touch ID** (oder das Mac-Passwort), und Luna füllt die Felder aus. Bei mehreren Konten wählst du
   zuerst eines aus. Zweistufige Logins (erst Benutzername, dann Passwort) füllt Luna in zwei Klicks.

Verwaltet wird alles unter **Einstellungen → Passwörter**: Liste ohne Passwörter, einzelne Einträge löschen,
alle löschen (mit Touch ID) und das Speichern-Angebot ausschalten.

## Was Luna schützt

- **Verschlüsselt.** Passwörter liegen mit AES-256-GCM verschlüsselt in `logins.json` im Profilordner
  (Rechte 0600). Ursprung und Benutzername sind an jeden Eintrag gebunden, ein Eintrag lässt sich nicht
  auf eine andere Seite verschieben. Webseiten und Benutzernamen stehen lesbar in der Datei, damit Luna ohne
  Entsperren weiß, wo ein Konto existiert.
- **Der Schlüssel liegt im Schlüsselbund.** Ein einziger Eintrag (`com.luna.browser.vault`), nicht in iCloud
  synchronisiert. Unsignierte Testversionen können nach einem Update einmal nach dem Anmeldepasswort fragen.
- **Nur auf Klick und mit Touch ID.** Ausgefüllt wird nie von selbst.
- **Nur auf derselben Seite.** Luna vergleicht den Ursprung (Schema, Host, Port) beim Speichern und noch
  einmal direkt vor dem Einsetzen. Nur `https://` ist erlaubt, `http://` nur für `localhost`.
- **Getrennte Skript-Welt.** Die Formular-Erkennung läuft in einer eigenen JavaScript-Welt von WebKit.
  Skripte der Webseite können sie nicht überschreiben, aufrufen oder beobachten. Den Ursprung beim Speichern
  liefert WebKit, nicht die Seite. Nach dem Einsetzen sehen Seite und Skripte das Feld wie bei jedem Autofill.
- **Nur im Hauptfenster.** In eingebetteten Frames (zum Beispiel Werbung) fragt und füllt Luna nie.

## Was die KI nicht kann

Die KI-Anbindung (MCP) und Luna Chat haben **kein** Werkzeug für den Tresor. Passwörter laufen weder durch
das Frontend noch durch die Ereignisse an die Oberfläche noch durch Seitentexte. Die Passwortliste lässt sich
auch nicht über `browser_settings` öffnen. Ein Test (`vault_boundary_test.go`) sichert das ab.

## Grenzen

- Passkeys (WebAuthn) und der iCloud-Schlüsselbund von Safari sind nicht eingebunden. Dafür verlangt Apple
  für Browser ein besonderes Entitlement, das nur Apple vergibt.
- Windows hat den Tresor noch nicht. Der Einstellungsbereich sagt das.
- Passwörter, die du über die Zwischenablage oder Formulare ohne Anmelde-Schaltfläche eingibst, erkennt Luna
  nur, wenn sie über ein Formular, die Eingabetaste oder eine Anmelde-Schaltfläche abgeschickt werden.
