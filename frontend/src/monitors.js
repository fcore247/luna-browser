import * as api from './api.js';
import { esc } from './ui.js';
import { t as l10n, msg as l10nMsg, locale, translateBackendError } from './i18n.js';
const monitorError = (error) => String(translateBackendError(error));

let watches = [];
let loadError = '';
export const monitorCommand = (value) =>
  /^(watch|monitor|überwachen|ueberwachen)$/i.test(String(value).trim());
export const monitorURL = (raw) => {
  try {
    const u = new URL(raw);
    u.hash = '';
    return u.href;
  } catch {
    return '';
  }
};
export function monitorStatus(w) {
  if (!w.enabled) return l10n('Pausiert');
  if (w.error) return l10n('Wartet');
  if (!w.last_checked || w.last_checked.startsWith('0001-')) return l10n('Erste Prüfung steht an');
  return l10n('Überwacht');
}
const time = (raw) =>
  raw && !raw.startsWith('0001-') ? new Date(raw).toLocaleString(locale()) : l10n('Noch nicht');
export function monitorCards(list = watches) {
  return (
    list
      .map(
        (w) => l10nMsg`<article class="monitor-card" data-monitor-card="${esc(w.id)}">
    <div class="monitor-card-heading"><strong>${esc(new URL(w.url).hostname)}</strong><span class="monitor-status" data-status="${!w.enabled ? 'paused' : w.error ? 'waiting' : 'active'}">${esc(monitorStatus(w))}</span></div>
    <p class="monitor-url">${esc(w.url)}</p>
    <p class="monitor-meta">${l10n('Letzte Prüfung:')} ${esc(time(w.last_checked))}<br>${l10n('Letzte Änderung:')} ${esc(time(w.last_changed))}</p>
    ${w.error ? `<p class="monitor-error" role="status">${esc(monitorError(w.error))}</p>` : ''}
    <div class="monitor-options"><label>Prüfintervall <span><input type="number" min="1" max="10080" value="${w.interval_minutes}" data-monitor-interval="${esc(w.id)}" aria-label="Prüfintervall in Minuten"> Minuten</span></label>
    ${w.source === 'browser' ? l10nMsg`<label class="monitor-refresh"><input type="checkbox" data-monitor-refresh="${esc(w.id)}" ${w.auto_refresh !== false ? 'checked' : ''}> Seite vor jeder Prüfung neu laden</label>` : l10n('<span class="muted">Öffentliche Seite · kein offener Tab nötig</span>')}</div>
    <div class="monitor-actions"><button class="btn sm" data-monitor-action="open" data-monitor-id="${esc(w.id)}">Seite öffnen</button><button class="btn sm" data-monitor-action="${w.enabled ? 'pause' : 'resume'}" data-monitor-id="${esc(w.id)}">${w.enabled ? l10n('Pausieren') : l10n('Fortsetzen')}</button><button class="btn sm" data-monitor-action="check" data-monitor-id="${esc(w.id)}" ${w.enabled ? '' : 'disabled'}>Jetzt prüfen</button><button class="btn sm" data-monitor-action="remove" data-monitor-id="${esc(w.id)}">Entfernen</button></div>
    </article>`,
      )
      .join('') ||
    l10n(
      '<p class="muted monitor-empty">Keine Überwachung gespeichert. Bitte deine KI: „Überwache diese Seite und benachrichtige mich bei Änderungen.“</p>',
    )
  );
}
export function monitorSettingsHTML() {
  return l10nMsg`<section id="set-monitors" class="sp-card"><h2>Seitenüberwachung</h2><p class="pp-settings-intro">Alle gespeicherten Überwachungen an einem Ort. Luna prüft öffentliche Seiten und angemeldete Browserseiten und meldet erkannte Textänderungen. Aufgaben bleiben nach einem Neustart gespeichert.</p><p class="muted">Bei Login-Seiten muss der Tab geöffnet und angemeldet sein. Luna wartet bei abgelaufener Anmeldung und setzt später fort. Automatisches Neuladen holt auch Änderungen von Seiten ohne Live-Aktualisierung. Während einer Eingabe oder bei erkennbar ungespeicherten Formulardaten wartet Luna.</p><p class="monitor-shortcut">Schnellzugriff: <kbd>watch</kbd>, <kbd>monitor</kbd> oder <kbd>überwachen</kbd> in die Adressleiste tippen.</p>${loadError ? `<p class="monitor-error">${esc(loadError)}</p>` : ''}<div class="monitor-list">${monitorCards()}</div></section>`;
}
export function createMonitorUI({ currentTab, openURL, openSettings, toast }) {
  let busy = null;
  function updateToolbar() {
    const button = document.getElementById('bMonitor');
    if (!button) return;
    const t = currentTab();
    const list = watches.filter((w) => monitorURL(w.url) === monitorURL(t?.webUrl || t?.url));
    const active = list.find((w) => w.enabled) || list[0];
    button.hidden = t?.mode !== 'web' || !active;
    button.dataset.state = !active
      ? 'none'
      : !active.enabled
        ? 'paused'
        : active.error
          ? 'waiting'
          : 'active';
    button.querySelector('span').textContent = active ? monitorStatus(active) : l10n('Überwachen');
    button.setAttribute(
      'aria-label',
      active
        ? `${monitorStatus(active)} · ${l10n('Überwachung verwalten')}`
        : l10n('Seitenüberwachung öffnen'),
    );
    button.title = active
      ? `${monitorStatus(active)} · ${active.interval_minutes} ${l10n('Minuten')} · ${active.error ? monitorError(active.error) : l10n('Überwachung verwalten')}`
      : l10n('Seitenüberwachung öffnen');
  }
  function refresh(force = false) {
    if (busy) return force ? busy.then(() => refresh()) : busy;
    busy = (async () => {
      try {
        const next = (await api.pageMonitors()) || [];
        if (JSON.stringify(next) !== JSON.stringify(watches) || loadError) {
          watches = next;
          loadError = '';
          window.dispatchEvent(new Event('luna-monitors-changed'));
        }
        updateToolbar();
      } catch (error) {
        loadError = monitorError(error);
      }
    })().finally(() => {
      busy = null;
    });
    return busy;
  }
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-monitor-action]');
    if (!button || button.disabled) return;
    if (button.dataset.monitorAction === 'settings') {
      openSettings();
      return;
    }
    const w = watches.find((w) => w.id === button.dataset.monitorId);
    if (!w) return;
    if (button.dataset.monitorAction === 'open') {
      openURL(w.url);
      return;
    }
    button.disabled = true;
    try {
      await api.pageMonitorAction(w.id, button.dataset.monitorAction);
      await refresh(true);
      toast(
        button.dataset.monitorAction === 'check'
          ? l10n('Prüfung vorgemerkt – startet innerhalb von 15 Sekunden.')
          : l10n('Überwachung gespeichert'),
      );
    } catch (error) {
      toast(monitorError(error));
    } finally {
      button.disabled = false;
    }
  });
  document.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-monitor-interval], [data-monitor-refresh]');
    if (!input) return;
    const id = input.dataset.monitorInterval || input.dataset.monitorRefresh;
    const w = watches.find((w) => w.id === id);
    if (!w) return;
    const interval = input.dataset.monitorInterval ? Number(input.value) : w.interval_minutes;
    if (!Number.isInteger(interval) || interval < 1 || interval > 10080) {
      input.value = w.interval_minutes;
      toast(l10n('Intervall: 1 bis 10080 Minuten'));
      return;
    }
    const refreshPage = input.dataset.monitorRefresh ? input.checked : w.auto_refresh !== false;
    try {
      await api.pageMonitorConfigure(w.id, interval, refreshPage);
      await refresh(true);
      toast(l10n('Überwachung gespeichert'));
    } catch (error) {
      if (input.dataset.monitorRefresh) input.checked = w.auto_refresh !== false;
      else input.value = w.interval_minutes;
      toast(monitorError(error));
    }
  });
  api.onPageMonitorsUpdated(refresh);
  setInterval(refresh, 15000);
  refresh();
  return {
    refresh,
    updateToolbar,
    quickHTML() {
      const url = monitorURL(currentTab()?.webUrl || currentTab()?.url);
      const list = watches.filter((w) => monitorURL(w.url) === url);
      return l10nMsg`<div class="td-head"><b>Seitenüberwachung</b><button type="button" class="td-close" data-close aria-label="Schließen">×</button></div><div class="monitor-quick-body"><p class="muted">${list.length ? l10n('Diese Seite wird von Luna überwacht.') : l10n('Für diese Seite ist keine Überwachung gespeichert.')}</p><div class="monitor-list">${monitorCards(list)}</div><p class="muted small">Luna muss geöffnet bleiben. Bei Login-Seiten bleibt auch der angemeldete Tab geöffnet.</p><button class="btn" data-monitor-action="settings">Alle Überwachungen verwalten</button></div>`;
    },
  };
}
