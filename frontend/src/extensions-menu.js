import { t as l10n, msg as l10nMsg } from './i18n.js';
import * as api from './api.js';
import { esc } from './ui.js';
import { extensionIcon } from './extensions-view.js';
import './styles/extensions-menu.css';

export function createExtensionsMenu({ cover, currentTab, manage, toast, closeOther }) {
  const anchor = document.getElementById('bExtensions');
  const panel = document.createElement('div');
  panel.id = 'extensions-menu';
  panel.className = 'extensions-menu';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', l10n('Erweiterungen'));
  document.body.append(panel);
  anchor.setAttribute('aria-haspopup', 'dialog');
  anchor.setAttribute('aria-controls', panel.id);
  anchor.setAttribute('aria-expanded', 'false');
  let opened = false,
    generation = 0;

  function close(focus = false) {
    if (!opened) return Promise.resolve();
    opened = false;
    generation++;
    panel.hidden = true;
    anchor.setAttribute('aria-expanded', 'false');
    if (focus) anchor.focus();
    return cover(false);
  }
  function position() {
    const r = anchor.getBoundingClientRect();
    panel.style.top = r.bottom + 8 + 'px';
    panel.style.left =
      Math.max(8, Math.min(r.right - panel.offsetWidth, innerWidth - panel.offsetWidth - 8)) + 'px';
    panel.style.maxHeight = Math.max(140, innerHeight - r.bottom - 24) + 'px';
  }
  function render(status) {
    const entries = status.entries || [];
    const t = currentTab();
    let host = '';
    try {
      if (t?.mode === 'web') host = new URL(t.url).hostname;
    } catch {}
    panel.innerHTML = l10nMsg`<header><h2>Erweiterungen</h2><button type="button" class="ib" data-ext-close aria-label="Erweiterungsliste schließen">×</button></header>
      <p class="extensions-context">${esc(host || l10n('Deine Erweiterungen und ihre Steuerung'))}</p>
      <div class="extensions-list">${entries.map((e) => `<button type="button" class="extension-item" data-ext-open="${esc(e.id)}" ${!e.enabled || e.error || e.unsupported ? 'disabled' : ''}><span class="extension-monogram" aria-hidden="true">${extensionIcon(e)}</span><span><b>${esc(e.name)}</b><small>${esc(e.compatibility || e.error || (e.enabled ? l10n('Steuerung öffnen') : l10n('Deaktiviert')))}</small></span><span aria-hidden="true">›</span></button>`).join('') || l10n('<p class="extensions-empty">Noch keine Erweiterungen installiert.</p>')}</div>
      <button type="button" class="extensions-manage" data-ext-manage>Erweiterungen verwalten <span aria-hidden="true">↗</span></button>`;
    position();
  }
  async function toggle() {
    if (opened) return close(true);
    closeOther();
    opened = true;
    const token = ++generation;
    panel.hidden = false;
    anchor.setAttribute('aria-expanded', 'true');
    panel.innerHTML = l10n(
      '<header><h2>Erweiterungen</h2></header><p role="status" class="extensions-empty">Wird geladen …</p>',
    );
    position();
    try {
      const [status] = await Promise.all([api.extensionsStatus(), cover(true)]);
      if (!opened || generation !== token) return;
      render(status);
      panel.querySelector('button:not(:disabled)')?.focus();
    } catch (e) {
      if (opened && generation === token) {
        await close();
        toast(String(e?.message || e));
      }
    }
  }
  panel.addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-ext-close')) return close(true);
    if (button.hasAttribute('data-ext-manage')) {
      await close();
      manage();
      return;
    }
    if (button.dataset.extOpen) {
      const id = button.dataset.extOpen,
        tab = currentTab();
      await close();
      try {
        await api.extensionOpen(id, tab?.mode === 'web' ? tab.id : -1);
      } catch (error) {
        toast(String(error?.message || error));
      }
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (opened && !panel.contains(e.target) && !anchor.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (!opened) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const buttons = [...panel.querySelectorAll('button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement);
      buttons[(index + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
    }
  });
  window.addEventListener('resize', () => {
    if (opened) position();
  });
  return { toggle, close };
}
