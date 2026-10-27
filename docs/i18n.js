/* Sprache der Webseite: Deutsch, Englisch als Fallback. Eine manuelle Wahl (Footer) hat Vorrang. */
(() => {
  'use strict';
  let saved = null;
  try { saved = localStorage.getItem('luna-site-lang'); } catch {}
  const browser = (navigator.languages?.[0] || navigator.language || 'en').toLowerCase().split('-')[0];
  const language = (saved === 'de' || saved === 'en') ? saved : browser === 'de' ? 'de' : 'en';
  const translations = {
    // Meta & Navigation
    'Luna Browser – Mach es dir im Web gemütlich': 'Luna Browser – Make yourself at home on the web',
    'Luna ist ein ruhiger Browser für macOS und Windows: zehn Farbwelten, Befehle in der Adressleiste, Mausgesten, Spotify und eine KI, die lokal mitdenkt. Probier Luna direkt im Browser aus.': 'Luna is a calm browser for macOS and Windows: ten color themes, address-bar commands, mouse gestures, Spotify and AI that thinks along locally. Try Luna right in your browser.',
    'Zehn Farbwelten, Mausgesten, Spotify und KI. Ein Browser, der sich nach dir richtet. Jetzt virtuell ausprobieren.': 'Ten color themes, mouse gestures, Spotify and AI. A browser that adapts to you. Try it virtually now.',
    'Hauptmenü': 'Main menu', 'Ausprobieren': 'Try it', 'Farbwelten': 'Color themes', 'Farbwelt': 'Color theme',
    'Hell oder Dunkel wechseln': 'Toggle light or dark mode', 'Hell / Dunkel': 'Light / Dark',
    // Hero
    'Mach es dir': 'Make yourself', 'im Web': 'at home', 'gemütlich.': 'on the web.',
    'Ein Browser, der sich nach dir richtet. Deine Farben, deine Musik, Mausgesten, eine KI, die lokal mitdenkt. Und sonst nichts, was dich ablenkt.': 'A browser that adapts to you. Your colors, your music, mouse gestures, an AI that thinks along locally. And nothing else to distract you.',
    'Luna herunterladen': 'Download Luna', 'Virtuell ausprobieren': 'Try it virtually',
    // Virtuelle Luna
    'Virtuelle Luna': 'Virtual Luna',
    'Das ist keine Abbildung. Tipp einen Befehl in die Adressleiste, zeichne mit gedrückter Maustaste ein': 'This is not a picture. Type a command into the address bar, hold the mouse button and draw an',
    'oder einen': 'or a', 'Kreis': 'circle', 'auf die Seite, wechsle die Farbwelt.': 'on the page, switch the color theme.',
    'Tabs': 'Tabs', 'Neuer Tab': 'New tab', 'Zurück': 'Back', 'Vor': 'Forward', 'Neu laden': 'Reload',
    'Suchen oder Adresse eingeben': 'Search or enter an address', 'Adressleiste der virtuellen Luna': 'Address bar of the virtual Luna',
    'Keine Wiedergabe': 'Not playing', 'Luna Chat': 'Luna Chat', 'Gesten-Modus für Touch': 'Gesture mode for touch', 'Gesten-Modus': 'Gesture mode',
    'Sira · lokal auf deinem Mac': 'Sira · locally on your Mac', 'Chat schließen': 'Close chat', 'Frag Sira etwas …': 'Ask Sira something …', 'Nachricht an Sira': 'Message to Sira', 'Senden': 'Send',
    'Befehle zum Ausprobieren': 'Commands to try', 'Probier mal:': 'Try:',
    'Tab schließen': 'Close tab', 'Lesezeichen': 'Bookmarks', 'Verlauf': 'History', 'Erscheinungsbild': 'Appearance', 'Einstellungen': 'Settings',
    'Mit Luna Search suchen oder Adresse eingeben': 'Search with Luna Search or enter an address',
    'Gute Nacht': 'Good night', 'Guten Morgen': 'Good morning', 'Guten Tag': 'Good afternoon', 'Guten Abend': 'Good evening',
    'Noch keine Lesezeichen': 'No bookmarks yet', 'Dein Verlauf bleibt lokal auf deinem Mac': 'Your history stays local on your Mac', 'Keine Downloads': 'No downloads',
    'Dunkel': 'Dark', 'Hell': 'Light', 'Deine Farbwelt': 'Your color theme',
    'ungefähr': 'about', 'Ergebnisse': 'results', 'Wikipedia': 'Wikipedia', 'Übersicht': 'overview', 'Alles Wichtige auf einen Blick, kompakt zusammengefasst.': 'Everything important at a glance, neatly summarized.',
    'Offizielle Seite': 'Official site', 'Die offizielle Seite mit Neuigkeiten, Hintergründen und mehr.': 'The official site with news, background and more.',
    'Frag Sira zu': 'Ask Sira about', 'Lass dir die Treffer von Sira zusammenfassen, lokal auf deinem Mac.': 'Let Sira summarize the results, locally on your Mac.',
    'Video': 'Video', 'erklärt in drei Minuten': 'explained in three minutes', 'Kurz, verständlich und ohne Umwege.': 'Short, clear and to the point.',
    'Befehle': 'Commands', 'Jeder Befehl hat einen Schalter. Klick eine Karte, um ihn an- oder auszuschalten.': 'Every command has a switch. Click a card to turn it on or off.', 'An': 'On', 'Aus': 'Off',
    'Farbwelt wählen': 'Choose a color theme', 'Die Eingabeleiste wächst nach unten und zeigt alle Themes. Ein Klick färbt Luna sofort um.': 'The address bar expands to show all themes. One click recolors Luna instantly.',
    'Luna Chat öffnen': 'Open Luna Chat', 'Sobald du chat getippt hast, öffnet sich der Chat. Auch hier ohne Enter.': 'As soon as you type chat, the chat opens. No Enter needed.',
    'Spotify durchsuchen': 'Search Spotify', 'Tippe spotify und danach einen Suchbegriff. Treffer erscheinen direkt in Luna.': 'Type spotify followed by a search term. Results appear right in Luna.',
    'Song sofort abspielen': 'Play a song instantly', 'play und ein Songname, dann Enter. Luna übergibt den besten Treffer an Spotify.': 'play plus a song name, then Enter. Luna hands the best match to Spotify.',
    'Tabs steuern': 'Control tabs', 'tab open youtube.com, tab close, tab list, tab reload oder tab zoom 120. Mit Enter ausführen.': 'tab open youtube.com, tab close, tab list, tab reload or tab zoom 120. Run with Enter.',
    'einstellungen': 'settings', 'Einstellungen öffnen': 'Open settings', 'Luna fragt kurz nach, ob du die Einstellungen öffnen möchtest, statt im Web zu suchen.': 'Luna briefly asks whether you want to open settings instead of searching the web.',
    'Alle Befehle zeigen': 'Show all commands', 'Öffnet diese Übersicht. Jeder Befehl hat einen Schalter: grün für an, rot für aus.': 'Opens this overview. Every command has a switch: green for on, red for off.',
    'Direkt zu einer Seite': 'Straight to a site', 'Tippe youtube oder google und eine kurze Tipp-Pause später bist du dort.': 'Type youtube or google and a short pause later you are there.',
    'Mausgesten': 'Mouse gestures', 'S für Screenshot, Kreis für Notizen': 'S for screenshot, circle for notes', 'Welche Wörter in der Adressleiste etwas auslösen': 'Which words in the address bar trigger something',
    'Suche, Warteschlange und Wiedergabe': 'Search, queue and playback', 'KI-Zugriff für andere Apps': 'AI access for other apps', 'Standardmäßig aus, braucht Touch ID': 'Off by default, requires Touch ID',
    'Sitzung wiederherstellen': 'Restore session', 'Tabs beim nächsten Start wieder öffnen': 'Reopen tabs on next launch', 'Alles freiwillig, alles jederzeit änderbar.': 'All optional, all changeable at any time.',
    'Top-Treffer': 'Top result', 'Künstler': 'Artist', 'Enter': 'Enter', 'sofort': 'instant', 'Abspielen': 'Play', 'Suchen': 'Search',
    'Einstellungen öffnen?': 'Open settings?', 'Öffnen': 'Open', 'Lieber suchen': 'Search instead', 'wird geöffnet': 'is opening',
    'Tabs geschlossen': 'tabs closed', 'Unbekannter Tab-Befehl': 'Unknown tab command', 'Schon ganz am Anfang': 'Already at the beginning',
    'Wiedergabe an Spotify übergeben': 'Playback handed to Spotify', 'Pause': 'Paused',
    'Hallo, ich bin Sira. Ich laufe lokal auf deinem Mac, ohne Konto und ohne Schlüssel. Frag mich etwas, oder sag „Farbwelt Ozean“, „dunkel“ oder „spiel One More Time“.': 'Hi, I’m Sira. I run locally on your Mac, no account, no API key. Ask me something, or say “theme ocean”, “dark” or “play One More Time”.',
    'Gern. Luna trägt jetzt': 'Sure. Luna is now wearing', 'Gute Wahl, schon umgestellt.': 'Good choice, already switched.',
    'Dunkel gestellt. Schön für den Abend.': 'Switched to dark. Nice for the evening.', 'Hell gestellt.': 'Switched to light.',
    'Läuft': 'Now playing', 'von': 'by',
    'Das ist Lunas Startseite: Uhr, Suche und deine Musik, alles ruhig an einem Ort. Nichts, was dich ablenkt.': 'This is Luna’s start page: clock, search and your music, all calm in one place. Nothing to distract you.',
    'Du bist gerade auf': 'You are on', 'In Luna lese ich die Seite und fasse sie dir in drei Sätzen zusammen, lokal und ohne dass etwas deinen Mac verlässt.': 'In Luna I read the page and sum it up in three sentences, locally, without anything leaving your Mac.',
    'Neuer Tab mit': 'New tab with', 'ist offen.': 'is open.',
    'Ich bin Sira, Lunas KI auf Apples eigenem Modell. Ich kann Tabs öffnen, Seiten zusammenfassen, die Farbwelt wechseln oder Musik starten. Für größere Fragen gibt es im Luna Chat auch Modelle von Groq und OpenRouter.': 'I’m Sira, Luna’s AI on Apple’s own model. I can open tabs, summarize pages, switch the color theme or start music. For bigger questions, Luna Chat also offers models from Groq and OpenRouter.',
    'Halte die Maustaste auf der Seite gedrückt und zeichne ein S. Dann fliegt ein Sofortbild in die Ecke. Ein Kreis öffnet den Notizzettel.': 'Hold the mouse button on the page and draw an S. A polaroid flies into the corner. A circle opens the note.',
    'Hallo! Schön, dass du da bist. Was darf ich für dich tun?': 'Hello! Nice to have you here. What can I do for you?', 'Sehr gern.': 'You’re welcome.',
    'Das würde ich in Luna direkt für dich erledigen. Hier auf der Webseite kann ich Tabs öffnen, die Farbwelt wechseln, Musik starten oder die Seite zusammenfassen.': 'In Luna I would take care of that right away. Here on the website I can open tabs, switch the color theme, start music or summarize the page.',
    'Gute Frage. In der echten Luna beantworte ich das mit Blick auf deine offenen Tabs, lokal auf deinem Mac.': 'Good question. In the real Luna I answer that with a look at your open tabs, locally on your Mac.',
    'Probier mal „Farbwelt Lavendel“, „dunkel“ oder „spiel Nightcall“.': 'Try “theme lavender”, “dark” or “play Nightcall”.',
    'Screenshot gespeichert': 'Screenshot saved', 'Notiz': 'Note', 'Deine Gedanken zu dieser Seite …': 'Your thoughts on this page …', 'Notiz schließen': 'Close note', 'Notizzettel geöffnet': 'Note opened',
    'Tab geschlossen': 'Tab closed', 'Geste': 'Gesture', 'erkannt. Was sie auslöst, legst du in Luna selbst fest.': 'recognized. What it triggers is up to you in Luna.',
    'Nicht erkannt. Probier ein S oder einen Kreis.': 'Not recognized. Try an S or a circle.',
    'Gesten-Modus an: jetzt mit dem Finger zeichnen': 'Gesture mode on: draw with your finger', 'Gesten-Modus aus': 'Gesture mode off',
    'Jetzt du: Maustaste halten und ein S zeichnen': 'Your turn: hold the mouse button and draw an S',
    // Features
    'Was Luna anders macht': 'What Luna does differently', 'Ruhig, weil Luna dich nicht': 'Calm, because Luna doesn’t', 'zuschüttet.': 'bury you.',
    'Zehn Farbwelten': 'Ten color themes',
    'Luna Rosé, Lavendel, Ozean, Minze, Wald, Sand, Pfirsich, Kirschblüte, Arktis und Graphit. Jede passt sich an Hell und Dunkel an, sogar das Icon im Dock färbt sich mit.': 'Luna Rosé, Lavender, Ocean, Mint, Forest, Sand, Peach, Cherry Blossom, Arctic and Graphite. Each adapts to light and dark, and even the Dock icon changes color.',
    'Befehle statt Klicks': 'Commands instead of clicks',
    'Gib in die Adressleiste ein, was du willst.': 'Type what you want into the address bar.', ': viele Befehle starten sofort, ganz ohne Enter. Welche aktiv sind, entscheidest du.': ': many commands run instantly, without Enter. You decide which are active.',
    'Alle Befehle sehen': 'See all commands',
    'Maustaste halten und einen Buchstaben in die Luft malen. Ein': 'Hold the mouse button and draw a letter in the air. An', 'macht einen Screenshot, der wie ein Sofortbild in die Ecke fliegt. Ein Kreis öffnet deinen Notizzettel zur Seite.': 'takes a screenshot that flies into the corner like a polaroid. A circle opens your note for the page.',
    'Selbst zeichnen': 'Draw it yourself',
    'Musik, die mitkommt': 'Music that comes along',
    'Spotify direkt in Luna: Suche, Warteschlange und Wiedergabe, ohne den Browser zu verlassen. Auf Wunsch gleicht Luna die Lautstärke deines Macs mit deinen Sonos-Lautsprechern ab.': 'Spotify right inside Luna: search, queue and playback without leaving the browser. Luna can also sync your Mac’s volume with your Sonos speakers.',
    'Song abspielen': 'Play a song',
    'KI, wenn du sie willst': 'AI when you want it',
    'läuft komplett auf deinem Mac mit Apples eigener KI, ohne Konto und ohne Schlüssel. Im Luna Chat sprichst du auch mit Modellen von Groq oder OpenRouter. Deine KI-Apps dürfen Tabs steuern, aber nur, wenn du es einschaltest, und mit Touch ID.': 'runs entirely on your Mac with Apple’s own AI, no account, no API key. In Luna Chat you can also talk to models from Groq or OpenRouter. Your AI apps may control tabs, but only if you turn it on, and with Touch ID.',
    'Mit Sira sprechen': 'Talk to Sira',
    'Alles, was ein Browser können muss': 'Everything a browser needs',
    'Tabs und Tabgruppen, Lesezeichen, Verlauf, Downloads, Suche auf der Seite, Zoom, Erweiterungen und eine Sitzung, die auf Wunsch beim nächsten Start wieder da ist. Auf dem WebKit deines Macs, dem Motor hinter Safari.': 'Tabs and tab groups, bookmarks, history, downloads, find on page, zoom, extensions and a session that can be restored on next launch. Built on your Mac’s WebKit, the engine behind Safari.',
    'Tab öffnen': 'Open a tab',
    // Farbwelten
    'Zehn Looks.': 'Ten looks.', 'Ein Klick.': 'One click.', 'Klick eine Farbwelt an. Die ganze Seite färbt sich mit, genau wie Luna.': 'Click a color theme. The whole page changes with it, just like Luna.',
    'Lavendel': 'Lavender', 'Ozean': 'Ocean', 'Minze': 'Mint', 'Wald': 'Forest', 'Pfirsich': 'Peach', 'Kirschblüte': 'Cherry Blossom', 'Arktis': 'Arctic', 'Graphit': 'Graphite',
    // Trailer
    'In 30 Sekunden': 'In 30 seconds', 'Luna im': 'Luna at a', 'Schnelldurchlauf.': 'glance.', 'Trailer abspielen': 'Play trailer', 'Sprache': 'Language',
    // Privatsphäre
    'Privatsphäre': 'Privacy', 'Deine Daten bleiben': 'Your data stays', 'bei dir.': 'with you.',
    'Lokal.': 'Local.', 'Lesezeichen, Verlauf, Notizen und Chats liegen auf deinem Rechner, nirgendwo sonst.': 'Bookmarks, history, notes and chats live on your computer, nowhere else.',
    'Unsichtbar.': 'Invisible.', 'API-Schlüssel werden nie in der Oberfläche angezeigt.': 'API keys are never shown in the interface.',
    'Aus.': 'Off.', 'Der KI-Zugriff für andere Apps ist standardmäßig deaktiviert und braucht Touch ID.': 'AI access for other apps is off by default and requires Touch ID.',
    'Signiert.': 'Signed.', 'Updates kommen geprüft direkt in der App an. Der Quellcode ist offen.': 'Updates arrive verified, right in the app. The source code is open.',
    // Download
    'Hallo,': 'Hello,', 'Kostenlos, offen und in einer Minute installiert.': 'Free, open and installed in a minute.', 'Plattform': 'Platform',
    'Öffne das Terminal, füge diesen Befehl ein und drücke Enter. Luna wird geladen, geprüft und gestartet.': 'Open Terminal, paste this command and press Enter. Luna is downloaded, verified and launched.',
    'Befehl kopieren': 'Copy command', 'Apple Silicon (M1 oder neuer) · macOS 13 oder neuer ·': 'Apple Silicon (M1 or later) · macOS 13 or later ·',
    'Warum ein Terminal-Befehl?': 'Why a Terminal command?',
    'Luna ist noch nicht von Apple notarisiert. Eine im Browser geladene DMG markiert macOS als „aus dem Internet“, und beim Start erscheint eine Warnung. Der Befehl lädt Luna ohne diese Markierung, prüft Prüfsumme und Signatur und verändert keine Sicherheitseinstellungen.': 'Luna is not yet notarized by Apple. A DMG downloaded in a browser is flagged by macOS as “from the internet”, and a warning appears on launch. The command downloads Luna without that flag, verifies checksum and signature, and changes no security settings.',
    'Skript ansehen ↗': 'View script ↗', 'Hast du die DMG doch selbst geladen? Dieser Befehl nimmt nur Luna die Markierung ab:': 'Downloaded the DMG anyway? This command removes the flag from Luna only:',
    'Lade das ZIP, entpacke es vollständig und starte': 'Download the ZIP, extract it completely and launch', '. Den Ordner': '. Keep the', 'daneben lassen.': 'folder next to it.',
    'Für Windows laden': 'Download for Windows', 'Windows 10/11 · x64 · WebView2 wird benötigt ·': 'Windows 10/11 · x64 · WebView2 required ·',
    'Experimentelle Version': 'Experimental version',
    'Die Windows-Version ist eine frühe Testversion: noch instabil und nicht signiert. Windows kann einen unbekannten Herausgeber melden.': 'The Windows version is an early preview: still unstable and unsigned. Windows may report an unknown publisher.',
    'Hinweise zur Windows-Version ↗': 'Windows version notes ↗', 'Alle Versionen & Prüfsummen ↗': 'All releases & checksums ↗', 'Quellcode ↗': 'Source code ↗',
    'Kopiert. Jetzt im Terminal einfügen und Enter drücken.': 'Copied. Paste into Terminal and press Enter.', 'Bitte den markierten Befehl mit ⌘ C kopieren.': 'Please copy the selected command with ⌘ C.',
    // Footer
    'Luna Browser · Ein unabhängiges Projekt für macOS und Windows.': 'Luna Browser · An independent project for macOS and Windows.', 'Sprache wechseln': 'Switch language',
  };
  const t = (text) => (language === 'en' ? (translations[text] || text) : text);
  window.lunaI18n = { language, t };
  document.documentElement.lang = language;
  if (language === 'de') return;
  function translate(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.parentElement?.closest('script,style,pre,code,textarea')) return;
      const text = node.nodeValue.trim(); if (!text) return;
      const translated = t(text);
      if (text !== translated) node.nodeValue = node.nodeValue.replace(text, translated);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      for (const attr of ['aria-label', 'title', 'alt', 'content', 'placeholder']) {
        if (node.hasAttribute(attr)) node.setAttribute(attr, t(node.getAttribute(attr)));
      }
      for (const child of node.childNodes) translate(child);
    }
  }
  translate(document.documentElement);
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') translate(record.target);
      else for (const node of record.addedNodes) translate(node);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  const vid = document.querySelector('#vid'); if (vid) vid.src = 'assets/media/trailer-en.mp4';
  document.querySelectorAll('.vlang button').forEach((b) => b.classList.toggle('on', b.textContent === 'EN'));
})();
