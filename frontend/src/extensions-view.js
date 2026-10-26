import * as api from './api.js';
import { esc } from './ui.js';
export function extensionsHTML(state, pending, busy, message) {
  return `<section id="set-extensions" class="sp-card"><h2>Erweiterungen</h2>
  <p class="muted">${esc(state.message || 'Erweiterungen werden geladen …')}</p>
  <p class="muted">Auf dem Mac laufen kompatible WebExtensions ab macOS 15.4. Chrome-spezifische Funktionen können fehlen. Erweiterungen erhalten keinen Zugriff auf Lunas Einstellungen oder gespeicherte API-Schlüssel.</p>
  <form id="extension-form"><label for="extension-source">Chrome-Web-Store-Link oder Erweiterungs-ID</label><div class="row"><input id="extension-source" placeholder="https://chromewebstore.google.com/detail/…" style="flex:1;min-width:0" ${busy || !state.supported ? 'disabled' : ''}><button class="btn pri" ${busy || !state.supported ? 'disabled' : ''}>Prüfen</button></div></form>
  <div class="row"><button class="btn" data-extension="import" ${busy || !state.supported ? 'disabled' : ''}>ZIP / CRX importieren</button><button class="btn" data-extension="refresh" ${busy ? 'disabled' : ''}>Aktualisieren</button></div>
  <p role="status" aria-live="polite">${esc(busy ? 'Bitte warten …' : message)}</p>
  ${pending ? `<div class="sp-card"><h3>${esc(pending.name)} <small>${esc(pending.version)}</small></h3><p>Diese Erweiterung fordert folgende Rechte an:</p><ul>${pending.permissions.map((p) => `<li style="overflow-wrap:anywhere">${esc(p)}</li>`).join('') || '<li>Keine zusätzlichen Rechte</li>'}</ul><p>Erweiterungen können auf den genannten Webseiten Daten lesen und ändern. Installiere nur Erweiterungen, denen du vertraust.</p><div class="row"><button class="btn pri" data-extension="install" ${busy ? 'disabled' : ''}>Zugriff erlauben & installieren</button><button class="btn" data-extension="cancel" ${busy ? 'disabled' : ''}>Abbrechen</button></div></div>` : ''}
  <h3>Installiert</h3><div class="bmlist">${(state.entries || []).map((e) => `<div class="bmrow"><div class="t"><b>${esc(e.name)}</b><small>${esc(e.version)} · ${e.enabled && !e.error ? 'Aktiv' : 'Inaktiv'}</small>${e.error ? `<p role="alert">${esc(e.error)}</p>` : ''}</div><button class="btn sm" data-extension="open" data-id="${esc(e.id)}" ${busy || !e.enabled || e.error ? 'disabled' : ''}>Öffnen</button><button class="btn sm" data-extension="toggle" data-id="${esc(e.id)}" data-enabled="${e.enabled}" ${busy ? 'disabled' : ''}>${e.enabled ? 'Deaktivieren' : 'Aktivieren'}</button><button class="btn sm" data-extension="remove" data-id="${esc(e.id)}" ${busy ? 'disabled' : ''}>Entfernen</button></div>`).join('') || '<p class="muted">Noch keine Erweiterungen installiert.</p>'}</div>
  <p class="muted">Nach dem Installieren oder Aktivieren die betroffenen Webseiten neu laden. Für eine neue Version die alte Erweiterung entfernen und das neue Paket importieren. Dabei werden Erweiterungsdaten zurückgesetzt.</p></section>`;
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
