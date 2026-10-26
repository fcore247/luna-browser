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
export function createStoreInstall({ currentTab, cover, review, closeOther, toast }) {
  const anchor = document.getElementById('bStoreInstall'),
    urlbox = document.getElementById('urlbox');
  let details = null,
    key = '',
    pendingKey = '',
    panel = null,
    generation = 0,
    retries = 0,
    retryTimer;
  const cache = new Map();
  function close(focus = false) {
    if (!panel) return;
    panel.remove();
    panel = null;
    urlbox.classList.remove('store-drop-open');
    anchor.setAttribute('aria-expanded', 'false');
    cover(false);
    if (focus) anchor.focus();
  }
  function position() {
    if (!panel) return;
    const r = urlbox.getBoundingClientRect();
    Object.assign(panel.style, {
      left: r.left + 'px',
      top: r.bottom - 1 + 'px',
      width: Math.min(r.width, innerWidth - r.left - 8) + 'px',
    });
  }
  function display(next) {
    details = next;
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
  }
  async function update(tab) {
    const id = tab?.mode === 'web' && storeExtensionID(tab.url);
    const nextKey = id ? `${tab.id}:${tab.url}:${tab.title}` : '';
    if (nextKey !== key) {
      close();
      key = nextKey;
      generation++;
      pendingKey = '';
      retries = 0;
      clearTimeout(retryTimer);
      display(null);
    }
    if (!id || tab.loading) return;
    if (cache.has(nextKey)) {
      if (!details) display(cache.get(nextKey));
      return;
    }
    if (pendingKey === nextKey) return;
    pendingKey = nextKey;
    const token = generation;
    retries++;
    try {
      const info = await api.extensionStoreDetails(tab.id);
      if (token !== generation || key !== nextKey || !info || storeExtensionID(info.url) !== id)
        return;
      const expectedName = (tab.title || '').replace(/\s*[-–|]\s*Chrome Web Store.*$/i, '').trim();
      if (
        expectedName &&
        info.name &&
        expectedName.toLowerCase() !== info.name.trim().toLowerCase()
      )
        return;
      const icon = (() => {
        try {
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
      cache.set(nextKey, entry);
      display(entry);
    } catch {
      /* Store metadata can arrive on the next navigation state event. */
    } finally {
      if (pendingKey === nextKey) pendingKey = '';
      if (token === generation && key === nextKey && !cache.has(nextKey) && retries < 16) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => update(currentTab()), 350);
      }
    }
  }
  anchor.addEventListener('click', () => {
    if (panel) {
      close(true);
      return;
    }
    if (!details) return;
    closeOther();
    const chosen = { ...details };
    panel = document.createElement('div');
    panel.id = 'storeInstallDrop';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Erweiterung in Luna installieren');
    panel.innerHTML = `<button type="button" class="store-install-close" data-store-close aria-label="Schließen"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m5 5 10 10M15 5 5 15"/></svg></button>
      <div class="store-install-hero"><div class="store-install-icon">${chosen.icon ? `<img src="${esc(chosen.icon)}" alt="">` : '<span aria-hidden="true">＋</span>'}</div><div class="store-install-copy"><span class="store-install-eyebrow">DEIN NÄCHSTES EXTRA</span><h2>${esc(chosen.name)}</h2><p>Hey, interessiert dich diese Erweiterung?<br>Luna kann sie für dich installieren.</p></div></div>
      <div class="store-install-footer"><span class="store-install-note"><svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="m10 2 6 2.5V10c0 4-6 7-6 7s-6-3-6-7V4.5L10 2Z"/><path d="m7 9 2 2 4-4"/></svg>Berechtigungen zuerst prüfen</span><div class="store-install-actions"><button type="button" class="store-install-later" data-store-close>Nicht jetzt</button><button type="button" class="store-install-primary" data-store-confirm>In Luna installieren<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5"/></svg></button></div></div>`;
    panel.style.setProperty(
      '--theme-menu-blur',
      Math.max(0, Math.min(32, Number(personal().menuBlur) || 0)) + 'px',
    );
    document.body.append(panel);
    urlbox.classList.add('store-drop-open');
    anchor.setAttribute('aria-expanded', 'true');
    position();
    cover(true);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      panel.animate(
        [
          { opacity: 0, clipPath: 'inset(0 0 100% 0)', transform: 'translateY(-8px)' },
          { opacity: 1, clipPath: 'inset(0)', transform: 'none' },
        ],
        { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    panel.addEventListener('click', async (e) => {
      if (e.target.closest('[data-store-close]')) return close(true);
      if (!e.target.closest('[data-store-confirm]')) return;
      if (currentTab()?.mode !== 'web' || storeExtensionID(currentTab().url) !== chosen.id) {
        close();
        return;
      }
      close();
      try {
        await review(chosen.url);
      } catch (error) {
        toast(String(error?.message || error));
      }
    });
  });
  anchor.querySelector('img').addEventListener('error', () => {
    anchor.querySelector('img').hidden = true;
    anchor.querySelector('.store-icon-fallback').hidden = false;
  });
  document.addEventListener('pointerdown', (e) => {
    if (panel && !e.target.closest('#storeInstallDrop,#urlbox')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (panel && e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
  });
  document.getElementById('url').addEventListener('input', () => close());
  window.addEventListener('resize', position);
  window.addEventListener('luna-personalization', () => {
    if (panel)
      panel.style.setProperty(
        '--theme-menu-blur',
        Math.max(0, Math.min(32, Number(personal().menuBlur) || 0)) + 'px',
      );
  });
  return { update, close };
}
