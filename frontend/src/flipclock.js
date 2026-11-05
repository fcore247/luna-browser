// Uhrzeit im Stil einer Flip-Disk-Matrix (nach „Flip Disk Matrix“ von 21st.dev, hier als eigenes JS):
// 31 × 11 Scheiben, die einzeln umklappen. Die Zeit steht als 5×7-Punktschrift in der Mitte,
// die unterste Reihe zählt die Sekunden mit, der Doppelpunkt klappt im Sekundentakt.
import { locale, t as l10n } from './i18n.js';

const COLS = 31;
const ROWS = 11;
const GLYPHS = {
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  6: [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ':': [0b00000, 0b00100, 0b00000, 0b00000, 0b00000, 0b00100, 0b00000],
};

// Was gilt als „Uhrzeit“-Suche? Reine Zeit-Wörter, kein Ort (damit „zeit magazin“ normal gesucht wird).
const TIME_QUERIES = new Set([
  'time',
  'the time',
  'time now',
  'current time',
  'what time is it',
  'whats the time',
  'clock',
  'zeit',
  'uhrzeit',
  'uhr',
  'zeit jetzt',
  'wie spät',
  'wie spät ist es',
  'wie viel uhr',
  'wieviel uhr',
  'wie viel uhr ist es',
  'aktuelle uhrzeit',
  'aktuelle zeit',
]);
export const isTimeQuery = (q) =>
  TIME_QUERIES.has(
    String(q ?? '')
      .toLowerCase()
      .replace(/['’?!.]/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );

function frame(date) {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const colon = date.getSeconds() % 2 === 0;
  const chars = [hh[0], hh[1], ':', mm[0], mm[1]];
  const total = chars.length * 6 - 1;
  let ox = Math.floor((COLS - total) / 2);
  const oy = 2;
  for (const c of chars) {
    const bits = GLYPHS[c];
    if (c !== ':' || colon)
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 5; x++) if (bits[y] & (1 << (4 - x))) g[oy + y][ox + x] = true;
    ox += 6;
  }
  // Sekundenleiste in der letzten Reihe
  const lit = Math.round(((date.getSeconds() + 1) / 60) * COLS);
  for (let x = 0; x < lit; x++) g[ROWS - 1][x] = true;
  return g;
}

export function clockHTML() {
  return `<section class="fm" aria-label="${l10n('Uhrzeit')}">
    <div class="fm-head"><span class="fm-eyebrow">${l10n('Uhrzeit')}</span><span class="fm-date"></span></div>
    <div class="fm-bezel"><div class="fm-screen" role="img" aria-label=""></div></div>
    <div class="fm-foot"><span class="fm-tz"></span></div>
  </section>`;
}

// Baut das Raster auf und aktualisiert es im Sekundentakt. Gibt eine Aufräum-Funktion zurück.
export function mountClock(root) {
  const screen = root.querySelector('.fm-screen');
  const dateEl = root.querySelector('.fm-date');
  const tzEl = root.querySelector('.fm-tz');
  if (!screen) return () => {};
  screen.style.setProperty('--cols', COLS);
  const disks = [];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < COLS * ROWS; i++) {
    const d = document.createElement('i');
    d.className = 'fm-disk';
    d.innerHTML = '<b></b><u></u>';
    disks.push(d);
    frag.appendChild(d);
  }
  screen.appendChild(frag);
  try {
    tzEl.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ');
  } catch {
    tzEl.textContent = '';
  }
  let prev = null;
  const paint = () => {
    const now = new Date();
    const g = frame(now);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const on = g[y][x];
        if (!prev || prev[y][x] !== on) disks[y * COLS + x].classList.toggle('on', on);
      }
    prev = g;
    const time = now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
    screen.setAttribute('aria-label', time);
    dateEl.textContent = now.toLocaleDateString(locale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };
  // Erstes Bild ohne Animation, danach klappen die Scheiben
  root.classList.add('fm-init');
  paint();
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('fm-init')));
  let timer;
  const tick = () => {
    paint();
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  };
  timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  return () => clearTimeout(timer);
}
