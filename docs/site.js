/* Luna Browser – Webseite
   Abendhimmel (Canvas), ein Browserfenster, das beim Scrollen Lunas Funktionen zeigt,
   Farbwelten wie im Browser (gleiche Formeln wie color-themes.js) und ein Installationsdialog. */
(() => {
  'use strict';
  const { t, language } = window.lunaI18n;
  const locale = language === 'de' ? 'de-DE' : 'en-US';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  /* ---------- Farbwelten ---------- */
  const THEMES = [
    ['luna', 'Luna Rosé', 325, 38], ['lavender', t('Lavendel'), 265, 42], ['ocean', t('Ozean'), 210, 55],
    ['mint', t('Minze'), 163, 40], ['forest', t('Wald'), 140, 30], ['sand', 'Sand', 38, 42],
    ['peach', t('Pfirsich'), 22, 58], ['cherry', t('Kirschblüte'), 350, 46], ['arctic', t('Arktis'), 188, 43],
    ['graphite', t('Graphit'), 220, 5],
  ];
  // handabgestimmte Originalpalette von Luna Rosé (hell, so wie Luna im Fenster erscheint)
  const LUNA = { desk: '#efb6d5', body: '#f3e1ec', panel: '#fbf2f7', card: '#ffffff', hover: '#ead0df', soft: '#f7e9f1', line: '#ecd3e2', line3: '#e2c6d6', ink: '#3a2433', ink2: '#4a3042', mute: '#8a6c7e', acc: '#a24d84', 'acc-l': '#d889b8', pri: '#3a2433', 'pri-fg': '#fbeef6' };
  // Namen, die auf der Seite selbst schon vergeben sind, bekommen ein -a (für "App")
  const RENAME = { card: 'card-a', line: 'line-a', mute: 'mute-a' };
  function palette(id) {
    const th = THEMES.find((x) => x[0] === id) || THEMES[0];
    const [, , h, s] = th;
    const c = (l, sat = s) => `hsl(${h} ${sat}% ${l}%)`;
    const v = id === 'luna' ? { ...LUNA } : { desk: c(83), body: c(92, 30), panel: c(97, 25), card: '#ffffff', hover: c(87, 30), soft: c(94, 25), line: c(86, 24), line3: c(79, 25), ink: c(18, 28), ink2: c(25, 26), mute: c(44, 18), acc: c(38), 'acc-l': c(62), pri: c(20, 30), 'pri-fg': '#ffffff' };
    v.tile = c(40, Math.max(s, 8));
    v.a1 = `hsl(${h} ${s}% 76%)`; v.a2 = `hsl(${h + 12} ${s}% 76%)`; v.a3 = `hsl(${h + 24} ${s}% 76%)`;
    return { v, h, s };
  }
  function paint(el, id) {
    const { v, h, s } = palette(id);
    el.style.setProperty('--h', h); el.style.setProperty('--s', s);
    for (const [k, val] of Object.entries(v)) el.style.setProperty(`--${RENAME[k] || k}`, val);
  }
  const root = document.documentElement;
  let themeId = store.get('luna-site-theme');
  if (!THEMES.some((x) => x[0] === themeId)) themeId = 'luna';

  function setTheme(id, persist) {
    themeId = id;
    paint(root, id);
    $$('[data-theme-id]').forEach((b) => b.setAttribute('aria-checked', b.dataset.themeId === id));
    $('#themeName').textContent = THEMES.find((x) => x[0] === id)[1];
    drawSky();
    if (persist) store.set('luna-site-theme', id);
  }

  /* ---------- Abendhimmel: Wolken aus Rauschen, einmal berechnet, je Farbwelt neu eingefärbt ---------- */
  const SW = 640, SH = 400;
  const skyCanvas = $('#skyCanvas');
  skyCanvas.width = SW; skyCanvas.height = SH;
  const sctx = skyCanvas.getContext('2d');
  const density = new Float32Array(SW * SH), light = new Float32Array(SW * SH);
  (function cloudField() {
    const P = new Uint8Array(512);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
    const val = (x, y) => P[P[x & 255] + (y & 255)] / 255;
    const fade = (q) => q * q * (3 - 2 * q);
    function noise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi);
      const a = val(xi, yi), b = val(xi + 1, yi), c = val(xi, yi + 1), d = val(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    }
    function fbm(x, y, oct = 5) { let s = 0, amp = 0.5, f = 1; for (let o = 0; o < oct; o++) { s += amp * noise(x * f, y * f); f *= 2.03; amp *= 0.5; } return s; }
    const raw = new Float32Array(SW * SH);
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      const u = x / 230, v = y / 130;
      const wx = fbm(u + 3.1, v + 1.7, 3), wy = fbm(u + 8.3, v + 2.8, 3);
      raw[y * SW + x] = fbm(u + wx * 0.7, v + wy * 0.5);
    }
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      const nx = x / SW - 0.5, ny = y / SH;
      // oben in der Mitte bleibt der Himmel frei für die Überschrift, unten und an den Seiten türmen sich Wolken
      const mask = clamp(0.1 + 0.9 * ny ** 1.6 + 1.1 * Math.abs(nx) ** 1.8 - 0.25 * Math.exp(-(nx * nx) / 0.02) * (1 - ny));
      const n = raw[y * SW + x] * (0.55 + mask * 0.75);
      const d = clamp((n - 0.44) / 0.2) * clamp(mask * 1.8);
      density[y * SW + x] = d * d * (3 - 2 * d);
      const yu = Math.max(0, y - 6), mu = clamp(0.1 + 0.9 * (yu / SH) ** 1.6 + 1.1 * Math.abs(nx) ** 1.8 - 0.25 * Math.exp(-(nx * nx) / 0.02) * (1 - yu / SH));
      const up = raw[yu * SW + x] * (0.55 + mu * 0.75);
      light[y * SW + x] = clamp(0.62 + (n - up) * 6);
    }
  })();
  const hsl2rgb = (h, s, l) => {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    return [0, 8, 4].map((n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  };
  let skyTimer;
  function drawSky() {
    clearTimeout(skyTimer);
    skyTimer = setTimeout(() => {
      const th = THEMES.find((x) => x[0] === themeId);
      const h = th[2], s = Math.max(th[3], 22);
      const img = sctx.createImageData(SW, SH), d = img.data;
      const lit = hsl2rgb(h + 15, 70, 95), mid = hsl2rgb(h, s + 10, 80), shade = hsl2rgb(h - 10, s, 52);
      for (let y = 0; y < SH; y++) {
        const k = y / SH;
        const top = hsl2rgb(h - 25, s * 0.7 + 10, 24 + 8 * k), bot = hsl2rgb(h + 20, s + 15, 46 + 32 * k * k);
        const sky = top.map((v, i) => v + (bot[i] - v) * k);
        for (let x = 0; x < SW; x++) {
          const i = y * SW + x, a = density[i], l = light[i];
          const cl = l > 0.5 ? mid.map((v, j) => v + (lit[j] - v) * (l - 0.5) * 2) : shade.map((v, j) => v + (mid[j] - v) * l * 2);
          d[i * 4] = sky[0] + (cl[0] - sky[0]) * a;
          d[i * 4 + 1] = sky[1] + (cl[1] - sky[1]) * a;
          d[i * 4 + 2] = sky[2] + (cl[2] - sky[2]) * a;
          d[i * 4 + 3] = 255;
        }
      }
      sctx.putImageData(img, 0, 0);
      try { root.style.setProperty('--sky-img', `url(${skyCanvas.toDataURL('image/jpeg', 0.86)})`); } catch {}
    }, 30);
  }

  /* ---------- Farbwahl in der Feature-Karte und im Fenster ---------- */
  const swatches = $('#swatches');
  THEMES.forEach(([id, name, h, s]) => {
    const b = document.createElement('button');
    b.dataset.themeId = id; b.setAttribute('role', 'radio'); b.title = name; b.setAttribute('aria-label', name);
    b.style.setProperty('--c', `hsl(${h} ${Math.max(s, 18)}% 66%)`);
    b.onclick = () => setTheme(id, true);
    swatches.append(b);
  });
  const dropGrid = $('#dropGrid');
  THEMES.forEach(([id, name, h, s]) => {
    const c = document.createElement('div');
    c.className = 'tcard'; c.dataset.tcard = id;
    c.innerHTML = `<div style="background:linear-gradient(160deg,hsl(${h} ${s}% 82%),hsl(${h + 20} ${s}% 70%))"></div>${name}`;
    dropGrid.append(c);
  });
  setTheme(themeId, false);

  /* ---------- Navigation wird über dunklem Grund fest ---------- */
  const nav = $('#nav'), skywrap = $('.skywrap');
  const navState = () => nav.classList.toggle('solid', skywrap.getBoundingClientRect().bottom < 64);

  /* ---------- Uhr & Begrüßung ---------- */
  function tickClock() {
    const d = new Date(), hr = d.getHours();
    $('#clock').textContent = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    $('#greet').textContent = hr < 5 ? t('Gute Nacht') : hr < 11 ? t('Guten Morgen') : hr < 17 ? t('Guten Tag') : hr < 22 ? t('Guten Abend') : t('Gute Nacht');
    $('#date').textContent = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  }
  tickClock(); setInterval(tickClock, 15000);

  /* ---------- Tour: Scrollen wechselt den Inhalt im Fenster ---------- */
  const tour = $('#tour'), frame = $('#frame'), caption = $('#caption'), pager = $$('#pager i');
  const addr = $('#addr'), addrText = $('#addrText');
  const STEPS = [
    { cap: t('Deine Startseite, ruhig und aufgeräumt.'), cmd: '' },
    { cap: t('Tippe theme, und Luna zieht sich um.'), cmd: 'theme' },
    { cap: t('Mal ein S, und der Screenshot ist im Kasten.'), cmd: '' },
    { cap: t('Tippe play, und deine Musik spielt mit.'), cmd: 'play one more time' },
    { cap: t('Sira hilft, ganz lokal auf deinem Mac.'), cmd: 'chat' },
  ];
  let step = -1, run = 0;
  const placeholder = t('Suchen oder Adresse eingeben');

  async function typeAddr(text, my) {
    addr.classList.add('typing');
    for (let k = 0; k <= text.length; k++) { if (my !== run) return false; addrText.textContent = text.slice(0, k) || ' '; await sleep(reduce ? 0 : 65); }
    return true;
  }
  function resetAddr() { addr.classList.remove('typing'); addrText.textContent = placeholder; }

  async function enter(n) {
    const my = ++run;
    frame.dataset.step = '';
    frame.removeAttribute('style');
    $$('.tcard').forEach((c) => c.classList.remove('on'));
    $('#spotTitle').textContent = 'Spotify'; $('#spotSub').textContent = t('Keine Wiedergabe');
    $('#siraText').textContent = '';
    const s = STEPS[n];
    if (s.cmd) { if (!(await typeAddr(s.cmd, my))) return; await sleep(reduce ? 0 : 250); }
    else resetAddr();
    if (my !== run) return;
    frame.dataset.step = n;
    if (n === 1) {
      // Farbwelten der Reihe nach durchprobieren
      const order = ['ocean', 'mint', 'peach', 'lavender', 'sand', themeId];
      for (let i = 0; my === run; i = (i + 1) % order.length) {
        const id = order[i];
        $$('.tcard').forEach((c) => c.classList.toggle('on', c.dataset.tcard === id));
        if (id === themeId) frame.removeAttribute('style'); else paint(frame, id);
        await sleep(1500);
      }
    }
    if (n === 3) { resetAddr(); $('#spotTitle').textContent = 'One More Time'; $('#spotSub').textContent = 'Daft Punk'; }
    if (n === 4) {
      resetAddr();
      const A = t('Das ist Lunas Startseite: Uhr, Suche und deine Musik, alles ruhig an einem Ort. Ich laufe lokal auf deinem Mac, ganz ohne Konto.');
      await sleep(700);
      for (let k = 1; k <= A.length && my === run; k++) { $('#siraText').textContent = A.slice(0, k); await sleep(reduce ? 0 : 18); }
    }
  }
  function setStep(n) {
    if (n === step) return;
    step = n;
    caption.classList.add('out');
    setTimeout(() => { caption.textContent = STEPS[n].cap; caption.classList.remove('out'); }, 200);
    pager.forEach((p, i) => p.classList.toggle('on', i === n));
    enter(n);
  }

  function onScroll() {
    const r = tour.getBoundingClientRect();
    const p = clamp(-r.top / Math.max(1, r.height - innerHeight));
    setStep(Math.min(STEPS.length - 1, Math.floor(p * STEPS.length * 0.999)));
    navState();
  }
  let ticking = false;
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; onScroll(); }); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  /* ---------- Einblenden ---------- */
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  $$('.reveal').forEach((el) => io.observe(el));

  /* ---------- Befehle: Schalter ---------- */
  $$('.cmd-row .sw').forEach((sw) => {
    sw.setAttribute('role', 'switch'); sw.tabIndex = 0;
    sw.setAttribute('aria-label', sw.parentElement.querySelector('code').textContent);
    const sync = () => sw.setAttribute('aria-checked', sw.classList.contains('on'));
    const flip = () => { sw.classList.toggle('on'); sync(); };
    sw.addEventListener('click', flip);
    sw.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
    sync();
  });

  /* ---------- Gesten: selbst zeichnen, S oder Kreis wird erkannt ---------- */
  const draw = $('#draw'), cv = $('#trail'), ctx = cv.getContext('2d');
  let pts = [], stroke = [], down = false, W = 0, H = 0, drawing = false;
  function fit() {
    const r = draw.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(fit).observe(draw); fit();
  const pos = (e) => { const r = draw.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }; };
  function recognise(path) {
    if (path.length < 8) return null;
    const xs = path.map((p) => p.x), ys = path.map((p) => p.y);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (size < 40) return null;
    const a = path[0], b = path[path.length - 1];
    return Math.hypot(a.x - b.x, a.y - b.y) < size * 0.3 ? 'circle' : 's';
  }
  function loop() {
    ctx.clearRect(0, 0, W, H);
    const now = performance.now();
    pts = pts.filter((p) => now - p.t < 1200);
    ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], q = pts[i - 1]; if (p.brk) continue;
      const life = 1 - (now - p.t) / 1200;
      ctx.globalAlpha = Math.max(0, life); ctx.lineWidth = 2 + 6 * life;
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (pts.length || down) requestAnimationFrame(loop); else drawing = false;
  }
  const kick = () => { if (!drawing) { drawing = true; requestAnimationFrame(loop); } };
  draw.addEventListener('pointerdown', (e) => {
    down = true; draw.setPointerCapture(e.pointerId); const p = pos(e);
    pts.push({ ...p, brk: true }); stroke = [p]; $('#drawHint').style.opacity = 0; kick(); e.preventDefault();
  });
  draw.addEventListener('pointermove', (e) => { if (down) { const p = pos(e); pts.push(p); stroke.push(p); } });
  let resultTimer;
  const up = () => {
    if (!down) return; down = false;
    const kind = recognise(stroke);
    if (!kind) return;
    const res = $('#drawResult');
    res.textContent = kind === 'circle' ? t('○ Notizzettel geöffnet') : t('S · Screenshot gespeichert');
    res.classList.add('show'); clearTimeout(resultTimer);
    resultTimer = setTimeout(() => res.classList.remove('show'), 1800);
  };
  draw.addEventListener('pointerup', up); draw.addEventListener('pointercancel', up);

  /* ---------- Trailer ---------- */
  const vid = $('#vid'), box = $('#video');
  $('#vplay').onclick = () => vid.play();
  vid.addEventListener('click', () => (vid.paused ? vid.play() : vid.pause()));
  vid.addEventListener('play', () => { box.classList.add('playing'); vid.controls = true; });
  vid.addEventListener('pause', () => { if (vid.ended || vid.currentTime === 0) box.classList.remove('playing'); });
  vid.addEventListener('ended', () => { box.classList.remove('playing'); vid.controls = false; });
  $$('.vlang button').forEach((b) => b.addEventListener('click', () => {
    const was = !vid.paused; $$('.vlang button').forEach((x) => x.classList.toggle('on', x === b));
    vid.src = b.dataset.src; vid.load(); if (was) vid.play();
  }));

  /* ---------- Installationsdialog ---------- */
  const modal = $('#downloadDialog');
  const command = `( installer=$(mktemp) && trap 'rm -f "$installer"' EXIT && curl --fail --location --proto '=https' --proto-redir '=https' https://raw.githubusercontent.com/fcore247/luna-browser/main/docs/install.sh -o "$installer" && /bin/bash "$installer" )`;
  $('#installCommand').textContent = command;
  $$('.download').forEach((b) => b.addEventListener('click', () => modal.showModal()));
  $('.close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) { const r = modal.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) modal.close(); } });
  $('#copy').addEventListener('click', async () => {
    const status = $('#copyStatus');
    try { await navigator.clipboard.writeText(command); status.textContent = t('Kopiert. Jetzt im Terminal einfügen und Enter drücken.'); }
    catch { const sel = getSelection(), range = document.createRange(); range.selectNodeContents($('#installCommand')); sel.removeAllRanges(); sel.addRange(range); status.textContent = t('Bitte den markierten Befehl mit ⌘ C kopieren.'); }
  });
})();
