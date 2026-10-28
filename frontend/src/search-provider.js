import { getLanguage } from './i18n.js';
import { esc } from './ui.js';
import './styles/search-provider.css';

export const copy = (de, en) => (getLanguage() === 'en' ? en : de);
export const providerName = (tavily) => (tavily ? 'Tavily' : 'Brave');
export const providerURL = (tavily) =>
  tavily ? 'https://app.tavily.com/home' : 'https://api-dashboard.search.brave.com/app/keys';
const icons = {
  tavily:
    '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z"/><path d="m20 3 .5 1.5L22 5l-1.5.5L20 7l-.5-1.5L18 5l1.5-.5Z"/>',
  brave: '<path d="m12 3 8 4-1.5 10L12 22l-6.5-5L4 7Z"/><path d="m8 10 4 2 4-2M12 12v5"/>',
  google: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c5 5 5 11 0 16-5-5-5-11 0-16Z"/>',
};

export function searchChoicesHTML({ tavily = true, google = false, scope = 'setup' } = {}) {
  const selected = google ? 'google' : tavily ? 'tavily' : 'brave';
  const choices = [
    {
      id: 'tavily',
      name: 'Tavily',
      badge: copy('Empfohlen', 'Recommended'),
      detail: copy('Gratis-Kontingent', 'Free allowance'),
      text: copy(
        '1.000 Credits im Monat. Keine Kreditkarte nötig.',
        '1,000 credits per month. No credit card required.',
      ),
      footer: 'Luna Search',
    },
    {
      id: 'brave',
      name: 'Brave Search',
      badge: '',
      detail: copy('Dein eigener API-Key', 'Your own API key'),
      text: copy(
        'Die bisherige Suchanbindung bleibt verfügbar.',
        'The existing search provider stays available.',
      ),
      footer: 'Luna Search',
    },
    {
      id: 'google',
      name: 'Google',
      badge: '',
      detail: copy('Ohne API-Key', 'No API key'),
      text: copy(
        'Klassisch im Web suchen. Ohne Einrichtung.',
        'Search the web as usual. No setup needed.',
      ),
      footer: copy('Externe Ergebnisse', 'External results'),
    },
  ];
  return `<div class="search-provider-grid" role="radiogroup" aria-label="${copy('Suchmaschine wählen', 'Choose a search engine')}">${choices.map((p) => `<button type="button" role="radio" aria-checked="${selected === p.id}" tabindex="${selected === p.id ? 0 : -1}" class="search-provider-card ${selected === p.id ? 'selected' : ''} ${p.id === 'tavily' ? 'recommended' : ''}" ${scope === 'setup' ? `data-setup="${p.id === 'brave' ? 'luna' : p.id}"` : `data-act="search-provider" data-provider="${p.id}"`} aria-label="${esc(p.name)}"><span class="provider-top"><span class="provider-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[p.id]}</svg></span><span class="provider-check" aria-hidden="true">${selected === p.id ? '✓' : ''}</span></span><span class="provider-title">${p.name}</span><span class="provider-detail">${p.detail}</span><span class="provider-description">${p.text}</span><span class="provider-footer">${p.footer}${p.badge ? `<span class="provider-badge">${p.badge}</span>` : ''}</span></button>`).join('')}</div>`;
}

export function searchSetupHTML({ tavily, google, hasKey, busy, portal, copied, split }) {
  const name = providerName(tavily);
  return `<div class="search-setup-intro"><span class="setup-eyebrow">${copy('DEINE SUCHE. DEINE WAHL.', 'YOUR SEARCH. YOUR CHOICE.')}</span><h1>${copy('Finde deinen Weg<br>durchs Web.', 'Find your way<br>around the web.')}</h1><p>${copy('Luna Search zeigt dir Ergebnisse direkt im Browser. Wähle, wer für dich sucht.', 'Luna Search brings results into your browser. Choose who searches for you.')}</p></div>
    ${searchChoicesHTML({ tavily, google })}
    <div class="search-connection" aria-live="polite">
    ${
      google
        ? `<div class="connection-heading"><span class="connection-orb">G</span><div><h2>${copy('Einfach mit Google loslegen', 'Get started with Google')}</h2><p>${copy('Deine Suchbegriffe werden an Google gesendet.', 'Your search terms are sent to Google.')}</p></div></div><button type="button" class="setup-primary search-continue" data-setup="next">${copy('Mit Google weiter →', 'Continue with Google →')}</button>`
        : `<div class="connection-heading"><span class="connection-orb">${tavily ? '✦' : 'B'}</span><div><h2>Luna Search <span>· ${name}</span></h2><p>${tavily ? copy('Gratis: 1.000 Credits/Monat. Konto und API-Key nötig.', 'Free: 1,000 credits/month. Account and API key required.') : copy('Verbinde deinen Brave-API-Key mit Luna.', 'Connect your Brave API key to Luna.')}</p></div></div>
    ${tavily ? `<div class="search-free-note">${copy('Eine einfache Suche kostet 1 Credit. Weitere Nutzung richtet sich nach deinem Tavily-Tarif.', 'One basic search uses 1 credit. Further usage depends on your Tavily plan.')}</div>` : ''}
    <div class="search-key-step"><span class="step-number">1</span><div><b>${copy('API-Key holen', 'Get an API key')}</b><p>${copy('Dashboard öffnen, anmelden und deinen Key kopieren. Luna fügt ihn automatisch ein.', 'Open the dashboard, sign in and copy your key. Luna inserts it automatically.')}</p></div><button type="button" class="search-dashboard" data-setup="portal">${portal ? copy('Dashboard anzeigen ↗', 'Show dashboard ↗') : copy('Dashboard öffnen ↗', 'Open dashboard ↗')}</button></div>
    <form class="setup-keyform search-keyform" autocomplete="off"><label for="setupKey"><span class="step-number">2</span>${name} API-Key</label><div><input id="setupKey" type="password" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="${tavily ? 'tvly-…' : copy('API-Key hier einfügen', 'Paste your API key here')}" ${busy ? 'disabled' : ''}><button class="setup-primary" type="submit" ${busy ? 'disabled' : ''}>${busy ? copy('Speichert …', 'Saving…') : split ? copy('Fertig', 'Done') : copy('Speichern & weiter', 'Save & continue')}</button></div></form>
    ${copied && !portal ? `<button type="button" class="setup-quiet" data-setup="notdone">${copy('Hey, ich war noch nicht fertig', "Hey, I wasn't finished yet")}</button>` : ''}
    ${copied && split ? `<p class="search-key-privacy">${copy('Ich war zu aufgeregt. Mach links in Ruhe weiter. Gib hier deinen Key ein und klicke dann auf „Fertig“.', 'Take your time on the left. Enter your key here, then click Done.')}</p>` : ''}
    ${hasKey ? `<div class="search-configured"><span>✓ ${copy('Key sicher gespeichert', 'Key stored securely')}</span><button type="button" data-setup="next">${copy('Weiter →', 'Continue →')}</button></div>` : ''}
    <p class="search-key-privacy">${copy('Dein Key bleibt geschützt im App-Speicher und wird nur an den ausgewählten Suchanbieter gesendet.', 'Your key stays in protected app storage and is sent only to the selected search provider.')}</p>`
    }</div>`;
}

document.addEventListener('keydown', (event) => {
  const card = event.target.closest('.search-provider-card');
  if (
    !card ||
    !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
  )
    return;
  event.preventDefault();
  const cards = [...card.parentElement.querySelectorAll('.search-provider-card')];
  const index = cards.indexOf(card);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? cards.length - 1
        : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + cards.length) %
          cards.length;
  cards[next].focus();
  cards[next].click();
});
