import { t } from './i18n.js';
import './styles/star-prompt.css';

export const STAR_PROMPT_KEY = 'luna-star-prompt';
export const STAR_PROMPT_DELAY = 2 * 24 * 60 * 60 * 1000;
export const STAR_REPOSITORY = 'https://github.com/fcore247/luna-browser';

// Only local timestamps and the dismissal are stored; no usage data leaves Luna.
export function initStarPrompt({ host, openURL, now = Date.now }) {
  let state;
  try {
    state = JSON.parse(localStorage.getItem(STAR_PROMPT_KEY) || 'null');
    if (!state || !Number.isFinite(state.firstUsedAt) || state.firstUsedAt > now()) {
      state = { firstUsedAt: now(), dismissed: false };
      localStorage.setItem(STAR_PROMPT_KEY, JSON.stringify(state));
    }
  } catch {
    return;
  }
  if (state.dismissed) return;

  const group = document.createElement('div');
  group.id = 'lunaStarPrompt';
  group.hidden = true;
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', t('Gefällt dir Luna?'));
  const action = document.createElement('button');
  action.type = 'button';
  action.textContent = t('Gefällt dir Luna?');
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = '×';
  dismiss.setAttribute('aria-label', t('Nicht mehr fragen'));
  dismiss.title = t('Nicht mehr fragen');
  group.append(action, dismiss);
  host.append(group);

  let askingForStar = false;
  function finish() {
    state.dismissed = true;
    try {
      localStorage.setItem(STAR_PROMPT_KEY, JSON.stringify(state));
    } catch {
      // Still dismiss for this session if storage becomes unavailable.
    }
    group.remove();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', check);
  }
  action.addEventListener('click', () => {
    if (!askingForStar) {
      askingForStar = true;
      action.textContent = t('Ja? Gib Luna einen GitHub-Stern!');
      action.title = t('Luna auf GitHub öffnen und einen Stern dalassen');
      return;
    }
    openURL(STAR_REPOSITORY);
    finish();
  });
  dismiss.addEventListener('click', finish);
  function check() {
    if (document.visibilityState !== 'visible') return;
    try {
      if (JSON.parse(localStorage.getItem(STAR_PROMPT_KEY) || 'null')?.dismissed) {
        finish();
        return;
      }
    } catch {
      return;
    }
    group.hidden = now() - state.firstUsedAt <= STAR_PROMPT_DELAY;
  }
  const timer = setInterval(check, 60_000);
  document.addEventListener('visibilitychange', check);
  check();
}
