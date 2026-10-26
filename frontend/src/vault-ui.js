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

// The key in the address bar: offers to save a login the user just submitted, and fills saved logins
// after Touch ID. It only ever handles origin and user name, never a password.
export function createVault({ currentTab, toast, cover, refreshUI }) {
  const button = document.getElementById('bVault');
  const offers = new Map(); // tab id -> { origin, username, update }
  const saved = new Map(); // origin -> entries (without passwords)
  const loading = new Set();
  let status = { supported: false, ready: false };
  let busy = false;

  const notifyChanged = () => window.dispatchEvent(new Event('luna-vault-changed'));
  api
    .vaultStatus()
    .then((value) => {
      status = value || status;
      refreshUI?.();
    })
    .catch(() => {});
  api.onVaultOffer((offer) => {
    offers.set(offer.tab, offer);
    refreshUI?.();
    toast?.(
      `${offer.update ? 'Passwort aktualisieren' : 'Passwort speichern'} für ${hostOf(offer.origin)}? Klicke auf den Schlüssel in der Adressleiste.`,
    );
  });

  async function load(origin, url) {
    if (loading.has(origin)) return;
    loading.add(origin);
    try {
      saved.set(origin, (await api.vaultEntries(url)) || []);
    } catch {
      saved.set(origin, []);
    } finally {
      loading.delete(origin);
      refreshUI?.();
    }
  }

  function update(tab) {
    const offer = tab ? offers.get(tab.id) : null;
    const origin = tab?.mode === 'web' ? originOf(tab.url) : '';
    if (origin && !saved.has(origin) && status.ready) load(origin, tab.url);
    const list = (origin && saved.get(origin)) || [];
    const show = status.ready && (!!offer || list.length > 0);
    button.hidden = !show;
    if (!show) return;
    button.dataset.state = offer ? 'offer' : 'fill';
    button.innerHTML = `${KEY_ICON}${offer ? `<span>${offer.update ? 'Aktualisieren' : 'Speichern'}</span>` : ''}`;
    button.title = offer
      ? `Passwort für ${hostOf(offer.origin)} (${offer.username || 'ohne Benutzername'}) speichern`
      : list.length > 1
        ? 'Gespeicherte Anmeldungen anzeigen'
        : `Anmelden als ${list[0].username || 'gespeicherter Nutzer'} (Touch ID)`;
    button.setAttribute('aria-label', button.title);
  }

  // A small modal sheet. The native page is covered by a snapshot while it is open.
  async function sheet(html) {
    await cover(true);
    const dialog = document.createElement('dialog');
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

  async function fill(tab, entry) {
    if (busy) return;
    busy = true;
    try {
      const result = await api.vaultFill(tab.id, tab.url, entry.username);
      toast?.(
        result?.username && result?.password
          ? 'Anmeldedaten ausgefüllt.'
          : result?.password
            ? 'Passwort ausgefüllt.'
            : 'Benutzername ausgefüllt. Für das Passwort noch einmal auf den Schlüssel klicken.',
      );
    } catch (error) {
      toast?.(String(error?.message || error));
    } finally {
      busy = false;
    }
  }

  async function chooseAndFill(tab, list) {
    const rows = list
      .map(
        (entry, index) =>
          `<button type="button" class="vault-row" data-vault-choice="${index}"${index === 0 ? ' autofocus' : ''}><b>${esc(entry.username || 'Ohne Benutzername')}</b><small>${esc(hostOf(entry.origin))}</small></button>`,
      )
      .join('');
    const choice = await sheet(
      `<div class="vault-sheet"><span class="vault-eyebrow">${KEY_ICON} PASSWÖRTER</span><h2>Anmelden bei ${esc(hostOf(list[0].origin))}</h2><p>Wähle ein Konto. Danach bestätigst du mit Touch ID.</p><div class="vault-rows">${rows}</div><button type="button" class="vault-quiet" data-vault-choice="">Abbrechen</button></div>`,
    );
    if (choice !== '' && list[Number(choice)]) await fill(tab, list[Number(choice)]);
  }

  async function answerOffer(tab, offer) {
    const choice = await sheet(
      `<div class="vault-sheet"><span class="vault-eyebrow">${KEY_ICON} PASSWÖRTER</span><h2>${offer.update ? 'Passwort aktualisieren?' : 'Passwort speichern?'}</h2><p>Luna speichert es verschlüsselt auf diesem Mac und füllt es später nur nach Touch ID aus. Deine KI kann es nie lesen.</p><div class="vault-fact"><span>${esc(hostOf(offer.origin))}</span><strong>${esc(offer.username || 'Ohne Benutzername')}</strong></div><div class="vault-actions"><button type="button" data-vault-choice="">Nicht jetzt</button><button type="button" class="vault-primary" data-vault-choice="save" autofocus>${offer.update ? 'Aktualisieren' : 'Speichern'}</button></div></div>`,
    );
    if (choice === 'save') {
      try {
        await api.vaultSavePending(tab.id);
        offers.delete(tab.id);
        saved.delete(originOf(offer.origin));
        toast?.(`Passwort für ${hostOf(offer.origin)} gespeichert.`);
        notifyChanged();
      } catch (error) {
        toast?.(String(error?.message || error));
      }
    } else {
      offers.delete(tab.id);
      api.vaultDismissPending(tab.id);
    }
    refreshUI?.();
  }

  button.addEventListener('click', () => {
    const tab = currentTab();
    if (!tab) return;
    const offer = offers.get(tab.id);
    if (offer) return answerOffer(tab, offer);
    const list = saved.get(originOf(tab.url)) || [];
    if (list.length === 1) return fill(tab, list[0]);
    if (list.length > 1) return chooseAndFill(tab, list);
  });
  // Settings changed the vault (delete, wipe): forget cached lists.
  window.addEventListener('luna-vault-changed', () => {
    saved.clear();
    refreshUI?.();
  });
  return { update, status: () => status };
}
