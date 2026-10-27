/* Luna Browser – Webseite
   Luna-Wellen (Canvas), ein Browserfenster, das beim Scrollen Lunas Funktionen zeigt,
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
  // handabgestimmte Originalpalette von Luna Rosé
  const LUNA = {
    light: { desk: '#efb6d5', body: '#f3e1ec', panel: '#fbf2f7', card: '#ffffff', hover: '#ead0df', soft: '#f7e9f1', line: '#ecd3e2', line3: '#e2c6d6', ink: '#3a2433', ink2: '#4a3042', mute: '#8a6c7e', acc: '#a24d84', 'acc-l': '#d889b8', pri: '#3a2433', 'pri-fg': '#fbeef6' },
    dark: { desk: '#2b1626', body: '#251621', panel: '#1c1119', card: '#2d1b28', hover: '#3a2434', soft: '#2f1e29', line: '#43293a', line3: '#563548', ink: '#fbeef6', ink2: '#e6d2de', mute: '#a98d9e', acc: '#d889b8', 'acc-l': '#f4a9d4', pri: '#fbeef6', 'pri-fg': '#2a1621' },
  };
  // Namen, die auf der Seite selbst schon vergeben sind, bekommen ein -a (für "App")
  const RENAME = { card: 'card-a', line: 'line-a', mute: 'mute-a' };
  function palette(id, dark) {
    const th = THEMES.find((x) => x[0] === id) || THEMES[0];
    const [, , h, s] = th;
    const c = (l, sat = s) => `hsl(${h} ${sat}% ${l}%)`;
    let v;
    if (id === 'luna') v = { ...LUNA[dark ? 'dark' : 'light'] };
    else if (dark) v = { desk: c(14), body: c(11, 22), panel: c(9, 20), card: c(16, 22), hover: c(22, 24), soft: c(18, 22), line: c(25, 22), line3: c(33, 24), ink: c(96, 24), ink2: c(88, 22), mute: c(67, 16), acc: c(73), 'acc-l': c(80), pri: c(94, 25), 'pri-fg': c(12, 25) };
    else v = { desk: c(83), body: c(92, 30), panel: c(97, 25), card: '#ffffff', hover: c(87, 30), soft: c(94, 25), line: c(86, 24), line3: c(79, 25), ink: c(18, 28), ink2: c(25, 26), mute: c(44, 18), acc: c(38), 'acc-l': c(62), pri: c(20, 30), 'pri-fg': '#ffffff' };
    v.tile = c(dark ? 50 : 40, Math.max(s, 8));
    const l = dark ? 35 : 76;
    v.a1 = `hsl(${h} ${s}% ${l}%)`; v.a2 = `hsl(${h + 12} ${s}% ${l}%)`; v.a3 = `hsl(${h + 24} ${s}% ${l}%)`;
    return { v, h, s };
  }
  // Hell, Dunkel oder System gilt für Luna im Fenster; die Seite selbst bleibt dunkel
  const sysDark = matchMedia('(prefers-color-scheme: dark)');
  let appMode = store.get('luna-site-appmode');
  if (!['light', 'dark', 'system'].includes(appMode)) appMode = 'light';
  const appDark = () => appMode === 'dark' || (appMode === 'system' && sysDark.matches);
  function paint(el, id) {
    const { v, h, s } = palette(id, appDark());
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

  /* ---------- Luna-Wellen: Farbverlauf und sanft wogende Wellen in der Farbwelt ---------- */
  const skyCanvas = $('#skyCanvas'), sctx = skyCanvas.getContext('2d');
  let skyColors = null, skyW = 0, skyH = 0, skyVisible = true;
  function waveColors() {
    const th = THEMES.find((x) => x[0] === themeId);
    const h = th[2], s = Math.max(th[3], 18);
    return {
      top: `hsl(${h - 15} ${s * 0.8}% 16%)`, bottom: `hsl(${h + 5} ${s}% 40%)`,
      // von hinten nach vorne immer heller, wie die Wellen auf Lunas Startseite
      layers: [0, 1, 2, 3, 4].map((i) => `hsl(${h + i * 6} ${s + 4}% ${36 + i * 10}% / ${0.5 + i * 0.1})`),
      rim: `hsl(${h + 10} 80% 92% / .35)`,
    };
  }
  // Jede Welle ist eine Summe aus zwei Sinuskurven, die sich langsam verschieben
  const WAVES = [
    { y: 0.5, a: 0.05, f: 1.2, p: 0.3, v: 0.05 },
    { y: 0.6, a: 0.045, f: 1.6, p: 2.1, v: -0.07 },
    { y: 0.7, a: 0.04, f: 1.1, p: 4.2, v: 0.06 },
    { y: 0.8, a: 0.035, f: 1.9, p: 1.4, v: -0.05 },
    { y: 0.9, a: 0.03, f: 1.4, p: 3.3, v: 0.08 },
  ];
  function paintWaves(c, w, h, time, col) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, col.top); g.addColorStop(1, col.bottom);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    WAVES.forEach((wv, i) => {
      const yAt = (x) => {
        const u = x / w;
        return h * (wv.y + wv.a * Math.sin(u * Math.PI * 2 * wv.f + wv.p + time * wv.v) + wv.a * 0.5 * Math.sin(u * Math.PI * 2 * (wv.f * 2.3) - wv.p - time * wv.v * 1.7));
      };
      c.beginPath(); c.moveTo(0, yAt(0));
      for (let x = 0; x <= w; x += 8) c.lineTo(x, yAt(x));
      c.lineTo(w, h); c.lineTo(0, h); c.closePath();
      c.fillStyle = col.layers[i]; c.fill();
      c.beginPath(); c.moveTo(0, yAt(0));
      for (let x = 0; x <= w; x += 8) c.lineTo(x, yAt(x));
      c.strokeStyle = col.rim; c.lineWidth = 1.2; c.stroke();
    });
  }
  function fitSky() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    skyW = innerWidth; skyH = innerHeight;
    skyCanvas.width = skyW * dpr; skyCanvas.height = skyH * dpr;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fitSky(); addEventListener('resize', fitSky);
  new IntersectionObserver((es) => { skyVisible = es[0].isIntersecting; }).observe($('.skywrap'));
  (function frame(now) {
    if (skyColors && skyVisible && !document.hidden) paintWaves(sctx, skyW, skyH, reduce ? 0 : now / 1000, skyColors);
    requestAnimationFrame(frame);
  })(0);
  function drawSky() {
    skyColors = waveColors();
    // Standbild der Wellen für Karten und den Schluss
    const off = document.createElement('canvas'); off.width = 960; off.height = 600;
    paintWaves(off.getContext('2d'), 960, 600, 0, skyColors);
    try { root.style.setProperty('--sky-img', `url(${off.toDataURL('image/jpeg', 0.88)})`); } catch {}
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
  // Farbwelten im virtuellen Browser: anklicken probiert sie direkt aus
  let userPicked = false;
  const dropGrid = $('#dropGrid');
  THEMES.forEach(([id, name, h, s]) => {
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'tcard'; c.dataset.tcard = id; c.dataset.themeId = id; c.setAttribute('role', 'radio');
    c.innerHTML = `<div style="background:linear-gradient(160deg,hsl(${h} ${s}% 82%),hsl(${h + 20} ${s}% 70%))"></div>${name}`;
    c.onclick = () => {
      userPicked = true; frame.removeAttribute('style');
      setTheme(id, true);
      $$('.tcard').forEach((x) => x.classList.toggle('on', x === c));
    };
    dropGrid.append(c);
  });
  const segs = $$('#seg button');
  function setAppMode(m, persist) {
    appMode = m;
    segs.forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === m));
    frame.classList.toggle('app-dark', appDark());
    paint(root, themeId);
    if (persist) store.set('luna-site-appmode', m);
  }
  segs.forEach((b) => b.addEventListener('click', () => { userPicked = true; frame.removeAttribute('style'); setAppMode(b.dataset.mode, true); }));
  sysDark.addEventListener?.('change', () => { if (appMode === 'system') setAppMode('system', false); });
  // Adressleiste oder "Erscheinungsbild" öffnen die Auswahl jederzeit, ein Klick daneben schließt sie
  const togglePicker = (open) => { frame.classList.toggle('picker', open); if (open) $$('.tcard').forEach((x) => x.classList.toggle('on', x.dataset.tcard === themeId)); };
  $('#addr').addEventListener('click', (e) => { e.stopPropagation(); togglePicker(!frame.classList.contains('picker')); });
  $('#appearanceChip').addEventListener('click', (e) => { e.stopPropagation(); togglePicker(true); });
  $('#drop').addEventListener('click', (e) => e.stopPropagation());
  $('.app-page').addEventListener('click', () => togglePicker(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') togglePicker(false); });

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
  setAppMode(appMode, false);
  setTheme(themeId, false);
  const STEPS = [
    { cap: t('Deine Startseite, ruhig und aufgeräumt.'), cmd: '' },
    { cap: t('Klick eine Farbwelt an und probier sie aus.'), cmd: 'theme' },
    { cap: t('Mal ein S, und der Screenshot ist im Kasten.'), cmd: '' },
    { cap: t('Tippe play, und deine Musik spielt mit.'), cmd: 'play one more time' },
    { cap: t('Deine KI macht aus nervigen Seiten deine eigenen.'), cmd: 'wetter-portal.example' },
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
    frame.classList.remove('picker');
    frame.removeAttribute('style');
    $$('.tcard').forEach((c) => c.classList.remove('on'));
    $('#spotTitle').textContent = 'Spotify'; $('#spotSub').textContent = t('Keine Wiedergabe');
    frame.classList.remove('made');
    $$('.ag-log li').forEach((li) => li.classList.remove('on'));
    const s = STEPS[n];
    if (s.cmd) { if (!(await typeAddr(s.cmd, my))) return; await sleep(reduce ? 0 : 250); }
    else resetAddr();
    if (my !== run) return;
    frame.dataset.step = n;
    if (n === 1) {
      $$('.tcard').forEach((c) => c.classList.toggle('on', c.dataset.tcard === themeId));
      // Solange niemand selbst klickt, probiert Luna ein paar Farbwelten vor
      await sleep(1200);
      const order = ['ocean', 'mint', 'peach', 'lavender', themeId];
      for (let i = 0; my === run && !userPicked; i = (i + 1) % order.length) {
        const id = order[i];
        $$('.tcard').forEach((c) => c.classList.toggle('on', c.dataset.tcard === id));
        if (id === themeId) frame.removeAttribute('style'); else paint(frame, id);
        await sleep(1600);
      }
      if (my === run) { frame.removeAttribute('style'); $$('.tcard').forEach((c) => c.classList.toggle('on', c.dataset.tcard === themeId)); }
    }
    if (n === 3) { resetAddr(); $('#spotTitle').textContent = 'One More Time'; $('#spotSub').textContent = 'Daft Punk'; }
    if (n === 4) {
      resetAddr(); addrText.textContent = 'wetter-portal.example';
      // Die verbundene KI arbeitet die Schritte ab, dann wird aus der nervigen Seite die persönliche
      const items = $$('.ag-log li');
      for (let i = 0; i < items.length && my === run; i++) {
        await sleep(reduce ? 0 : 700);
        if (my !== run) return;
        items[i].classList.add('on');
        if (i === items.length - 1) { frame.classList.add('made'); addrText.textContent = t('Mein Wetter · persönliche Seite'); }
      }
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

  /* ---------- Eigene Seiten: Vorher/Nachher zum Ziehen ---------- */
  const compare = $('#compare');
  const copy = (sel) => { const n = $(sel).cloneNode(true); n.removeAttribute('id'); return n; };
  $('#cmpBefore').append(copy('#clutter'));
  $('#cmpAfter').append(copy('#ppage'));
  const cmpRange = $('#cmpRange');
  const setCmp = () => compare.style.setProperty('--x', `${cmpRange.value}%`);
  cmpRange.addEventListener('input', setCmp); setCmp();

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
