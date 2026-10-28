import { t as l10n, msg as l10nMsg, getLanguage } from './i18n.js';
import { WINDOWS, shortcut } from './platform.js';
// Befehle der Adressleiste: Beschreibung, Demo und der Schalter, mit dem jeder einzeln an- oder ausgeschaltet wird.
import { esc } from './ui.js';

export const COMMANDS = [
  {
    id: 'spotify',
    word: 'spotify',
    title: l10n('Spotify durchsuchen'),
    text: l10n(
      'Tippe spotify und danach einen Suchbegriff. Songs, Künstler und Alben erscheinen direkt in Luna.',
    ),
    demo: 'spotify daft punk',
    result: l10n('Top-Treffer · Songs · Künstler · Alben'),
    hint: l10n('Enter ist nicht nötig, die Suche startet von selbst.'),
    action: { fill: 'spotify ' },
  },
  {
    id: 'play',
    word: 'play',
    title: l10n('Song sofort abspielen'),
    text: l10n(
      'play und ein Songname, dann Enter. Luna sucht den besten Treffer und übergibt ihn an die Spotify-App.',
    ),
    demo: 'play bohemian rhapsody',
    result: l10n('▶ Wiedergabe an Spotify übergeben'),
    hint: l10n('Esc beendet den Play-Modus.'),
    action: { fill: 'play ' },
  },
  {
    id: 'theme',
    word: 'theme',
    title: l10n('Farbwelt wählen'),
    text: l10n(
      'Die Eingabeleiste wächst nach unten und zeigt alle Themes. Ein Klick färbt Luna sofort um.',
    ),
    demo: 'theme',
    result: 'swatches',
    hint: l10n('Auch Hell, Dunkel und Auto lassen sich dort umschalten.'),
    action: { run: 'theme' },
  },
  {
    id: 'chat',
    word: 'chat',
    title: l10n('Luna Chat öffnen'),
    text: l10n('Sobald du chat getippt hast, öffnet sich der Chat. Auch hier ohne Enter.'),
    demo: 'chat',
    result: l10n('Luna Chat öffnet sich …'),
    hint: l10n('Frag Luna etwas oder lass sie den Browser bedienen.'),
    action: { run: 'chat' },
  },
  {
    id: 'tab',
    word: 'tab',
    title: l10n('Tabs steuern'),
    text: l10n(
      'tab list, tab open youtube.com, tab close, tab reload, tab zoom 120 oder tab close youtube.com. Mit Enter ausführen.',
    ),
    demo: 'tab open youtube.com',
    result: l10n('Neuer Tab · youtube.com'),
    hint: l10n('tab close youtube.com schließt alle Tabs dieser Seite.'),
    action: { fill: 'tab ' },
  },
  {
    id: 'settings',
    word: getLanguage() === 'en' ? 'settings' : 'einstellungen',
    title: l10n('Einstellungen öffnen'),
    text: l10n(
      'Luna fragt kurz nach, ob du die Einstellungen öffnen möchtest, statt im Web zu suchen.',
    ),
    demo: getLanguage() === 'en' ? 'settings' : 'einstellungen',
    result: l10n('Einstellungen öffnen?'),
    hint: l10nMsg`Auch mit ${shortcut('⌘ ,')} erreichbar.`,
    action: { run: 'einstellungen' },
  },
  {
    id: 'sites',
    word: 'google · youtube',
    title: l10n('Direkt zu einer Seite'),
    text: l10n(
      'Tippe google oder youtube und eine Sekunde später bist du dort. Weitertippen, etwa „google maps“, funktioniert weiter.',
    ),
    demo: 'youtube',
    result: l10n('youtube.com wird geöffnet'),
    hint: l10n('Eine kurze Tipp-Pause löst den Sprung aus.'),
    action: { run: 'youtube' },
  },
];

const KEY = 'luna-commands-off';
function disabledIds() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
// Ist ein Befehl ausgeschaltet, behandelt Luna das Wort wie eine normale Eingabe.
export const commandOn = (id) => !disabledIds().includes(id);
export function setCommandOn(id, on) {
  const off = new Set(disabledIds());
  if (on) off.delete(id);
  else off.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...off]));
  } catch {
    /* ohne Speicher: gilt bis zum Neuladen nicht */
  }
  window.dispatchEvent(new CustomEvent('luna-commands-changed', { detail: { id, on } }));
}
export function setAllCommands(on) {
  try {
    localStorage.setItem(KEY, JSON.stringify(on ? [] : COMMANDS.map((c) => c.id)));
  } catch {
    /* siehe oben */
  }
  window.dispatchEvent(new CustomEvent('luna-commands-changed', { detail: { all: true, on } }));
}

// Der Schalter: grün = an, rot = aus. Der Rahmen der Karte folgt dem Zustand.
export function commandSwitchHTML(c, withAct = false) {
  const on = commandOn(c.id);
  return `<button type="button" class="cmd-switch" role="switch" aria-checked="${on}" aria-label="${esc(c.word)} ${on ? 'ausschalten' : 'einschalten'}" data-toggle="${c.id}" ${withAct ? `data-act="cmd-toggle" data-id="${c.id}"` : ''}><span class="cmd-switch-label">${on ? l10n('An') : l10n('Aus')}</span><i></i></button>`;
}
export function commandSettingsHTML() {
  const count = COMMANDS.filter((c) => commandOn(c.id)).length;
  return l10nMsg`<section id="set-commands" class="sp-card"><h2>Befehle</h2>
    <p class="muted">Befehle sind Wörter, die du in die Adressleiste tippst und die Luna direkt versteht. Jeder lässt sich einzeln ein- oder ausschalten: Ein ausgeschalteter Befehl wird wie eine normale Eingabe behandelt. Klicke eine Karte an, um sie umzuschalten.</p>
    <div class="cmd-set-head"><span class="cmd-count">${count} von ${COMMANDS.length} Befehlen aktiv</span><span class="cmd-set-actions"><button class="btn sm" data-act="cmd-all" data-on="1">Alle an</button><button class="btn sm" data-act="cmd-all" data-on="0">Alle aus</button><button class="btn sm pri" data-act="cmd-page">Befehle ansehen</button></span></div>
    <div class="cmd-set-grid">${COMMANDS.map(
      (c) =>
        `<div class="cmd-set-card ${commandOn(c.id) ? 'on' : 'off'}" data-act="cmd-toggle" data-id="${c.id}"><div class="cmd-set-top"><span class="cmd-word">${esc(c.word)}</span>${commandSwitchHTML(c, true)}</div><b>${esc(c.title)}</b><span class="muted small">${esc(c.text)}</span></div>`,
    ).join('')}</div>
  </section>`;
}
