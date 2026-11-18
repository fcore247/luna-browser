import * as api from './api.js';
import { t, msg } from './i18n.js';
import { esc } from './ui.js';
import './styles/opennava.css';

export function programmePage(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
    if (raw.includes('\\') || u.pathname.includes('//')) return false;
    switch (u.hostname.replace(/^www\./, '')) {
      case 'ardmediathek.de':
        return /^\/(video|sendung)\/[^/]+/.test(u.pathname);
      case 'arte.tv':
        return /^\/(de|fr|en|es|it|pl)\/videos\/[^/]+/.test(u.pathname);
      case 'zdf.de':
        return !!u.pathname.replaceAll('/', '');
      case 'netflix.com':
        return (
          /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:watch|title)\/[0-9]{1,16}\/?$/i.test(u.pathname) ||
          (/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?browse\/?$/i.test(u.pathname) &&
            /^[0-9]{1,16}$/.test(u.searchParams.get('jbv') || ''))
        );
    }
  } catch {}
  return false;
}

export function createOpenNava(cover) {
  const dialog = document.querySelector('#nava-dialog');
  const el = (id) => dialog.querySelector('#nava-' + id);
  let poll,
    session = 0,
    savedURL = '',
    hadPending = false,
    seenStatus = '';
  let opener,
    request = 0;

  function message(text, error = false) {
    el('message').textContent = text;
    el('message').classList.toggle('err', error);
  }

  async function status(epoch = session) {
    const current = ++request;
    const s = await api.openNavaStatus();
    if (!dialog.open || epoch !== session || current !== request || !s) return;
    const signature = JSON.stringify(s);
    if (signature === seenStatus) return;
    seenStatus = signature;
    const device = s.device?.serial;
    const pending = s.pending || [];
    el('device').textContent = device
      ? s.device.name + ' · ' + device
      : t('Kein Fernseher verbunden');
    el('forget').hidden = !device;
    el('discover').hidden = false;
    el('devices').hidden = false;
    el('help').hidden = !!device;
    el('save').disabled = !device;
    el('queue').hidden = !pending.length;
    el('queue-issue').textContent = t(s.issue || '');
    el('items').innerHTML = pending
      .map(
        (item) =>
          msg`<li><span>${esc(item.title)}</span><button type="button" class="btn sm" data-remove="${esc(item.url)}" aria-label="Aus Warteschlange entfernen">Entfernen</button></li>`,
      )
      .join('');
    if (!pending.length && hadPending && savedURL)
      message(t('Deine Vormerkungen sind auf dem TV angekommen.'));
    hadPending = !!pending.length;
  }

  async function discover(afterConnect = false) {
    const epoch = session;
    const devices = await api.openNavaDevices();
    if (epoch !== session || !dialog.open) return;
    el('devices').innerHTML = (devices || [])
      .map(
        ({ name, serial }) =>
          `<button type="button" class="btn" data-device="${esc(serial)}">${esc(name)} · ${esc(serial)}</button>`,
      )
      .join('');
    if (afterConnect) {
      message(
        t('Bestätige die Freigabe am TV und wähle ihn aus. Falls er noch fehlt, suche erneut.'),
      );
    } else if (!devices?.length)
      message(t('Kein autorisiertes Gerät gefunden. Verbinde deinen Fernseher und suche erneut.'));
  }

  dialog.addEventListener('close', () => {
    ++session;
    clearInterval(poll);
    cover(false);
    opener?.focus();
  });
  dialog.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button || button.type === 'submit') return;
    if (button.id === 'nava-close') return dialog.close();
    const epoch = session;
    button.disabled = true;
    try {
      if (button.id === 'nava-discover') await discover();
      if (button.id === 'nava-connect') {
        await api.openNavaConnect(el('address').value.trim());
        if (epoch === session) await discover(true);
      }
      if (button.dataset.device) {
        await api.openNavaPair(button.dataset.device);
        if (epoch === session) {
          el('devices').replaceChildren();
          el('manual').open = false;
          message(t('Fernseher verbunden.'));
        }
      }
      if (button.id === 'nava-forget') {
        await api.openNavaForget();
        if (epoch === session) {
          el('devices').replaceChildren();
          message('');
        }
      }
      if (button.dataset.remove) {
        await api.openNavaRemove(button.dataset.remove);
        if (epoch === session) {
          savedURL = '';
          message(t('Aus der Warteschlange entfernt.'));
        }
      }
      if (button.id === 'nava-retry') {
        await api.openNavaRetry();
        if (epoch === session) message(t('Zustellung wird erneut versucht.'));
      }
      await status(epoch);
    } catch (e) {
      if (epoch === session) message(t(String(e?.message || e)), true);
    } finally {
      button.disabled = false;
    }
  });
  el('address').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      el('connect').click();
    }
  });
  dialog.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const epoch = session;
    if (el('save').disabled) return;
    el('save').disabled = true;
    try {
      await api.openNavaSave(el('url').value.trim(), el('title').value.trim());
      if (epoch !== session) return;
      savedURL = el('url').value;
      hadPending = true;
      seenStatus = '';
      message(t('Vorgemerkt. Luna sendet den Titel, sobald der Fernseher erreichbar ist.'));
      await status(epoch);
    } catch (e) {
      if (epoch === session) message(t(String(e?.message || e)), true);
    } finally {
      if (epoch === session) el('save').disabled = false;
    }
  });

  return {
    async open(tab) {
      if (dialog.open) return;
      const epoch = ++session;
      opener = document.activeElement;
      const supported = programmePage(tab?.url);
      el('title').value = supported ? (tab.title || '').slice(0, 240) : '';
      el('url').value = supported ? tab.url : '';
      el('device').textContent = t('Verbindung wird geprüft …');
      el('manual').open = false;
      el('items').replaceChildren();
      el('devices').replaceChildren();
      for (const id of ['forget', 'discover', 'help', 'queue']) el(id).hidden = true;
      el('save').disabled = true;
      savedURL = '';
      hadPending = false;
      seenStatus = '';
      message('');
      cover(true);
      dialog.showModal();
      try {
        await status(epoch);
        if (epoch === session) poll = setInterval(() => status(epoch).catch(() => {}), 1500);
      } catch (e) {
        if (epoch === session) message(t(String(e?.message || e)), true);
      }
    },
  };
}
