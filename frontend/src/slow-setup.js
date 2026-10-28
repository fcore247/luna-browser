import { t as l10n, msg as l10nMsg } from './i18n.js';
import * as api from './api.js';
import './styles/slow-setup.css';

let accepted = false;
let current = null;
export const slowSetupVisible = () => current !== null;
export function showSlowSetup({ hideNative = () => {}, resume = () => {} } = {}) {
  if (accepted || current) return;
  const previous = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'slow-setup';
  dialog.innerHTML = l10nMsg`<h1>Wir sind uns nicht sicher, ob Luna auf deinem Rechner Spaß macht.</h1><p>Die Einrichtung braucht gerade länger als erwartet. Das kann auch an der Verbindung liegen.</p><div><button type="button" data-continue>Ich will es trotzdem probieren</button><button type="button" data-remove>Luna entfernen</button></div><p role="status"></p>`;
  document.body.append(dialog);
  current = dialog;
  hideNative();
  dialog.showModal();
  dialog.querySelector('[data-continue]').focus();
  const proceed = () => {
    accepted = true;
    dialog.close();
    dialog.remove();
    current = null;
    resume();
    previous?.focus?.();
  };
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    proceed();
  });
  dialog.querySelector('[data-continue]').onclick = proceed;
  dialog.querySelector('[data-remove]').onclick = async () => {
    const button = dialog.querySelector('[data-remove]');
    button.disabled = true;
    try {
      const result = await api.removeLuna();
      dialog.querySelector('[role=status]').textContent = result || l10n('Luna wird entfernt …');
    } catch (error) {
      dialog.querySelector('[role=status]').textContent =
        l10nMsg`Luna konnte nicht entfernt werden: ${String(error)}`;
    } finally {
      button.disabled = false;
    }
  };
}

export function createLoadWatchdog(delay, onSlow) {
  let timer;
  return {
    start() {
      if (timer === undefined)
        timer = setTimeout(() => {
          timer = undefined;
          onSlow();
        }, delay);
    },
    stop() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
