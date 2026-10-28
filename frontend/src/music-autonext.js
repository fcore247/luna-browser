import { t as l10n } from './i18n.js';
import { WINDOWS } from './platform.js';
import * as api from './api.js';
import { createBrowserNotifications } from './notifications.js';

// One shared entry point for the search button and drag/drop. Provider errors
// reach the user only after both queue routes have failed.
export function initAutoNext({
  cover,
  toast,
  notifications = createBrowserNotifications({ cover }),
  onPreferenceChange = () => {},
  host = document.querySelector('#toolbar'),
}) {
  let busy = false;
  const pending = document.createElement('div');
  pending.className = 'music-next-pending';
  pending.hidden = true;
  const label = document.createElement('span');
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = '×';
  cancel.setAttribute('aria-label', l10n('Vorgemerkten Song abbrechen'));
  pending.append(label, cancel);
  host?.append(pending);
  function update(status) {
    pending.hidden = status.status !== 'waiting';
    label.textContent = l10n('Vorgemerkt: ') + (status.title || l10n('Spotify-Song'));
    pending.title =
      l10n('Luna startet diesen Song am Titelende oder beim Überspringen: ') +
      (status.title || l10n('Spotify-Song'));
  }
  cancel.onclick = async () => {
    cancel.disabled = true;
    try {
      await api.spotifyCancelNext();
      update({});
      toast(l10n('Vormerkung aufgehoben'));
    } catch (e) {
      toast(String(e?.message || e));
    } finally {
      cancel.disabled = false;
    }
  };
  api.onSpotifyNext(async (status) => {
    // Read the current state so a late event cannot hide a newer reservation.
    try {
      update(await api.spotifyNextStatus());
    } catch {
      update(status);
    }
    if (status.status === 'started')
      toast(l10n('Luna hat „') + status.title + l10n('“ übernommen'));
    if (status.status === 'error') toast(status.message, 10000);
  });
  api
    .spotifyNextStatus()
    .then(update)
    .catch(() => {});

  async function ask(uri, title, reason) {
    await notifications.ask({
      kind: 'music',
      eyebrow: l10n('LUNA MUSIC · EIN KLEINER UMWEG'),
      title: l10n('Soll Luna übernehmen?'),
      message: l10n(
        'Irgendwie will die Warteschlange heute nicht so richtig.\nSoll Luna deinen Song automatisch starten, sobald der aktuelle zu Ende geht – oder du ihn überspringst?',
      ),
      highlight: { label: l10n('ALS NÄCHSTES'), value: title || l10n('Dein Spotify-Song') },
      note: l10n(
        'Über die Spotify-App auf diesem Mac · Start eine Sekunde vor Schluss\nEine bestehende Luna-Vormerkung wird ersetzt.',
      ),
      remember: {
        label: l10n('Luna soll das immer machen'),
        description: l10n(
          'Bei Problemen automatisch übernehmen. In den Spotify-Einstellungen wieder ausschaltbar.',
        ),
      },
      details: String(reason?.message || reason),
      cancelLabel: l10n('Nicht jetzt'),
      confirmLabel: l10n('Ja, Luna übernimmt'),
      onConfirm: async ({ checked }) => {
        await api.spotifyScheduleNext(uri, title || l10n('Spotify-Song'));
        update({ uri, title, status: 'waiting' });
        if (checked) {
          try {
            const prefs = await api.setPref('spotifyAutoNextAlways', true);
            if (!prefs?.spotifyAutoNextAlways)
              throw new Error(l10n('Einstellung konnte nicht gespeichert werden.'));
            onPreferenceChange(true);
          } catch {
            toast(
              l10n('Song vorgemerkt. Die dauerhafte Auswahl konnte nicht gespeichert werden.'),
              10000,
            );
          }
        }
        toast('„' + (title || l10n('Dein Song')) + l10n('“ ist für Luna vorgemerkt'));
      },
    });
    return false;
  }

  return async function enqueue(uri, title) {
    if (busy) {
      toast(l10n('Bitte schließe zuerst die laufende Warteschlangen-Anfrage ab.'));
      return false;
    }
    busy = true;
    try {
      try {
        await api.spotifyQueue(uri);
      } catch (e) {
        if (WINDOWS) {
          toast(
            String(e?.message || e) +
              l10n(' Die lokale Luna-Vormerkung ist unter Windows noch nicht verfügbar.'),
            10000,
          );
          return false;
        }
        // Read the saved choice each time, including after disabling in Settings.
        const prefs = await api.prefs().catch(() => ({}));
        if (prefs?.spotifyAutoNextAlways) {
          try {
            await api.spotifyScheduleNext(uri, title || l10n('Spotify-Song'));
            update({ uri, title, status: 'waiting' });
          } catch (error) {
            toast(String(error?.message || error), 10000);
          }
          return false;
        }
        return await ask(uri, title, e);
      }
      toast('„' + (title || l10n('Dein Song')) + l10n('“ zur Warteschlange hinzugefügt'));
      return true;
    } finally {
      busy = false;
    }
  };
}
