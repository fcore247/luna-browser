import { searchChoicesHTML, copy, providerName } from './search-provider.js';
import { t as l10n, msg as l10nMsg, locale } from './i18n.js';
import { languagePickerHTML } from './i18n.js';
import { createExtensions } from './extensions-view.js';
import { agentMayDeleteAutomatically } from './personalized-permissions.js';
import { personalSettingsHTML } from './personalization.js';
import { WINDOWS } from './platform.js';
import { chatSettingsHTML } from './chat.js';
import { gesturesHTML } from './gestures.js';
import * as api from './api.js';
import { $, esc, hueOf, initial, shownUrl } from './ui.js';
import { colorThemesHTML } from './color-themes.js';
import { commandSettingsHTML } from './command-data.js';
import { settingsWordmark } from './branding.js';
import { mcpSettingsHTML } from './mcp-view.js';
import { sonosSettingsHTML, updateSonosSettings } from './sonos-view.js';
import { spotifySettingsHTML } from './spotify-view.js';
import { allPanels, panelGroups, isPanelHidden } from './sidepanel.js';

export function createSettings({
  state: S,
  currentTab: cur,
  createTab: mkTab,
  activate,
  renderAll,
  themeMode,
  toast,
  onSearchKeyChanged,
}) {
  let personalPagesList = [];
  let vaultInfo = { status: {}, entries: [] };
  const loadVault = () =>
    Promise.all([api.vaultStatus(), api.vaultAll()])
      .then(([status, entries]) => {
        vaultInfo = { status: status || {}, entries: entries || [] };
        if (settingsSection === 'passwords') renderSettingsView();
      })
      .catch(() => {});
  window.addEventListener('luna-vault-changed', loadVault);
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-vault]');
    if (!button || button.disabled) return;
    try {
      if (button.dataset.vault === 'delete')
        await api.vaultDelete(button.dataset.origin, button.dataset.user);
      if (button.dataset.vault === 'delete-all') await api.vaultDeleteAll();
      if (button.dataset.vault === 'offers')
        await api.setPref('vaultOffers', !vaultInfo.status.offers);
      window.dispatchEvent(new Event('luna-vault-changed'));
    } catch (error) {
      toast(String(error?.message || error));
    }
  });
  function vaultSettingsHTML() {
    const { status, entries } = vaultInfo;
    const intro = l10n(
      'Luna speichert Anmeldungen verschlüsselt auf diesem Mac. Den Schlüssel dafür verwahrt der macOS-Schlüsselbund. Ausgefüllt wird nur nach deinem Klick und mit Touch ID, und nur auf genau der Seite, für die du das Passwort gespeichert hast. Deine KI kann Passwörter weder lesen noch ausfüllen. Webseiten und Benutzernamen siehst du in der Liste, Passwörter nie.',
    );
    if (!status.supported)
      return l10nMsg`<section id="set-passwords" class="sp-card"><h2>Passwörter</h2><p class="pp-settings-intro">Der Passwort-Tresor ist auf diesem System noch nicht verfügbar. Es gibt ihn bisher auf dem Mac.</p></section>`;
    const rows = entries
      .map(
        (entry) =>
          l10nMsg`<article class="pp-settings-entry"><div><h3>${esc(entry.origin.replace(/^https?:\/\//, ''))}</h3><p>${esc(entry.username || l10n('Ohne Benutzername'))} · gespeichert am ${esc(new Date(entry.updated * 1000).toLocaleDateString(locale()))}</p></div><div class="pp-settings-actions"><button class="btn sm" data-vault="delete" data-origin="${esc(entry.origin)}" data-user="${esc(entry.username)}">Löschen</button></div></article>`,
      )
      .join('');
    return l10nMsg`<section id="set-passwords" class="sp-card"><h2>Passwörter</h2><p class="pp-settings-intro">${intro}</p>${status.error ? l10nMsg`<p class="muted">Tresor nicht verfügbar: ${esc(status.error)}</p>` : ''}<div class="swrow"><div><b>Nach der Anmeldung fragen, ob Luna das Passwort speichern soll</b><span>${status.offers ? l10n('An: Nach einem Login erscheint ein Schlüssel in der Adressleiste.') : l10n('Aus: Luna fragt nicht mehr nach.')}</span></div><button class="switch ${status.offers ? 'on' : ''}" role="switch" aria-checked="${!!status.offers}" aria-label="Speichern anbieten" data-vault="offers"><i></i></button></div><div class="pp-settings-list">${rows || l10n('<p class="muted">Noch nichts gespeichert. Melde dich auf einer Seite an, dann fragt Luna, ob sie das Passwort speichern soll.</p>')}</div>${entries.length ? l10n('<div class="row"><button class="btn sm" data-vault="delete-all">Alle löschen …</button></div>') : ''}</section>`;
  }
  window.addEventListener('luna-personalized-list', () =>
    api
      .personalizedPages()
      .then((p) => {
        personalPagesList = p || [];
        if (settingsSection === 'personalized') renderSettingsView();
      })
      .catch(() => {}),
  );
  let extensionTarget = -1;
  const extensions = createExtensions({
    render: renderSettingsView,
    toast,
    targetTab: () =>
      S.tabs.some((t) => t.id === extensionTarget && t.mode === 'web')
        ? extensionTarget
        : (S.tabs.find((t) => t.mode === 'web')?.id ?? -1),
  });
  let setMsg = { text: '', kind: '' };
  let mcpStatus = {};
  async function refreshMCPStatus() {
    try {
      mcpStatus = await api.mcpStatus();
      if (settingsSection === 'mcp' && cur()?.mode === 'settings') renderSettingsView();
    } catch (e) {
      toast(String(e));
    }
  }
  let sonosState = {};
  let sonosBusy = false;
  async function refreshSonos() {
    if (sonosBusy) return;
    sonosBusy = true;
    try {
      const next = await api.sonosStatus();
      if (JSON.stringify(next) !== JSON.stringify(sonosState)) {
        sonosState = next;
        updateSonosSettings($('#set-sonos'), sonosState);
      }
    } catch {
      /* Hintergrundabfrage: bei Fehler bleibt die bestehende Ansicht erhalten. */
    } finally {
      sonosBusy = false;
    }
  }
  setInterval(() => {
    if (cur()?.mode === 'settings' && settingsSection === 'spotify') refreshSonos();
  }, 5000);
  let spotifyAccount = {};
  let spotifyStatusBusy = false;
  async function refreshSpotifyAccount() {
    if (spotifyStatusBusy) return;
    spotifyStatusBusy = true;
    try {
      const next = await api.spotifyAPIStatus();
      if (JSON.stringify(next) !== JSON.stringify(spotifyAccount)) {
        spotifyAccount = next;
        if (settingsSection === 'spotify' && cur()?.mode === 'settings') renderSettingsView();
      }
    } catch {
      /* Verbindungsfehler werden bei Aktionen sichtbar */
    } finally {
      spotifyStatusBusy = false;
    }
  }
  setInterval(() => {
    if (cur()?.mode === 'settings' && settingsSection === 'spotify') refreshSpotifyAccount();
  }, 2000);
  let updateState = {};
  async function refreshUpdates() {
    try {
      const next = await api.updateStatus();
      if (JSON.stringify(next) !== JSON.stringify(updateState)) {
        updateState = next;
        if (settingsSection === 'updates' && cur()?.mode === 'settings') renderSettingsView();
      }
    } catch {
      /* Native bridge is unavailable in preview. */
    }
  }
  setInterval(() => {
    if (settingsSection === 'updates' && cur()?.mode === 'settings') refreshUpdates();
  }, 1000);
  document.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-update-action]')?.dataset.updateAction;
    if (!action) return;
    try {
      if (action === 'install') await api.installUpdate();
      if (action === 'check') await api.checkUpdates();
      if (action === 'automatic') await api.setAutomaticUpdates(!updateState.automatic);
      await refreshUpdates();
    } catch (error) {
      toast(String(error));
    }
  });
  let settingsSection = 'look';
  const SET_SECTIONS = [
    ['look', l10n('Darstellung')],
    ['bm', l10n('Lesezeichen')],
    ['panels', l10n('Seitenpanel')],
    ['start', 'Start'],
    ['gestures', l10n('Mausgesten')],
    ['commands', l10n('Befehle')],
    ['search', l10n('Suche')],
    ['spotify', 'Spotify'],
    ['mcp', l10n('KI & MCP')],
    ['extensions', l10n('Erweiterungen')],
    ['personalized', l10n('Personalisierte Seiten')],
    ['passwords', l10n('Passwörter')],
    ['updates', 'Updates'],
    ['data', l10n('Daten')],
  ];
  const SET_ICONS = {
    personalized: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M9 9v11"/>',
    passwords: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3M14 9l2 2"/>',
    extensions:
      '<path d="M8 3h4v3a2 2 0 1 0 4 0V3h4v7h-3a2 2 0 1 0 0 4h3v7H8v-3a2 2 0 1 0-4 0v3H2v-7h3a2 2 0 1 0 0-4H2V3h6z"/>',
    look: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M12 4a8 8 0 0 1 0 16"/>',
    bm: '<path d="M6 4h12v17l-6-4-6 4z"/>',
    panels: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
    start: '<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
    gestures:
      '<path d="M8 12V5a2 2 0 0 1 4 0v6-2a2 2 0 0 1 4 0v2a2 2 0 0 1 4 0v4c0 4-3 6-6 6h-1c-2 0-4-1-5-3l-4-6a2 2 0 0 1 3-2l1 2"/>',
    commands: '<path d="m5 6 6 6-6 6M13 18h6"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    spotify:
      '<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
    mcp: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
    updates: '<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 14-2l1 1M4 17l1 1a8 8 0 0 0 14-2"/>',
    data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  };
  function settingsPageHTML() {
    const th = themeMode();
    const html = l10nMsg`<div class="sp">
    <nav class="sp-nav" aria-label="Einstellungen"><h1 class="settings-heading" aria-label="Einstellungen">${settingsWordmark}</h1><p class="sp-nav-caption">Mach Luna zu deinem Browser.</p>${SET_SECTIONS.map(([id, l], i) => `${i === 0 ? l10n('<span class="sp-nav-group">Dein Luna</span>') : i === 6 ? l10n('<span class="sp-nav-group">Verbindungen</span>') : i === 9 ? '<span class="sp-nav-group">System</span>' : ''}<button class="${id === settingsSection ? 'on' : ''}" ${id === settingsSection ? 'aria-current="page"' : ''} data-act="set-nav" data-s="${id}"><span class="sp-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${SET_ICONS[id]}</svg></span><span>${l}</span><span class="sp-nav-arrow" aria-hidden="true">›</span></button>`).join('')}</nav>
    <div class="sp-main">
      <section id="set-look" class="sp-card"><h2>Darstellung</h2>
        <div class="language-setting">${languagePickerHTML()}<p class="muted">${l10n('Du kannst die Sprache später in den Einstellungen ändern.')}</p></div>
        <p class="muted">Hell, Dunkel oder passend zum System. Webseiten folgen dem Erscheinungsbild.</p>
        <div class="themes">${[
          ['auto', l10n('Automatisch')],
          ['light', l10n('Hell')],
          ['dark', l10n('Dunkel')],
        ]
          .map(
            ([k, l]) =>
              `<button class="theme ${th === k ? 'on' : ''}" data-act="theme" data-m="${k}"><span class="tp tp-${k}"><i></i><i></i><i></i></span><b>${l}</b></button>`,
          )
          .join('')}</div>
        ${colorThemesHTML()}
        ${personalSettingsHTML()}
        <div class="swrow"><div><b>Lesezeichenleiste anzeigen</b><span>${S.bar ? l10n('Die Leiste unter der Adressleiste ist sichtbar.') : l10n('Aus: Lesezeichen findest du weiter in der Seitenleiste und auf der Startseite.')}</span></div>
          <button class="switch ${S.bar ? 'on' : ''}" role="switch" aria-checked="${S.bar}" aria-label="Lesezeichenleiste anzeigen" data-act="pref-bar"><i></i></button></div>
      </section>
      <section id="set-bm" class="sp-card"><h2>Lesezeichen</h2>
        <div class="bmlist">${S.bookmarks.length ? S.bookmarks.map((b) => l10nMsg`<div class="bmrow" data-bm="${esc(b.url)}"><i class="dot" style="--h:${hueOf(b.title)}">${esc(initial(b.title))}</i><div class="t"><b>${esc(b.title)}</b><small>${esc(shownUrl(b.url))}</small></div><button class="btn sm" data-act="bm-edit" data-url="${esc(b.url)}">Bearbeiten</button><button class="btn sm" data-act="bm-del" data-url="${esc(b.url)}">Löschen</button></div>`).join('') : l10n('<p class="muted">Noch keine Lesezeichen.</p>')}</div>
        <div class="row"><button class="btn pri" data-act="bm-add">+ Lesezeichen hinzufügen</button></div>
      </section>
      <section id="set-panels" class="sp-card"><h2>Seitenpanel</h2>
        <p class="muted">Erstelle eigene Menüs und ordne Bereiche zu. Menüs können weitere Menüs enthalten. Ausblenden entfernt nur den Navigationseintrag – Gesten und Tastenkürzel bleiben aktiv.</p>
        <form id="panelGroupForm" class="groupCreate"><input id="groupName" maxlength="60" placeholder="Zum Beispiel Arbeit oder Freizeit" aria-label="Name des neuen Menüs" required><button class="btn pri" type="submit">Menü erstellen</button></form>
        <div class="bmlist">${allPanels()
          .map(
            (
              p,
              i,
              arr,
            ) => l10nMsg`<div class="bmrow"><i class="pico">${'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + p.icon + '</svg>'}</i><div class="t"><b>${esc(p.title)}</b><small>${esc(p.desc || (p.custom ? l10n('Eigenes Menü') : ''))}</small><label class="groupAssignment">In Menü<select data-panel-parent="${esc(p.id)}" aria-label="Menü für ${esc(p.title)}"><option value="">Hauptebene</option>${panelGroups()
              .filter((g) => g.id !== p.id)
              .map(
                (g) =>
                  `<option value="${esc(g.id)}" ${p.parent === g.id ? 'selected' : ''}>${esc(g.title)}</option>`,
              )
              .join(
                '',
              )}</select></label>${p.custom ? l10nMsg`<div class="groupRename"><input data-group-name="${esc(p.id)}" aria-label="Menü umbenennen" maxlength="60" value="${esc(p.title)}"><button class="btn sm" data-act="group-rename" data-id="${esc(p.id)}">Speichern</button><button class="btn sm" data-act="group-delete" data-id="${esc(p.id)}">Auflösen</button></div>` : ''}</div>
          <button class="ia" data-act="spp-up" data-id="${esc(p.id)}" aria-label="Nach oben" title="Nach oben" ${i === 0 ? 'disabled' : ''}>▲</button><button class="ia" data-act="spp-down" data-id="${esc(p.id)}" aria-label="Nach unten" title="Nach unten" ${i === arr.length - 1 ? 'disabled' : ''}>▼</button>
          <button class="switch ${isPanelHidden(p.id) ? '' : 'on'}" role="switch" aria-checked="${!isPanelHidden(p.id)}" aria-label="${esc(p.title)} anzeigen" data-act="spp-toggle" data-id="${esc(p.id)}"><i></i></button></div>`,
          )
          .join('')}</div>
        <div class="row"><button class="btn" data-act="spp-reset">Zurücksetzen</button></div>
      </section>
      <section id="set-start" class="sp-card"><h2>Start</h2>
        <div class="swrow"><div><b>Zuletzt geöffnete Seiten merken</b><span>${S.restore ? l10n('Beim nächsten Start öffnen sich die Tabs von zuletzt.') : l10n('Aus: Der Browser startet immer mit der Startseite.')}</span></div>
          <button class="switch ${S.restore ? 'on' : ''}" role="switch" aria-checked="${S.restore}" aria-label="Zuletzt geöffnete Seiten merken" data-act="pref-restore"><i></i></button></div>
      </section>
      ${gesturesHTML(S.gesture)}
      ${commandSettingsHTML()}
      <section id="set-search" class="sp-card"><h2>${copy('Deine Suche', 'Your search')}</h2>
        <p class="muted">${copy('Luna Search, genau wie du es möchtest. Tavily wird zuerst empfohlen.', 'Luna Search, your way. Tavily is our first recommendation.')}</p>
        ${searchChoicesHTML({ tavily: S.tavilySearch, google: S.googleSearch, scope: 'settings' })}
        <button class="btn" data-act="setup">${copy('Geführte Einrichtung öffnen', 'Open guided setup')}</button>
        <div class="search-settings-caption">${S.tavilySearch ? copy('Tavily: gratis starten mit 1.000 Credits pro Monat, ohne Kreditkarte. Eine einfache Suche kostet 1 Credit. Ein Konto und API-Key sind nötig.', 'Tavily: start free with 1,000 credits per month, no credit card. One basic search uses 1 credit. An account and API key are required.') : copy('Brave Search: verbinde deinen eigenen API-Key. Es gelten die Tarife deines Anbieters.', 'Brave Search: connect your own API key. Your provider’s pricing applies.')}</div>
        <h3>${providerName(S.tavilySearch)} API-Key</h3>
        <div class="state ${S.hasKey ? 'ok' : ''}">${S.hasKey ? copy('Key sicher gespeichert ✓', 'Key stored securely ✓') : copy('Noch kein Key gespeichert', 'No key saved yet')}</div>
        <input id="keyIn" type="password" placeholder="${S.hasKey ? copy('Neuen Key zum Ersetzen einfügen', 'Paste a new key to replace it') : S.tavilySearch ? 'tvly-…' : copy('Brave-API-Key einfügen', 'Paste your Brave API key')}" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="${providerName(S.tavilySearch)} API-Key">
        <div class="row"><button class="btn pri" data-act="key-save">${copy('Speichern', 'Save')}</button><button class="btn" data-act="key-test" ${S.hasKey ? '' : 'disabled'}>${copy('Verbindung testen', 'Test connection')}</button><button class="btn" data-act="key-clear" ${S.hasKey ? '' : 'disabled'}>${copy('Entfernen', 'Remove')}</button><button class="btn" data-act="open-brave">${copy('API-Key holen ↗', 'Get an API key ↗')}</button></div>
        <div id="keyMsg" class="kmsg ${setMsg.kind}">${esc(setMsg.text)}</div>
        <p class="muted small">${copy('Tavily- und Brave-Keys werden getrennt gespeichert. Dein Key wird nur an den ausgewählten Anbieter gesendet.', 'Tavily and Brave keys are stored separately. Your key is sent only to the selected provider.')}</p>
      </section>
      ${spotifySettingsHTML(spotifyAccount, S.autoNextAlways)}
      ${sonosSettingsHTML(sonosState)}
      ${chatSettingsHTML()}
      ${mcpSettingsHTML(mcpStatus)}
      ${extensions.html()}
      <section id="set-personalized" class="sp-card"><h2>Personalisierte Seiten</h2><p class="pp-settings-intro">Deine Ansichten für echte Webseiten. Eine verbundene KI liest zuerst die Originalseite und holt Lunas Designleitfaden. Die KI kombiniert fertige Luna-Bausteine wie Kennzahlen, Diagramme, Tabellen und Tabs. Die Ansicht passt sich deinem Browserdesign an und liest Inhalte aus der Originalseite. Der Schalter „Luna“ in der Adressleiste schaltet alle Ansichten einer Domain gemeinsam aus oder wieder an.</p><div class="pp-settings-list">${(personalPagesList || []).map((page) => l10nMsg`<article class="pp-settings-entry"><div><h3>${esc(page.title)}</h3><p>${esc(page.url)}</p><p>${page.enabled ? l10n('Aktiv') : l10n('Deaktiviert')} · ${page.scope === 'site' ? l10n('Gesamte Website') : l10n('Diese Unterseite')} · ${page.fields.length} Bausteine</p></div><div class="pp-settings-actions"><button class="btn sm" data-personal-page="open" data-id="${esc(page.id)}">Öffnen</button><button class="btn sm" data-personal-page="toggle" data-id="${esc(page.id)}">${page.enabled ? l10n('Deaktivieren') : l10n('Aktivieren')}</button><button class="btn sm" data-personal-page="remove" data-id="${esc(page.id)}">Entfernen</button></div></article>`).join('') || l10n('<p class="muted">Noch keine personalisierten Seiten. Bitte deine KI zum Beispiel: „Baue mir eine persönliche Wetteransicht für wetteronline.de.“</p>')}</div><div class="swrow"><div><b>Mein Agent darf Ansichten automatisch löschen</b><span>${agentMayDeleteAutomatically() ? l10n('An: Dein Agent löscht personalisierte Seiten ohne Nachfrage.') : l10n('Aus: Luna fragt dich, bevor dein Agent eine Ansicht löscht.')}</span></div><button class="switch ${agentMayDeleteAutomatically() ? 'on' : ''}" role="switch" aria-checked="${agentMayDeleteAutomatically()}" aria-label="Agent darf Ansichten automatisch löschen" data-act="pp-agent-auto-delete"><i></i></button></div></section>
      ${vaultSettingsHTML()}
      <section id="set-updates" class="sp-card"><h2>Updates</h2>
        <div class="swrow"><div><b>Luna Browser ${esc(updateState.version || '')}</b><span>Updates direkt aus unseren GitHub Releases.</span></div><span class="muted">${WINDOWS ? l10n('Windows · experimentell / instabil') : 'macOS'}</span></div>
        <div class="swrow"><div><b>Automatische Updates</b><span>Einmal täglich prüfen und Updates automatisch laden. Luna meldet sich leise mit einem Punkt am Menü, wenn eines bereit ist.</span></div><button class="btn" role="switch" aria-label="Automatische Updates" aria-checked="${!!updateState.automatic}" data-update-action="automatic" ${!updateState.ready ? 'disabled' : ''}>${updateState.automatic ? l10n('Ein') : l10n('Aus')}</button></div>
        <p role="status">${esc(l10n(updateState.message) || l10n('Update-Status wird geladen …'))}</p>
        <p class="muted small">${updateState.lastCheck ? l10n('Zuletzt geprüft: ') + esc(new Date(updateState.lastCheck * 1000).toLocaleString(locale())) : l10n('Noch keine Prüfung durchgeführt.')}</p>
        ${updateState.installReady ? l10nMsg`<button class="btn pri" data-update-action="install">Jetzt neu starten · Version ${esc(updateState.pendingVersion || '')}</button>` : ''}
        <button class="btn ${updateState.installReady ? '' : 'pri'}" data-update-action="check" ${!updateState.canCheck ? 'disabled' : ''}>Nach Updates suchen</button>
        <p class="muted small">Downloads werden vor der Installation anhand ihrer digitalen Update-Signatur geprüft.</p>
      </section>
      <section id="set-data" class="sp-card"><h2>Daten</h2>
        <div class="swrow"><div><b>Browser zurücksetzen</b><span>Farben, Seitenleiste, Mausgesten und Browser-Einstellungen auf Standard setzen. Die Ersteinrichtung beginnt erneut. Lesezeichen, Verlauf, Notizen, Chats, Schlüssel und Website-Anmeldungen bleiben erhalten.</span></div><button class="btn danger" data-act="reset-browser">Zurücksetzen …</button></div>
        <div class="swrow"><div><b>Verlauf</b><span>Besuchte Seiten und Suchen auf diesem Gerät.</span></div><button class="btn" data-act="clear-history">Löschen</button></div>
        <div class="swrow"><div><b>Download-Liste</b><span>Entfernt nur die Liste, nicht die Dateien.</span></div><button class="btn" data-act="clear-dl">Leeren</button></div>
      </section>
    </div></div>`;
    // Nur das gewählte Kapitel kommt in den DOM, kein Scrollen zu anderen Kapiteln.
    return html.replace(/<section id="set-([^"]+)"[\s\S]*?<\/section>/g, (section, id) =>
      id === settingsSection ||
      (id === 'sonos' && settingsSection === 'spotify') ||
      (id === 'chat' && settingsSection === 'mcp')
        ? section
        : '',
    );
  }
  function renderSettingsView() {
    const t = cur(),
      el = $('#settingsView');
    const show = !!t && t.mode === 'settings';
    el.hidden = !show;
    if (!show) return;
    const top = el.scrollTop,
      typed = $('#keyIn')?.value || '',
      spotifyTyped = $('#spotifyClientID')?.value || '',
      chatTyped = $('#chatAPIKey')?.value || '';
    const chatFocused = document.activeElement?.id === 'chatAPIKey';
    const spotifyFocused = document.activeElement?.id === 'spotifyClientID';
    el.innerHTML = settingsPageHTML();
    el.querySelectorAll('select').forEach((select) => {
      const shell = document.createElement('span');
      shell.className = 'settings-select';
      select.before(shell);
      shell.append(select);
      shell.insertAdjacentHTML(
        'beforeend',
        '<svg class="settings-select-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>',
      );
    });
    el.scrollTop = top;
    if ($('#spotifyClientID')) {
      $('#spotifyClientID').value = spotifyTyped;
      if (spotifyFocused) $('#spotifyClientID').focus();
    }
    if ($('#chatAPIKey')) {
      $('#chatAPIKey').value = chatTyped;
      if (chatFocused) $('#chatAPIKey').focus();
    }
    if (typed && $('#keyIn')) $('#keyIn').value = typed;
  }
  // Öffnet die Einstellungen in einem eigenen Tab (vorhandener Tab wird wiederverwendet).
  function openSettings(msg, kind) {
    if (msg !== undefined) setMsg = { text: msg, kind: kind || '' };
    let t = S.tabs.find((x) => x.mode === 'settings');
    if (!t) {
      t = mkTab(S.next++, 'settings:');
      t.mode = 'settings';
      t.title = l10n('Einstellungen');
      S.tabs.push(t);
    }
    if (S.active !== t.id) activate(t.id);
    else renderAll();
  }
  function keyMsg(text, kind) {
    setMsg = { text, kind: kind || '' };
    const m = $('#keyMsg');
    if (m) {
      m.textContent = text;
      m.className = 'kmsg ' + (kind || '');
    }
  }
  async function testKey() {
    keyMsg(l10n('Teste …'));
    try {
      await api.keyTest();
      keyMsg(copy('Verbindung funktioniert ✓', 'Connection works ✓'), 'ok');
    } catch (e) {
      keyMsg(String(e?.message || e), 'err');
    }
  }
  async function saveKey() {
    const i = $('#keyIn');
    const v = i ? i.value.trim() : '';
    if (!v) {
      keyMsg(l10n('Bitte zuerst einen Schlüssel einfügen.'), 'err');
      return;
    }
    try {
      await api.keySet(v);
    } catch (e) {
      keyMsg(String(e?.message || e), 'err');
      return;
    }
    i.value = '';
    S.hasKey = true;
    setMsg = { text: l10n('Gespeichert. Teste …'), kind: '' };
    renderSettingsView();
    await testKey();
    onSearchKeyChanged();
  }

  return {
    renderSettingsView,
    prepareExtension: (source) => extensions.prepare(source),
    openSettings,
    keyMsg,
    testKey,
    saveKey,
    refreshMCPStatus,
    refreshSonos,
    refreshSpotifyAccount,
    get section() {
      return settingsSection;
    },
    set section(value) {
      if (value === 'extensions' && cur()?.mode === 'web') extensionTarget = cur().id;
      settingsSection = value === 'chat' ? 'mcp' : value === 'input' ? 'gestures' : value;
      if (settingsSection === 'updates') refreshUpdates();
      if (settingsSection === 'extensions') extensions.refresh();
      if (settingsSection === 'passwords') loadVault();
      if (settingsSection === 'personalized')
        api
          .personalizedPages()
          .then((p) => {
            personalPagesList = p || [];
            renderSettingsView();
          })
          .catch(() => {});
    },
    get mcp() {
      return mcpStatus;
    },
    set mcp(value) {
      mcpStatus = value;
    },
    get sonos() {
      return sonosState;
    },
    set sonos(value) {
      sonosState = value;
    },
    set message(value) {
      setMsg = value;
    },
  };
}
