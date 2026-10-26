import * as api from './api.js';
import { esc } from './ui.js';
import { personal } from './personalization.js';
import './styles/store-install.css';

export function storeExtensionID(input) {
  try {
    const u = new URL(input);
    if (u.protocol !== 'https:' || u.host !== 'chromewebstore.google.com') return '';
    return u.pathname.match(/^\/detail\/(?:[^/]+\/)?([a-p]{32})\/?$/)?.[1] || '';
  } catch {
    return '';
  }
}
export function createStoreInstall({ currentTab, closeOther, toast }) {
  const anchor = document.getElementById('bStoreInstall'),
    urlbox = document.getElementById('urlbox');
  let details = null,
    key = '',
    pendingKey = '',
    panel = null,
    generation = 0,
    retries = 0,
    retryTimer,
    operation = null;
  const cache = new Map();
  const dismissed = new Set();
  const identity = () => `${currentTab()?.id}:${storeExtensionID(currentTab()?.url)}`;
  function close(focus = false, dismiss = false) {
    if (operation && operation.phase !== 'installing') {
      if (operation.pending) api.extensionCancel(operation.pending.id).catch(() => {});
      operation = null;
    }
    if (!panel) return;
    if (dismiss) dismissed.add(identity());
    panel.remove();
    panel = null;
    urlbox.classList.remove('store-drop-open');
    anchor.setAttribute('aria-expanded', 'false');

    if (focus) anchor.focus();
  }
  function display(next) {
    const refresh =
      panel && !operation && next && (details?.name !== next.name || details?.icon !== next.icon);
    if (refresh) close();
    details = next;
    if (panel && next && operation) {
      panel.querySelector('.store-install-icon').innerHTML = next.icon
        ? `<img src="${esc(next.icon)}" alt="">`
        : '<span aria-hidden="true">＋</span>';
      if (!operation.pending) panel.querySelector('h2').textContent = next.name;
    }
    anchor.hidden = !details;
    const image = anchor.querySelector('img'),
      fallback = anchor.querySelector('.store-icon-fallback');
    image.hidden = !next?.icon;
    image.src = next?.icon || '';
    fallback.hidden = !!next?.icon;
    anchor.title = next ? `${next.name} in Luna installieren` : '';
    anchor.setAttribute(
      'aria-label',
      next ? `${next.name} installieren` : 'Erweiterung installieren',
    );
    if (next && !dismissed.has(identity())) open();
  }
  async function update(tab) {
    const id = tab?.mode === 'web' && storeExtensionID(tab.url);
    const nextKey = id ? `${tab.id}:${id}` : '';
    if (nextKey !== key) {
      close();
      if (operation?.phase === 'installing') operation = null;
      key = nextKey;
      generation++;
      pendingKey = '';
      retries = 0;
      clearTimeout(retryTimer);
      display(null);
    }
    if (!id) return;
    // The URL establishes eligibility. Metadata only improves the presentation.
    if (!details) {
      const slug = new URL(tab.url).pathname.split('/').filter(Boolean);
      const label = slug.length > 2 ? slug[1].replace(/-/g, ' ') : '';
      display({ id, url: tab.url, name: label || 'Diese Erweiterung', icon: '' });
    }
    if (cache.has(nextKey)) {
      if (details !== cache.get(nextKey)) display(cache.get(nextKey));
      return;
    }
    if (pendingKey === nextKey) return;
    pendingKey = nextKey;
    const token = generation;
    retries++;
    try {
      let official;
      try {
        official = await api.extensionStoreLookup(tab.url);
      } catch {}
      const info = official?.name ? official : await api.extensionStoreDetails(tab.id);
      if (token !== generation || key !== nextKey || !info || storeExtensionID(info.url) !== id)
        return;
      const expectedName = (tab.title || '').replace(/\s*[-–|]\s*Chrome Web Store.*$/i, '').trim();
      if (
        !official?.name &&
        expectedName &&
        info.name &&
        expectedName.toLowerCase() !== info.name.trim().toLowerCase()
      )
        return;
      const icon = (() => {
        try {
          if (/^data:image\/(png|jpeg|gif|webp|x-icon);base64,[A-Za-z0-9+/=]+$/.test(info.icon))
            return info.icon;
          const u = new URL(info.icon);
          return u.protocol === 'https:' && u.hostname.endsWith('.googleusercontent.com')
            ? u.href
            : '';
        } catch {
          return '';
        }
      })();
      const entry = {
        id,
        url: info.url,
        name:
          info.name ||
          tab.title.replace(/\s*[-–|]\s*Chrome Web Store.*$/i, '') ||
          'Diese Erweiterung',
        icon,
      };
      if (entry.icon) cache.set(nextKey, entry);
      display(entry);
    } catch {
      /* Store metadata can arrive on the next navigation state event. */
    } finally {
      if (pendingKey === nextKey) pendingKey = '';
      if (token === generation && key === nextKey && !cache.has(nextKey) && retries < 60) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => update(currentTab()), 350);
      }
    }
  }
  function open() {
    if (panel || !details) return;
    const chosen = { ...details };
    panel = document.createElement('div');
    panel.id = 'storeInstallDrop';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Erweiterung in Luna installieren');
    panel.innerHTML = `<button type="button" class="store-install-close" data-store-close aria-label="Schließen"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m5 5 10 10M15 5 5 15"/></svg></button>
      <div class="store-install-hero"><div class="store-install-icon">${chosen.icon ? `<img src="${esc(chosen.icon)}" alt="">` : '<span aria-hidden="true">＋</span>'}</div><div class="store-install-copy"><span class="store-install-eyebrow">DEIN NÄCHSTES EXTRA</span><h2>${esc(chosen.name)}</h2><p>Interessiert dich diese Erweiterung? Luna kann sie für dich installieren.</p></div></div>
      <div class="store-install-footer"><span class="store-install-note"><svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="m10 2 6 2.5V10c0 4-6 7-6 7s-6-3-6-7V4.5L10 2Z"/><path d="m7 9 2 2 4-4"/></svg>Berechtigungen zuerst prüfen</span><div class="store-install-actions"><button type="button" class="store-install-later" data-store-close>Nicht jetzt</button><button type="button" class="store-install-primary" data-store-confirm>In Luna installieren<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5"/></svg></button></div></div>`;
    panel.style.setProperty(
      '--theme-menu-blur',
      Math.max(0, Math.min(32, Number(personal().menuBlur) || 0)) + 'px',
    );
    document.getElementById('progress').after(panel);
    urlbox.classList.add('store-drop-open');
    anchor.setAttribute('aria-expanded', 'true');

    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      panel.animate(
        [
          { opacity: 0, clipPath: 'inset(0 0 100% 0)', transform: 'translateY(-8px)' },
          { opacity: 1, clipPath: 'inset(0)', transform: 'none' },
        ],
        { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    paintOperation();
    panel.addEventListener('click', async (e) => {
      if (e.target.closest('[data-store-close]')) return close(true, true);
      if (!e.target.closest('[data-store-confirm]')) return;
      if (currentTab()?.mode !== 'web' || storeExtensionID(currentTab().url) !== chosen.id) {
        close();
        return;
      }
      if (operation?.phase === 'ready') {
        if (operation.pending.unsupported) return;
        operation.phase = 'review';
        paintOperation();
        return;
      }
      if (operation?.phase === 'review') {
        if (operation.pending.unsupported) return;
        const task = operation;
        task.phase = 'installing';
        paintOperation();
        try {
          await api.extensionInstall(task.pending.id);
          if (operation === task) {
            operation = null;
            close(false, true);
          }
          toast(`${task.pending.name} wurde installiert. Lade die Webseite neu.`);
          window.dispatchEvent(new Event('luna-extensions-changed'));
        } catch (error) {
          if (operation === task) {
            task.phase = 'error';
            task.error = String(error?.message || error);
            paintOperation();
          }
        }
        return;
      }
      if (operation && operation.phase !== 'error') return;
      beginCheck(chosen);
    });
    if (!operation) beginCheck(chosen);
  }
  async function beginCheck(chosen) {
    const task = { phase: 'checking', identity: identity() };
    operation = task;
    paintOperation();
    try {
      const pending = await api.extensionPrepare(chosen.url);
      if (operation !== task || identity() !== task.identity) {
        if (pending?.id) await api.extensionCancel(pending.id);
        return;
      }
      if (!pending?.id) throw new Error('Die Kompatibilität konnte nicht geprüft werden.');
      task.pending = pending;
      task.phase = 'ready';
      paintOperation();
    } catch (error) {
      if (operation === task) {
        task.phase = 'error';
        task.error = String(error?.message || error);
        paintOperation();
      }
    }
  }

  function paintOperation() {
    if (!panel || !operation) return;
    const task = operation,
      busy = task.phase === 'checking' || task.phase === 'installing';
    const button = panel.querySelector('[data-store-confirm]');
    button.disabled = busy || !!task.pending?.unsupported;
    button.textContent = task.pending?.unsupported
      ? 'Nicht kompatibel'
      : task.phase === 'ready'
        ? 'Berechtigungen prüfen'
        : task.phase === 'review'
          ? 'Zugriff erlauben & installieren'
          : task.phase === 'installing'
            ? 'Wird installiert …'
            : task.phase === 'error'
              ? 'Erneut versuchen'
              : 'Kompatibilität wird geprüft …';
    const copy = panel.querySelector('.store-install-copy');
    copy.querySelector('p').textContent =
      task.error ||
      (task.pending
        ? task.pending.compatibility ||
          (task.phase === 'review'
            ? 'Diese Berechtigungen werden benötigt. Möchtest du sie erlauben?'
            : 'Das Manifest wurde geprüft. Es sind keine bekannten Kompatibilitätsprobleme aufgefallen.')
        : 'Luna lädt das Paket zur Prüfung. Es wird noch nichts installiert oder ausgeführt.');
    copy.querySelector('.store-compatibility')?.remove();
    const badge = document.createElement('span');
    badge.className = 'store-compatibility';
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    const level =
      task.pending?.compatibilityLevel ||
      (task.pending?.unsupported
        ? 'unsupported'
        : task.pending?.compatibility
          ? 'limited'
          : task.pending
            ? 'clear'
            : 'checking');
    badge.dataset.level = task.phase === 'error' ? 'unknown' : level;
    badge.textContent =
      task.phase === 'error'
        ? 'Prüfung nicht möglich'
        : task.pending
          ? {
              clear: 'Keine bekannten Probleme',
              limited: 'Eingeschränkt kompatibel',
              unsupported: 'Nicht kompatibel',
            }[level] || 'Kompatibilität unbekannt'
          : 'Kompatibilität wird geprüft';
    copy.querySelector('h2').after(badge);
    if (task.pending) {
      copy.querySelector('h2').textContent = task.pending.name;
      if (task.pending.icon)
        panel.querySelector('.store-install-icon').innerHTML =
          `<img src="${esc(task.pending.icon)}" alt="">`;
    }
    copy.querySelector('.store-permissions')?.remove();
    if (task.phase === 'review') {
      copy.querySelector('h2').textContent = task.pending.name;
      const list = document.createElement('ul');
      list.className = 'store-permissions';
      list.innerHTML =
        (task.pending.permissions || []).map((p) => `<li>${esc(p)}</li>`).join('') ||
        '<li>Keine zusätzlichen Rechte</li>';
      copy.append(list);
    }
    panel.querySelector('.store-install-note').textContent = task.pending
      ? 'Manifest geprüft · Laufzeitfehler bleiben möglich'
      : task.phase === 'error'
        ? 'Erneut prüfen oder später versuchen'
        : 'Prüfung ohne Installation';
  }
  anchor.addEventListener('click', () => {
    if (panel) return close(true, true);
    closeOther();
    dismissed.delete(identity());
    open();
  });
  anchor.querySelector('img').addEventListener('error', () => {
    anchor.querySelector('img').hidden = true;
    anchor.querySelector('.store-icon-fallback').hidden = false;
  });
  document.addEventListener('keydown', (e) => {
    if (panel && e.key === 'Escape') {
      e.preventDefault();
      close(true, true);
    }
  });
  document.getElementById('url').addEventListener('input', () => close());
  window.addEventListener('luna-personalization', () => {
    if (panel)
      panel.style.setProperty(
        '--theme-menu-blur',
        Math.max(0, Math.min(32, Number(personal().menuBlur) || 0)) + 'px',
      );
  });
  return { update, close };
}
