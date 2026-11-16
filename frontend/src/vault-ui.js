import { t as l10n, msg as l10nMsg, translateBackendError } from './i18n.js';
import * as api from './api.js';
import { esc } from './ui.js';
import './styles/vault.css';

const KEY_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3M14 9l2 2"/></svg>';

// Origin of a page URL, used only as a cache key and for labels. Go decides what is storable.
export function originOf(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin.toLowerCase() : '';
  } catch {
    return '';
  }
}
const hostOf = (origin) => origin.replace(/^https?:\/\//, '');

// The browser chrome owns the save offer and account choice. The native vault
// authenticates the user and fills credentials inside the matching website.
export function createVault({ currentTab, toast, cover, refreshUI, pageVisible }) {
  const button = document.getElementById('bVault');
  const offers = new Map();
  const saved = new Map(); // Origin -> account metadata. No secret reaches the shell.
  const loading = new Map();
  let status = { supported: false, ready: false };
  let busy = false;
  let activation = 0;
  const banner = document.createElement('section');
  banner.id = 'vaultOffer';
  banner.hidden = true;
  banner.setAttribute('aria-label', l10n('Passwort speichern'));
  document.getElementById('page').before(banner);
  let visibleOffer = null;

  const notifyChanged = () => window.dispatchEvent(new Event('luna-vault-changed'));
  async function refreshStatus() {
    try {
      status = (await api.vaultStatus()) || status;
    } catch {
      return;
    }
    if (status.offers === false) offers.clear();
    refreshUI?.();
  }
  refreshStatus();
  api.onVaultOffer((offer) => {
    if (!offer?.id || !originOf(offer.origin)) return;
    offers.set(offer.tab, offer);
    // Go expires pending credentials after ten minutes.
    setTimeout(
      () => {
        if (offers.get(offer.tab) !== offer) return;
        offers.delete(offer.tab);
        refreshUI?.();
      },
      10 * 60 * 1000,
    );
    refreshUI?.();
  });

  async function load(origin) {
    if (loading.has(origin)) return;
    const request = api.vaultEntries(origin);
    loading.set(origin, request);
    let entries;
    try {
      entries = (await request) || [];
    } catch {
      entries = [];
    }
    if (loading.get(origin) !== request) return;
    loading.delete(origin);
    saved.set(origin, entries);
    refreshUI?.();
  }

  function showOffer(offer) {
    if (visibleOffer === offer) return;
    visibleOffer = offer;
    banner.hidden = !offer;
    if (!offer) {
      banner.replaceChildren();
      return;
    }
    banner.innerHTML = l10nMsg`<div class="vault-offer-info"><span aria-hidden="true">${KEY_ICON}</span><div><strong role="status">${offer.update ? l10n('Passwort aktualisieren?') : l10n('Passwort speichern?')}</strong><div class="vault-offer-account"><bdi>${esc(hostOf(offer.origin))}</bdi> · <bdi>${esc(offer.username || l10n('Ohne Benutzername'))}</bdi></div></div></div>
      <label class="vault-auto-choice"><input id="vaultOfferAutoLogin" type="checkbox" ${offer.autoLogin ? 'checked' : ''}>Automatisch mit Touch ID anmelden</label>
      <div class="vault-offer-actions"><button type="button" class="btn sm" data-vault-choice="dismiss">Nicht jetzt</button><button type="button" class="btn sm pri" data-vault-choice="save">${offer.update ? l10n('Aktualisieren') : l10n('Speichern')}</button></div>
      <div class="vault-offer-error" role="status" hidden></div>`;
  }

  banner.addEventListener('change', ({ target }) => {
    if (target.id === 'vaultOfferAutoLogin' && visibleOffer)
      visibleOffer.autoLogin = target.checked;
  });
  banner.addEventListener('click', async (event) => {
    const choice = event.target.closest('[data-vault-choice]');
    const offer = visibleOffer;
    if (!choice || !offer || offer.tab !== currentTab()?.id || choice.disabled) return;
    const tab = currentTab();
    // This account was just submitted manually. Saving it should not start a second login.
    if (tab.vaultFlow?.form?.origin === offer.origin)
      tab.vaultFlow.attempted.add(tab.vaultFlow.form.token);
    const controls = banner.querySelectorAll('input,button');
    const automatic = banner.querySelector('input').checked;
    controls.forEach((control) => {
      control.disabled = true;
    });
    try {
      if (choice.dataset.vaultChoice === 'save') {
        await api.vaultSaveOffer(offer.tab, offer.id, automatic);
        notifyChanged();
      } else {
        await api.vaultDismissOffer(offer.tab, offer.id);
      }
      if (offers.get(offer.tab) === offer) offers.delete(offer.tab);
    } catch (error) {
      if (visibleOffer === offer) {
        const message = banner.querySelector('.vault-offer-error');
        message.hidden = false;
        message.textContent = String(error?.message || error);
      }
    } finally {
      controls.forEach((control) => {
        control.disabled = false;
      });
      refreshUI?.();
    }
  });

  function update(tab) {
    const origin = tab?.mode === 'web' ? originOf(tab.url) : '';
    const offer = origin && offers.get(tab.id);
    showOffer((status.ready && offer) || null);
    if (origin && !saved.has(origin) && status.ready) load(origin);
    const list = saved.get(origin) || [];
    button.hidden = !status.ready || (!offer && !list.length);
    if (button.hidden) return;
    const flow = tab.vaultFlow;
    const form = flow?.form;
    const hasForm = form?.origin === origin;
    button.dataset.state = offer ? 'offer' : 'fill';
    button.innerHTML =
      KEY_ICON +
      (offer
        ? `<span>${offer.update ? l10n('Aktualisieren') : l10n('Speichern')}</span>`
        : hasForm
          ? `<span>${l10n('Anmelden')}</span>`
          : '');
    button.title = offer
      ? l10nMsg`Passwort für ${hostOf(offer.origin)} (${offer.username || l10n('ohne Benutzername')}) speichern`
      : list.length > 1
        ? l10n('Gespeicherte Anmeldungen anzeigen')
        : l10nMsg`Anmelden als ${list[0].username || l10n('gespeicherter Nutzer')} (Touch ID)`;
    button.setAttribute('aria-label', button.title);
    if (!offer && hasForm && !busy && pageVisible(tab) && document.visibilityState === 'visible') {
      // A native preflight may have found Luna inactive before authentication.
      // Retry only after a new focus signal, for the same form and account.
      const deferred = flow.deferred;
      if (deferred?.form === form.token) {
        if (deferred.activation !== activation) {
          const entry = list.find((account) => account.username === deferred.username);
          if (entry && (!deferred.automatic || entry.autoLogin))
            login(tab, entry, deferred.automatic, deferred.continuation, deferred.retries);
        }
        return;
      }
      if (flow.continuation && flow.continuation.expires <= Date.now()) flow.continuation = null;
      if (flow.continuation && form.stage === 'password') {
        const next = flow.continuation;
        const entry = list.find((account) => account.username === next.username);
        if (entry && (!next.automatic || entry.autoLogin))
          login(tab, entry, next.automatic, next.token);
      } else if (
        !flow.continuation &&
        !flow.attempted.has(form.token) &&
        (tab.vaultAttempts?.get(origin) || 0) + 120000 <= Date.now()
      ) {
        const preferred = list.filter((entry) => entry.autoLogin);
        if (preferred.length === 1) login(tab, preferred[0], true);
      }
    }
  }

  function navigated(tab, url, newDocument = true) {
    const flow = tab.vaultFlow;
    if (flow?.origin !== originOf(url)) tab.vaultFlow = null;
    else if (newDocument) flow.form = null;
    // The web process can describe a redirect target before its URL arrives
    // through Luna's separate navigation events. Match both URL and origin.
    const next = tab.vaultPendingForm;
    if (next && next.expires < Date.now()) tab.vaultPendingForm = null;
    else if (next && next.event.origin === originOf(url)) {
      tab.vaultPendingForm = null;
      const path = new URL(url);
      if (next.event.url === path.origin + path.pathname) setForm(tab, next.event);
    }
  }
  function formChanged(tab, event) {
    const origin = originOf(event.origin);
    if (!origin) return;
    if (origin !== originOf(tab.webUrl || tab.url)) {
      if (originOf(event.url) === origin)
        tab.vaultPendingForm = { event, expires: Date.now() + 5000 };
      return;
    }
    tab.vaultPendingForm = null;
    setForm(tab, event);
    if (tab === currentTab()) refreshUI?.();
  }
  function setForm(tab, event) {
    const origin = originOf(event.origin);
    if (!tab.vaultFlow || tab.vaultFlow.origin !== origin) {
      tab.vaultFlow = { origin, form: null, continuation: null, attempted: new Set() };
    }
    tab.vaultFlow.form =
      event.form && ['username', 'password'].includes(event.stage)
        ? { origin, token: event.form, stage: event.stage }
        : null;
    if (tab.vaultFlow.deferred?.form !== event.form) tab.vaultFlow.deferred = null;
  }

  // A small modal sheet. The native page is covered by a snapshot while it is open.
  async function sheet(html) {
    await cover(true);
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'vaultAccountHeading');
    dialog.className = 'vault-dialog';
    dialog.innerHTML = html;
    document.body.append(dialog);
    try {
      return await new Promise((resolve) => {
        dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
        dialog.addEventListener('click', (event) => {
          const choice = event.target.closest('[data-vault-choice]');
          if (choice) dialog.close(choice.dataset.vaultChoice);
          else if (event.target === dialog) dialog.close('');
        });
        dialog.showModal();
        dialog.querySelector('[autofocus]')?.focus();
      });
    } finally {
      dialog.remove();
      await cover(false);
    }
  }

  async function login(tab, entry, automatic, continuation = '', retries = 0) {
    const flow = tab.vaultFlow;
    const form = flow?.form;
    if (busy || tab !== currentTab() || tab.mode !== 'web' || entry.origin !== originOf(tab.url))
      return;
    if ((!form || form.origin !== entry.origin) && (automatic || continuation)) return;
    busy = true;
    const startedOnActivation = activation;
    if (flow) {
      flow.deferred = null;
      flow.continuation = null;
      if (form) flow.attempted.add(form.token);
    }
    (tab.vaultAttempts ||= new Map()).set(entry.origin, Date.now());
    try {
      const result =
        form?.origin === entry.origin
          ? await api.vaultLogin(
              tab.id,
              tab.url,
              entry.username,
              form.token,
              automatic,
              continuation,
            )
          : await api.vaultFill(tab.id, tab.url, entry.username);
      if (result?.deferred) {
        if (form && tab.vaultFlow === flow && flow.form?.token === form.token && retries < 2) {
          flow.deferred = {
            form: form.token,
            username: entry.username,
            automatic,
            continuation,
            retries: retries + 1,
            activation: startedOnActivation,
          };
        }
        return;
      }
      if (result?.continuation && flow && tab.vaultFlow === flow) {
        flow.continuation = {
          username: entry.username,
          automatic,
          token: result.continuation,
          expires: Date.now() + 90000,
        };
      }
      if (tab !== currentTab() || !result || result.submitted) return;
      toast?.(
        result.password
          ? l10n(result.username ? 'Anmeldedaten ausgefüllt.' : 'Passwort ausgefüllt.')
          : l10n(
              'Benutzername ausgefüllt. Für das Passwort noch einmal auf den Schlüssel klicken.',
            ),
      );
    } catch (error) {
      if (tab === currentTab()) toast?.(String(translateBackendError(error?.message || error)));
    } finally {
      busy = false;
      refreshUI?.(); // A password form can be ready before the username step returns.
    }
  }

  async function chooseAccount(list) {
    const rows = list
      .map(
        (entry, index) =>
          `<button type="button" class="vault-row" data-vault-choice="${index}"${index === 0 ? ' autofocus' : ''}><b>${esc(entry.username || l10n('Ohne Benutzername'))}</b><small>${esc(hostOf(entry.origin))}</small></button>`,
      )
      .join('');
    const choice = await sheet(
      l10nMsg`<div class="vault-sheet"><span class="vault-eyebrow">${KEY_ICON} PASSWÖRTER</span><h2 id="vaultAccountHeading">Anmelden bei ${esc(hostOf(list[0].origin))}</h2><p>Wähle ein Konto. Danach bestätigst du mit Touch ID.</p><div class="vault-rows">${rows}</div><button type="button" class="vault-quiet" data-vault-choice="">Abbrechen</button></div>`,
    );
    return choice !== '' ? list[Number(choice)] : null;
  }

  button.addEventListener('click', async () => {
    const tab = currentTab();
    if (!tab || busy) return;
    if (visibleOffer) {
      banner.querySelector('[data-vault-choice="save"]')?.focus();
      return;
    }
    const list = saved.get(originOf(tab.url)) || [];
    let entry = list[0];
    if (list.length > 1) {
      busy = true;
      try {
        entry = await chooseAccount(list);
      } finally {
        busy = false;
      }
    }
    if (entry) await login(tab, entry, false);
  });
  window.addEventListener('luna-vault-changed', () => {
    saved.clear();
    loading.clear();
    refreshStatus();
    refreshUI?.();
  });
  function activated(tab = currentTab()) {
    if (!tab || tab !== currentTab()) return;
    activation++;
    update(tab);
  }
  window.addEventListener('focus', () => activated());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') activated();
  });
  return {
    update,
    activated,
    navigated,
    formChanged,
    forget(tab) {
      offers.delete(tab.id);
      tab.vaultFlow = null;
    },
    status: () => status,
  };
}
