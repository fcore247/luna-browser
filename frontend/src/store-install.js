import { t as l10n, msg as l10nMsg } from './i18n.js';
import * as api from './api.js';
import { esc } from './ui.js';
import './styles/store-install.css';

export function storeExtensionID(input) {
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && url.host === 'chromewebstore.google.com'
      ? url.pathname.match(/^\/detail\/(?:[^/]+\/)?([a-p]{32})\/?$/)?.[1] || ''
      : '';
  } catch {
    return '';
  }
}
const raster = (value) =>
  /^data:image\/(png|jpeg|gif|webp|x-icon);base64,[A-Za-z0-9+/=]+$/.test(value || '') ? value : '';
const levelOf = (entry) =>
  entry?.compatibilityLevel ||
  (entry?.unsupported
    ? 'unsupported'
    : entry?.compatibility
      ? 'limited'
      : entry
        ? 'clear'
        : 'checking');
const levelLabel = (level) =>
  ({
    clear: l10n('Keine bekannten Probleme'),
    limited: l10n('Eingeschränkt kompatibel'),
    unsupported: l10n('Nicht kompatibel'),
    checking: l10n('Kompatibilität wird geprüft'),
    unknown: l10n('Prüfung nicht möglich'),
  })[level] || l10n('Kompatibilität unbekannt');

export function createStoreInstall({ currentTab, showNative, toast }) {
  const root = document.createElement('div');
  root.id = 'storeDetailView';
  root.hidden = true;
  document.getElementById('page').append(root);
  const anchor = document.getElementById('bStoreInstall');
  const originals = new Set(),
    pages = new Map();
  let state = null;
  const identity = (tab) =>
    tab?.mode === 'web' && storeExtensionID(tab.url)
      ? `${tab.id}:${storeExtensionID(tab.url)}`
      : '';
  const owns = (tab) => !!identity(tab) && !originals.has(identity(tab));
  const current = (task) =>
    state === task && identity(currentTab()) === task.key && owns(currentTab());
  function dispose() {
    const previous = state;
    state = null;
    if (previous?.pending && previous.phase !== 'installing' && previous.phase !== 'installed')
      api.extensionCancel(previous.pending.id).catch(() => {});
  }
  function original(task, failed = false) {
    if (!current(task)) return;
    originals.add(task.key);
    dispose();
    root.hidden = true;
    if (failed)
      toast(l10n('Store-Details konnten nicht geladen werden. Die Originalseite wird geöffnet.'));
    showNative(currentTab().id);
    update(currentTab());
  }
  function render() {
    if (!state) return;
    const task = state,
      entry = task.pending,
      page = task.page;
    const name = entry?.name || page?.name || l10n('Erweiterung wird geladen …');
    const icon = raster(entry?.icon) || raster(page?.icon);
    const images = (page?.screenshots || []).map(raster).filter(Boolean);
    const level = task.error ? 'unknown' : levelOf(entry);
    const busy = task.phase === 'checking' || task.phase === 'installing';
    const blocked = entry?.unsupported;
    const title =
      task.phase === 'installed'
        ? l10n('Installiert ✓')
        : blocked
          ? l10n('Nicht kompatibel')
          : task.phase === 'installing'
            ? l10n('Wird installiert …')
            : task.error
              ? l10n('Erneut prüfen')
              : task.phase === 'checking'
                ? l10n('Wird geprüft …')
                : task.phase === 'review'
                  ? l10n('Zugriff erlauben & installieren')
                  : l10n('In Luna installieren');
    const permissions =
      (entry?.permissions || []).map((p) => `<li>${esc(p)}</li>`).join('') ||
      l10n('<li>Keine zusätzlichen Rechte</li>');
    const scroll = root.scrollTop;
    root.innerHTML = l10nMsg`<main id="storeInstallDrop" class="store-detail">
      <nav class="store-detail-nav"><span>LUNA EXTRAS <span aria-hidden="true">/</span> CHROME WEB STORE</span><button type="button" data-store-original>Original im Chrome Web Store öffnen ↗</button></nav>
      <header class="store-detail-hero"><div class="store-detail-icon">${icon ? `<img src="${esc(icon)}" alt="">` : '<span aria-hidden="true">✧</span>'}</div><div><span class="store-detail-eyebrow">MEHR MÖGLICHKEITEN FÜR DEINEN BROWSER</span><h1>${esc(name)}</h1><p>${entry ? l10nMsg`Version ${esc(entry.version)} · Paket und Signatur geprüft` : l10n('Luna bereitet die Informationen für dich auf.')}</p></div></header>
      <div class="store-detail-layout"><div class="store-detail-main">
        <section class="store-gallery" aria-label="Screenshots der Erweiterung">${images.length ? l10nMsg`<div class="store-gallery-stage"><img src="${esc(images[task.image || 0] || images[0])}" alt="Screenshot ${(task.image || 0) + 1} von ${esc(name)}"></div><div class="store-gallery-thumbs">${images.map((src, i) => l10nMsg`<button type="button" data-store-image="${i}" aria-label="Screenshot ${i + 1} anzeigen" aria-pressed="${i === (task.image || 0)}"><img src="${esc(src)}" alt=""></button>`).join('')}</div>` : `<div class="store-gallery-empty"><span aria-hidden="true">✧</span><p>${page ? l10n('Für diese Erweiterung sind keine Vorschaubilder verfügbar.') : l10n('Vorschaubilder werden geladen …')}</p></div>`}</section>
        <section class="store-description"><span class="store-detail-eyebrow">DAS KANN DIE ERWEITERUNG</span><h2>Über ${esc(name)}</h2><p>${esc(page?.description || l10n('Beschreibung wird aus dem Chrome Web Store geladen …'))}</p></section>
      </div><aside class="store-detail-aside">
        <section class="store-install-card"><span class="store-detail-eyebrow">IN DEINEM LUNA</span><h2>${task.phase === 'installed' ? l10n('Bereit für dich.') : l10n('Passt sie zu dir?')}</h2><span class="store-compatibility" data-level="${esc(level)}" role="status" aria-live="polite">${esc(levelLabel(level))}</span><p class="store-check-description">${esc(task.error || entry?.compatibility || (entry ? l10n('Die Manifestprüfung hat keine bekannten Kompatibilitätsprobleme gefunden.') : l10n('Luna lädt das Paket zur Prüfung. Es wird nichts installiert oder ausgeführt.')))}</p><p class="store-check-limit">Manifestprüfung · keine Garantie für alle Funktionen</p>
        ${task.phase === 'review' ? l10nMsg`<div class="store-review" role="group" aria-label="Berechtigungen bestätigen"><h3>Diese Zugriffe erlauben?</h3><ul class="store-permissions">${permissions}</ul><p>Die Erweiterung kann auf den genannten Seiten Daten lesen und ändern. Installiere sie nur, wenn du ihr vertraust.</p><button type="button" class="store-cancel" data-store-cancel>Abbrechen</button></div>` : ''}
        <button type="button" class="store-install-primary" data-store-confirm ${busy || blocked || task.phase === 'installed' ? 'disabled' : ''}>${esc(title)}</button><p class="store-install-note">${task.phase === 'installed' ? l10n('Lade die betroffenen Webseiten neu, um die Erweiterung zu verwenden.') : l10n('Du entscheidest vor der Installation über die Berechtigungen.')}</p></section>
        <section class="store-permissions-card"><h2>Berechtigungen</h2>${entry ? `<ul>${permissions}</ul>` : l10n('<p>Werden aus dem geprüften Paket ermittelt …</p>')}</section>
      </aside></div></main>`;
    root.scrollTop = scroll;
  }
  async function prepare(task) {
    task.phase = 'checking';
    task.error = '';
    render();
    try {
      const pending = await api.extensionPrepare(task.url);
      if (!current(task)) {
        if (pending?.id) await api.extensionCancel(pending.id);
        return;
      }
      if (!pending?.id) throw new Error(l10n('Die Kompatibilität konnte nicht geprüft werden.'));
      task.pending = pending;
      task.phase = 'ready';
      render();
    } catch (error) {
      if (current(task)) {
        task.phase = 'error';
        task.error = String(error?.message || error);
        render();
      }
    }
  }
  async function loadPage(task) {
    try {
      const page = pages.get(task.id) || (await api.extensionStorePage(task.url));
      if (!current(task)) return;
      if (!page?.name || !page.description || page.id !== task.id)
        throw new Error(l10n('Ungültige Store-Details'));
      if (pages.size > 8) pages.delete(pages.keys().next().value);
      pages.set(task.id, page);
      task.page = page;
      render();
    } catch {
      original(task, true);
    }
  }
  function update(tab) {
    const key = identity(tab);
    anchor.hidden = !key || owns(tab);
    anchor.setAttribute('aria-expanded', 'false');
    if (!owns(tab)) {
      if (state) {
        dispose();
        root.hidden = true;
        showNative(tab?.mode === 'web' ? tab.id : -1);
      }
      if (key) {
        anchor.querySelector('span:last-child').textContent = l10n('Luna-Ansicht');
        anchor.title = l10n('Erweiterung in Luna ansehen');
      }
      return;
    }
    if (state?.key === key) return;
    dispose();
    const task = { key, id: storeExtensionID(tab.url), url: tab.url, phase: 'checking', image: 0 };
    state = task;
    root.hidden = false;
    root.scrollTop = 0;
    showNative(-1);
    render();
    loadPage(task);
    prepare(task);
  }
  root.addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button || button.disabled || !state) return;
    const task = state;
    if (button.hasAttribute('data-store-original')) return original(task);
    if (button.hasAttribute('data-store-image')) {
      task.image = Number(button.dataset.storeImage);
      render();
      return;
    }
    if (button.hasAttribute('data-store-cancel')) {
      task.phase = 'ready';
      render();
      return;
    }
    if (!button.hasAttribute('data-store-confirm') || !current(task)) return;
    if (task.phase === 'error') {
      if (task.pending) await api.extensionCancel(task.pending.id);
      task.pending = null;
      return prepare(task);
    }
    if (!task.pending || task.pending.unsupported) return;
    if (task.phase === 'ready') {
      task.phase = 'review';
      render();
      root.querySelector('[data-store-confirm]')?.focus();
      return;
    }
    if (task.phase !== 'review') return;
    task.phase = 'installing';
    render();
    try {
      await api.extensionInstall(task.pending.id);
      if (current(task)) {
        task.phase = 'installed';
        render();
      }
      toast(l10nMsg`${task.pending.name} wurde installiert. Lade die Webseite neu.`);
      window.dispatchEvent(new Event('luna-extensions-changed'));
    } catch (error) {
      if (current(task)) {
        task.phase = 'error';
        task.error = String(error?.message || error);
        render();
      }
    }
  });
  anchor.addEventListener('click', () => {
    originals.delete(identity(currentTab()));
    update(currentTab());
  });
  return {
    update,
    owns,
    close: () => {},
    refresh: () => {
      if (!owns(currentTab())) return false;
      if (state) pages.delete(state.id);
      dispose();
      update(currentTab());
      return true;
    },
  };
}
