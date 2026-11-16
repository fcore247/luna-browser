# Passwort-Tresor

Luna hat einen eigenen Passwort-Tresor. Er füllt Anmeldungen auf Webseiten aus, damit du dich auch bei
Seiten mit Login (zum Beispiel einem Schulportal) schnell anmelden kannst. Es gibt ihn bisher auf dem Mac.

## So funktioniert es

1. Wenn du eine Anmeldung abschickst, bietet Luna über der Webseite **Speichern** oder **Nicht jetzt** an.
   Hast du für ein bekanntes Konto ein anderes Passwort eingegeben, erscheint **Aktualisieren**.
2. Beim Speichern kannst du **Automatisch mit Touch ID anmelden** wählen. Erkennt Luna beim nächsten
   Besuch das Anmeldeformular, bestätigst du mit Touch ID oder deinem Mac-Passwort. Luna füllt das
   Formular aus. Würde ein Formular das Passwort in der URL übertragen, überlässt Luna dir das Absenden.
   Unterstützte Anmeldeformulare sendet Luna automatisch ab. Eine Zwei-Faktor-Abfrage beantwortest du auf der Webseite.
3. Über den Schlüssel in der Adressleiste kannst du eine Anmeldung auch selbst starten und zwischen
   gespeicherten Konten wählen. Bei erkannten zweistufigen Anmeldungen auf derselben Website verwendet
   Luna die Bestätigung auch für den unmittelbar folgenden Passwortschritt.

Unter **Einstellungen → Passwörter** wählst du pro Website das Konto für die automatische Anmeldung.
Dort kannst du gespeicherte Einträge löschen und das Speicherangebot ausschalten.

## Was Luna schützt

- **Verschlüsselt.** Passwörter liegen mit AES-256-GCM verschlüsselt in `logins.json` im Profilordner
  (Rechte 0600). Ursprung und Benutzername sind an jeden Eintrag gebunden, ein Eintrag lässt sich nicht
  auf eine andere Seite verschieben. Webseiten und Benutzernamen stehen lesbar in der Datei, damit Luna ohne
  Entsperren weiß, wo ein Konto existiert.
- **Der Schlüssel liegt im Schlüsselbund.** Ein einziger Eintrag (`com.luna.browser.vault`), nicht in iCloud
  synchronisiert. Unsignierte Testversionen können nach einem Update einmal nach dem Anmeldepasswort fragen.
- **Freigabe am Mac.** Jede neue Anmeldung mit gespeicherten Zugangsdaten erfordert Touch ID oder das
  Mac-Passwort. Für eine zweistufige Anmeldung gilt die Freigabe höchstens 90 Sekunden und nur für
  den nächsten Passwortschritt im selben Tab, für dieselbe Website und dasselbe Konto.
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
- Das direkte Anmelden setzt ein erkennbares Anmeldeformular voraus. Bei zusätzlichen
  Bestätigungsschritten oder mehreren uneindeutigen Formularen kannst du auf der Website fortfahren.
