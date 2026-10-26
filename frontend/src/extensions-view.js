import * as api from './api.js';
import { esc } from './ui.js';
import './styles/extensions-page.css';
export function extensionIcon(entry) {
  return /^data:image\/(png|jpeg|gif|webp|x-icon);base64,[A-Za-z0-9+/=]+$/.test(entry.icon || '')
    ? `<img src="${esc(entry.icon)}" alt="">`
    : `<span aria-hidden="true">${esc((entry.name || '＋').slice(0, 1).toUpperCase())}</span>`;
}
export function extensionsHTML(state, pending, busy, message) {
  const entries = state.entries || [],
    disabled = busy || !state.supported ? 'disabled' : '';
  return `<section id="set-extensions" class="ext-page">
    <header class="ext-heading"><div><span class="ext-eyebrow">DEIN LUNA · DEINE EXTRAS</span><h2>Erweiterungen</h2><p>Kleine Helfer. Mehr Möglichkeiten.</p></div><span class="ext-count">${entries.length} installiert</span></header>
    <div class="ext-add"><div class="ext-add-title"><span class="ext-add-symbol" aria-hidden="true">＋</span><div><h3>Etwas Neues hinzufügen</h3><p>Füge einen Link aus dem Chrome Web Store ein.</p></div></div>
      <form id="extension-form"><label class="sr-only" for="extension-source">Chrome-Web-Store-Link oder Erweiterungs-ID</label><div class="ext-source-row"><input id="extension-source" placeholder="Store-Link oder Erweiterungs-ID" ${disabled}><button class="btn pri" ${disabled}>Prüfen <span aria-hidden="true">→</span></button></div></form>
      <div class="ext-import-row"><span>Schon als Datei gespeichert?</span><button class="ext-text-btn" data-extension="import" ${disabled}>ZIP / CRX importieren ↗</button></div>
    </div>
    ${busy || message ? `<div class="ext-feedback" role="status" aria-live="polite">${esc(busy ? 'Einen Moment …' : message)}</div>` : ''}
    ${!state.supported ? `<p class="ext-feedback" role="status">${esc(state.message || 'Erweiterungen werden geladen …')}</p>` : ''}
    ${pending ? `<div class="ext-review"><header><div class="ext-avatar">${extensionIcon(pending)}</div><div><span class="ext-eyebrow">BEREIT ZUR INSTALLATION</span><h3>${esc(pending.name)}</h3><span class="ext-subtle">Version ${esc(pending.version)}</span></div></header><p>Diese Erweiterung benötigt folgende Berechtigungen:</p><ul class="ext-permissions">${pending.permissions.map((p) => `<li>${esc(p)}</li>`).join('') || '<li>Keine zusätzlichen Rechte</li>'}</ul><p class="ext-subtle">Sie kann auf den genannten Webseiten Daten lesen und ändern. Installiere sie nur, wenn du ihr vertraust.</p><div class="ext-review-actions"><button class="btn" data-extension="cancel" ${busy ? 'disabled' : ''}>Abbrechen</button><button class="btn pri" data-extension="install" ${busy ? 'disabled' : ''}>Zugriff erlauben & installieren</button></div></div>` : ''}
    <div class="ext-list-heading"><h3>Deine Erweiterungen <span>${entries.length}</span></h3><button class="ext-text-btn" data-extension="refresh" ${busy ? 'disabled' : ''}>↻ Aktualisieren</button></div>
    ${entries.length ? `<input type="search" id="extension-filter" class="ext-filter" placeholder="Erweiterungen durchsuchen" aria-label="Erweiterungen durchsuchen">` : ''}
    <div class="ext-entries">${entries.map((e) => `<article class="ext-entry" data-ext-name="${esc(e.name.toLocaleLowerCase())}"><div class="ext-avatar">${extensionIcon(e)}</div><div class="ext-entry-copy"><h4>${esc(e.name)}</h4><div class="ext-entry-meta"><span class="ext-state ${e.enabled && !e.error ? 'active' : ''}"><i></i>${e.enabled && !e.error ? 'Aktiv' : 'Inaktiv'}</span><span>Version ${esc(e.version)}</span></div>${e.error ? `<p class="ext-error" role="alert">${esc(e.error)}</p>` : ''}<div class="ext-entry-links"><button class="ext-text-btn" data-extension="open" data-id="${esc(e.id)}" ${busy || !e.enabled || e.error ? 'disabled' : ''}>Steuerung öffnen ↗</button><button class="ext-text-btn ext-remove" data-extension="remove" data-id="${esc(e.id)}" ${busy ? 'disabled' : ''}>Entfernen</button></div></div><button class="ext-toggle ${e.enabled ? 'on' : ''}" data-extension="toggle" data-id="${esc(e.id)}" data-enabled="${e.enabled}" role="switch" aria-checked="${!!e.enabled}" aria-label="${e.enabled ? 'Deaktivieren' : 'Aktivieren'}: ${esc(e.name)}" ${busy ? 'disabled' : ''}><span class="sr-only">${e.enabled ? 'Deaktivieren' : 'Aktivieren'}</span><i></i></button></article>`).join('') || `<div class="ext-empty"><span aria-hidden="true">✧</span><h3>Platz für deine Favoriten</h3><p>Noch keine Erweiterungen installiert.<br>Entdecke ein Extra im Store oder importiere eine Datei.</p></div>`}</div>
    <p class="ext-no-results" hidden>Keine passende Erweiterung gefunden.</p>
    <details class="ext-info"><summary>Gut zu wissen</summary><p>Kompatible WebExtensions laufen auf dem Mac ab macOS 15.4. Einige Chrome-APIs sind nicht auf beiden Plattformen verfügbar. Erweiterungen haben keinen Zugriff auf Lunas Einstellungen oder gespeicherte API-Schlüssel.</p><p>Nach dem Installieren oder Aktivieren betroffene Webseiten neu laden. Für eine neue Version die alte Erweiterung entfernen und das neue Paket importieren. Dabei werden Erweiterungsdaten zurückgesetzt.</p></details>
  </section>`;
}
export function createExtensions({ render, toast, targetTab }) {
  let state = {},
    pending = null,
    busy = false,
    message = '';
  async function refresh() {
    state = await api.extensionsStatus();
    render();
  }
  async function perform(action, id, enabled, source) {
    if (busy) return;
    busy = true;
    message = '';
    render();
    try {
      if (action === 'prepare' || action === 'import') {
        if (pending) await api.extensionCancel(pending.id);
        pending = await api.extensionPrepare(source || '');
        if (!pending?.id) pending = null;
      }
      if (action === 'install') {
        await api.extensionInstall(pending.id);
        pending = null;
        message = 'Installiert. Lade die betroffenen Webseiten neu.';
      }
      if (action === 'cancel') {
        await api.extensionCancel(pending.id);
        pending = null;
      }
      if (action === 'toggle') await api.extensionEnable(id, enabled !== 'true');
      if (action === 'remove') await api.extensionRemove(id);
      if (action === 'open') await api.extensionOpen(id, targetTab());
      state = await api.extensionsStatus();
    } catch (e) {
      message = String(e?.message || e);
      toast(message);
      if (action === 'install') pending = null;
    } finally {
      busy = false;
      render();
    }
  }
  window.addEventListener('luna-extensions-changed', () => refresh().catch(() => {}));
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'extension-filter') return;
    const query = e.target.value.trim().toLocaleLowerCase();
    const rows = [...document.querySelectorAll('#set-extensions .ext-entry')];
    rows.forEach((row) => {
      row.hidden = !row.dataset.extName.includes(query);
    });
    document.querySelector('#set-extensions .ext-no-results').hidden = rows.some(
      (row) => !row.hidden,
    );
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'extension-form') return;
    e.preventDefault();
    const source = document.getElementById('extension-source').value.trim();
    if (source) perform('prepare', null, null, source);
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-extension]');
    if (b && !b.disabled) perform(b.dataset.extension, b.dataset.id, b.dataset.enabled);
  });
  return {
    html: () => extensionsHTML(state, pending, busy, message),
    prepare: (source) => perform('prepare', null, null, source),
    refresh: () => refresh().catch((e) => toast(String(e))),
  };
}
