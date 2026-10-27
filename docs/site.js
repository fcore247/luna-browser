/* Luna Browser – Webseite
   Farbwelten wie im Browser (gleiche Formeln wie color-themes.js), Hell/Dunkel,
   Sternenhimmel, Scroll-Szenen, kleine Live-Demos und ein Installationsdialog. */
(() => {
  'use strict';
  const { t, language } = window.lunaI18n;
  const locale = language === 'de' ? 'de-DE' : 'en-US';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
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
    light: { desk: '#efb6d5', body: '#f3e1ec', panel: '#fbf2f7', card: '#ffffff', hover: '#ead0df', soft: '#f7e9f1', line: '#ecd3e2', line3: '#e2c6d6', ink: '#3a2433', ink2: '#4a3042', mute2: '#6f5264', mute: '#8a6c7e', acc: '#a24d84', 'acc-l': '#d889b8', pri: '#3a2433', 'pri-fg': '#fbeef6', tab: 'rgba(251,238,246,.55)' },
    dark: { desk: '#2b1626', body: '#251621', panel: '#1c1119', card: '#2d1b28', hover: '#3a2434', soft: '#2f1e29', line: '#43293a', line3: '#563548', ink: '#fbeef6', ink2: '#e6d2de', mute2: '#b99dae', mute: '#a98d9e', acc: '#d889b8', 'acc-l': '#f4a9d4', pri: '#fbeef6', 'pri-fg': '#2a1621', tab: 'rgba(255,255,255,.06)' },
  };
  function palette(id, dark) {
    const th = THEMES.find((x) => x[0] === id) || THEMES[0];
    const [, , h, s] = th;
    const c = (l, sat = s) => `hsl(${h} ${sat}% ${l}%)`;
    let v;
    if (id === 'luna') v = { ...LUNA[dark ? 'dark' : 'light'] };
    else if (dark) v = { desk: c(14), body: c(11, 22), panel: c(9, 20), card: c(16, 22), hover: c(22, 24), soft: c(18, 22), line: c(25, 22), line3: c(33, 24), ink: c(96, 24), ink2: c(88, 22), mute2: c(74, 18), mute: c(67, 16), acc: c(73), 'acc-l': c(80), pri: c(94, 25), 'pri-fg': c(12, 25), tab: c(18, 22) };
    else v = { desk: c(83), body: c(92, 30), panel: c(97, 25), card: '#ffffff', hover: c(87, 30), soft: c(94, 25), line: c(86, 24), line3: c(79, 25), ink: c(18, 28), ink2: c(25, 26), mute2: c(37, 20), mute: c(44, 18), acc: c(38), 'acc-l': c(62), pri: c(20, 30), 'pri-fg': '#ffffff', tab: c(90, 30) };
    v.tile = c(dark ? 50 : 40, Math.max(s, 8));
    const l = dark ? 35 : 76;
    v.a1 = `hsl(${h} ${s}% ${l}%)`; v.a2 = `hsl(${h + 12} ${s}% ${l}%)`; v.a3 = `hsl(${h + 24} ${s}% ${l}%)`;
    return { v, h, s };
  }
  const root = document.documentElement;
  let themeId = store.get('luna-site-theme');
  if (!THEMES.some((x) => x[0] === themeId)) themeId = 'luna';
  // Luna ist eine Nacht: dunkel als Standard, hell nur auf Wunsch
  let mode = store.get('luna-site-mode') || 'dark';
  let accent = '#d889b8';

  function apply(persist) {
    const dark = mode === 'dark';
    const { v, h, s } = palette(themeId, dark);
    root.dataset.mode = mode;
    root.style.colorScheme = dark ? 'dark' : 'light';
    root.style.setProperty('--h', h); root.style.setProperty('--s', s);
    for (const [k, val] of Object.entries(v)) root.style.setProperty(`--${k}`, val);
    accent = v.acc;
    const meta = $('meta[name=theme-color]'); if (meta) meta.content = dark ? `hsl(${h} ${s * 0.6}% 5%)` : `hsl(${h} ${s}% 96%)`;
    $$('[data-theme-id]').forEach((b) => b.setAttribute('aria-checked', b.dataset.themeId === themeId));
    const name = THEMES.find((x) => x[0] === themeId)[1];
    $('#themeName').textContent = name;
    if (persist) { store.set('luna-site-theme', themeId); store.set('luna-site-mode', mode); }
  }
  // Farbwechsel breitet sich als Kreis vom Klickpunkt aus
  function transition(e, fn) {
    if (!document.startViewTransition || reduce) { fn(); return; }
    const x = e?.clientX ?? innerWidth / 2, y = e?.clientY ?? innerHeight / 2;
    root.style.setProperty('--vx', `${x}px`); root.style.setProperty('--vy', `${y}px`);
    document.startViewTransition(fn);
  }
  const setTheme = (id, e) => transition(e, () => { themeId = id; apply(true); });

  const dots = $('#dots'), planets = $('#planets');
  THEMES.forEach(([id, name, h, s], i) => {
    const d = document.createElement('button');
    d.dataset.themeId = id; d.setAttribute('role', 'radio'); d.title = name; d.setAttribute('aria-label', name);
    d.style.setProperty('--c', `hsl(${h} ${Math.max(s, 18)}% 68%)`);
    d.onclick = (e) => setTheme(id, e);
    dots.append(d);

    const p = document.createElement('div');
    p.className = 'planet'; p.style.setProperty('--a', `${(i / THEMES.length) * 360 - 90}deg`);
    p.innerHTML = `<div class="pin"><button role="radio" data-theme-id="${id}" aria-label="${name}" style="--c1:hsl(${h} ${Math.max(s, 18)}% 62%);--c2:hsl(${h + 20} ${Math.max(s, 18)}% 40%)"></button><label>${name}</label></div>`;
    p.querySelector('button').onclick = (e) => setTheme(id, e);
    planets.append(p);
  });
  $('#mode').onclick = (e) => transition(e, () => { mode = mode === 'dark' ? 'light' : 'dark'; apply(true); });
  apply(false);

  /* ---------- Überschrift Buchstabe für Buchstabe ---------- */
  (function split() {
    const line = $('#heroTitle .line');
    if (!line || reduce) return;
    let i = 0;
    const words = line.textContent.trim().split(/\s+/);
    line.innerHTML = '';
    words.forEach((w, wi) => {
      const ws = document.createElement('span'); ws.className = 'w';
      for (const ch of w) { const c = document.createElement('span'); c.className = 'ch'; c.style.setProperty('--i', i++); c.textContent = ch; ws.append(c); }
      line.append(ws); if (wi < words.length - 1) line.append(' ');
    });
    line.setAttribute('aria-label', words.join(' '));
  })();

  /* ---------- Sternenhimmel ---------- */
  const sky = $('#sky'), sc = sky.getContext('2d');
  let SW = 0, SH = 0, stars = [], shooting = [];
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  function fitSky() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    SW = innerWidth; SH = innerHeight; sky.width = SW * dpr; sky.height = SH * dpr; sc.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round((SW * SH) / 5200);
    stars = Array.from({ length: n }, () => ({ x: Math.random() * SW, y: Math.random() * SH, z: Math.random() ** 2, tw: Math.random() * Math.PI * 2, sp: 0.5 + Math.random() * 2 }));
  }
  fitSky(); addEventListener('resize', fitSky);
  let scrollY0 = scrollY;
  function drawSky(now) {
    sc.clearRect(0, 0, SW, SH);
    const dark = mode === 'dark';
    mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
    sc.fillStyle = dark ? '#fff' : accent;
    for (const s of stars) {
      const depth = 0.2 + s.z;
      let x = s.x - mouse.x * 18 * depth, y = (s.y - scrollY0 * 0.06 * depth - mouse.y * 18 * depth) % SH;
      if (y < 0) y += SH;
      const a = (dark ? 0.25 + 0.75 * s.z : 0.12 + 0.3 * s.z) * (0.55 + 0.45 * Math.sin(now / 1000 * s.sp + s.tw));
      sc.globalAlpha = a;
      const r = 0.4 + s.z * 1.4;
      sc.beginPath(); sc.arc(x, y, r, 0, 7); sc.fill();
    }
    // Sternschnuppen
    if (dark && Math.random() < 0.006 && shooting.length < 2) shooting.push({ x: Math.random() * SW * 0.8, y: Math.random() * SH * 0.4, vx: 9 + Math.random() * 6, vy: 3 + Math.random() * 3, life: 1 });
    for (const s of shooting) {
      s.x += s.vx; s.y += s.vy; s.life -= 0.018;
      const g = sc.createLinearGradient(s.x, s.y, s.x - s.vx * 14, s.y - s.vy * 14);
      g.addColorStop(0, `rgba(255,255,255,${s.life})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      sc.globalAlpha = 1; sc.strokeStyle = g; sc.lineWidth = 1.6; sc.lineCap = 'round';
      sc.beginPath(); sc.moveTo(s.x, s.y); sc.lineTo(s.x - s.vx * 14, s.y - s.vy * 14); sc.stroke();
    }
    shooting = shooting.filter((s) => s.life > 0);
    sc.globalAlpha = 1;
    if (!reduce) requestAnimationFrame(drawSky);
  }
  requestAnimationFrame(drawSky);

  /* ---------- Maus: Lichtschein, Mond-Parallaxe, magnetische Buttons ---------- */
  const glow = $('#glow'), moonWrap = $('#moonWrap');
  if (finePointer && !reduce) {
    document.body.classList.add('pointer');
    addEventListener('pointermove', (e) => {
      glow.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
      mouse.tx = e.clientX / SW - 0.5; mouse.ty = e.clientY / SH - 0.5;
      moonWrap.style.setProperty('--mx', `${mouse.tx * -30}px`); moonWrap.style.setProperty('--my', `${mouse.ty * -30}px`);
    }, { passive: true });
    $$('.magnetic').forEach((b) => {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px,${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
      });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
    const priv = $('#privCard');
    priv.addEventListener('pointermove', (e) => {
      const r = priv.getBoundingClientRect();
      priv.style.setProperty('--lx', `${e.clientX - r.left}px`); priv.style.setProperty('--ly', `${e.clientY - r.top}px`);
    });
    // Browserfenster kippt leicht mit der Maus
    const stage = $('#stage'), win = $('#win');
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      win.style.rotate = `${((e.clientY - r.top) / r.height - 0.5) * -4}deg ${((e.clientX - r.left) / r.width - 0.5) * 6}deg 0`;
    });
    stage.addEventListener('pointerleave', () => { win.style.rotate = ''; });
  }

  /* ---------- Scroll: Fortschritt, Navigation, 3D-Fenster, Trailer, Mondaufgang ---------- */
  const nav = $('#nav'), progress = $('#progress'), win = $('#win'), stageEl = $('#stage'), video = $('#video'), closing = $('#download');
  const navLinks = $$('.links a');
  let lastY = scrollY, ticking = false;
  function onScroll() {
    ticking = false;
    const y = scrollY, vh = innerHeight;
    scrollY0 = y;
    progress.style.setProperty('--p', y / Math.max(1, document.documentElement.scrollHeight - vh));
    nav.classList.toggle('hide', y > lastY && y > 400 && !document.querySelector('dialog[open]'));
    lastY = y;
    if (!reduce) {
      const sr = stageEl.getBoundingClientRect();
      const p = clamp(1 - (sr.top - vh * 0.15) / (vh * 0.65));
      win.style.setProperty('--p', p.toFixed(3)); stageEl.style.setProperty('--p', p.toFixed(3));
      moonWrap.style.setProperty('--scrollMoon', `${y * 0.35}px`);
      const vr = video.getBoundingClientRect();
      video.style.setProperty('--v', clamp(1 - (vr.top - vh * 0.1) / (vh * 0.7)).toFixed(3));
      const cr = closing.getBoundingClientRect();
      closing.style.setProperty('--c', clamp((cr.top) / vh).toFixed(3));
    }
    let current = null;
    for (const a of navLinks) { const s = $(a.getAttribute('href')); if (s && s.getBoundingClientRect().top < vh * 0.4) current = a; }
    navLinks.forEach((a) => a.classList.toggle('on', a === current));
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* ---------- Einblenden beim Scrollen ---------- */
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal').forEach((el) => io.observe(el));

  // Zahlen zählen hoch
  const cio = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return; cio.unobserve(e.target);
    const el = e.target, to = +el.dataset.count, suf = el.dataset.suffix || '';
    if (reduce || to === 0) { el.textContent = to + suf; return; }
    const t0 = performance.now();
    (function step(now) { const k = clamp((now - t0) / 1600); el.textContent = Math.round(to * (1 - (1 - k) ** 4)) + suf; if (k < 1) requestAnimationFrame(step); })(t0);
  }), { threshold: 0.6 });
  $$('[data-count]').forEach((el) => cio.observe(el));

  /* ---------- Ticker ---------- */
  const words = ['theme', 'play bohemian rhapsody', 'spotify daft punk', 'chat', 'tab open youtube.com', t('einstellungen'), 'commands'];
  const words2 = ['sonos', 'screenshot', 'notes', 'tab close', 'spotify queue', 'theme ozean', 'chat sira'];
  const fill = (el, list) => { const html = list.map((w, i) => `<span${i % 3 === 0 ? ' class="hl"' : ''}>${w}</span>`).join(''); el.innerHTML = html.repeat(4); };
  fill($('#tk1'), words); fill($('#tk2'), words2);

  /* ---------- Uhr & Begrüßung ---------- */
  function tickClock() {
    const d = new Date(), hr = d.getHours();
    $('#clock').textContent = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    $('#greet').textContent = hr < 5 ? t('Gute Nacht') : hr < 11 ? t('Guten Morgen') : hr < 17 ? t('Guten Tag') : hr < 22 ? t('Guten Abend') : t('Gute Nacht');
    $('#date').textContent = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  }
  tickClock(); setInterval(tickClock, 15000);

  // Adressleiste tippt sich selbst
  (async function typeAddr() {
    const el = $('#addrTyped');
    const list = [t('Suchen oder Adresse eingeben'), 'theme', 'play bohemian rhapsody', 'spotify daft punk', 'tab open youtube.com'];
    if (reduce) return;
    await sleep(1800);
    for (let i = 0; ; i++) {
      const w = list[i % list.length];
      el.style.color = i % list.length === 0 ? 'var(--mute)' : 'var(--ink)';
      el.style.fontFamily = i % list.length === 0 ? '' : 'ui-monospace,SFMono-Regular,Menlo,monospace';
      for (let k = 0; k <= w.length; k++) { el.textContent = w.slice(0, k) || ' '; await sleep(70); }
      await sleep(1900);
      for (let k = w.length; k >= 0; k--) { el.textContent = w.slice(0, k) || ' '; await sleep(28); }
      await sleep(350);
    }
  })();

  /* ---------- Story: Szenen wechseln mit dem Scrollen ---------- */
  const ADDR = { cmd: 'luna://commands', gest: 'luna://gestures', music: 'luna://spotify', ai: 'luna://chat' };
  let scene = 'cmd';
  const setScene = (s) => {
    scene = s;
    $$('.scene').forEach((el) => el.classList.toggle('on', el.dataset.scene === s));
    $$('.step').forEach((el) => el.classList.toggle('on', el.dataset.scene === s));
    $('#dvAddr').textContent = ADDR[s];
  };
  setScene('cmd');
  const sio = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setScene(e.target.dataset.scene); }), { rootMargin: '-45% 0px -45% 0px' });
  $$('.step').forEach((el) => sio.observe(el));

  // Demos laufen nur, wenn ihre Szene sichtbar ist
  const device = $('#device');
  let deviceVisible = false;
  new IntersectionObserver((es) => { deviceVisible = es[0].isIntersecting; }).observe(device);
  async function until(s) { while (scene !== s || !deviceVisible || document.hidden) await sleep(300); }

  /* Befehle */
  const CMDS = [
    ['theme', () => `<div class="row">${THEMES.slice(0, 7).map((x) => `<i class="sw" style="--c:hsl(${x[2]} ${Math.max(x[3], 18)}% 68%)"></i>`).join('')}<span style="margin-left:12px">${t('Farbwelt wählen')}</span></div><div class="row"><span class="ico">☾</span><span>${t('Hell')} / ${t('Dunkel')}</span></div>`],
    ['play bohemian rhapsody', () => `<div class="row"><i class="cov"></i><span>Bohemian Rhapsody · Queen<br><small>${t('Wiedergabe an Spotify übergeben')}</small></span></div>`],
    ['spotify daft punk', () => '<div class="row"><i class="cov"></i><span>One More Time<br><small>Daft Punk</small></span></div><div class="row"><i class="cov" style="filter:hue-rotate(60deg)"></i><span>Get Lucky<br><small>Daft Punk</small></span></div><div class="row"><i class="cov" style="filter:hue-rotate(140deg)"></i><span>Around the World<br><small>Daft Punk</small></span></div>'],
    ['tab open youtube.com', () => `<div class="row"><span class="ico">⊕</span><span>${t('Neuer Tab')} · youtube.com</span></div>`],
    ['chat', () => `<div class="row"><span class="ico">✧</span><span>${t('Luna Chat geöffnet')}</span></div>`],
  ];
  (async function cmdLoop() {
    const el = $('#cmdText'), out = $('#cmdOut');
    if (reduce) { el.textContent = CMDS[0][0]; out.innerHTML = CMDS[0][1](); return; }
    for (let i = 0; ; i++) {
      const [c, html] = CMDS[i % CMDS.length];
      await until('cmd');
      out.innerHTML = '';
      for (let k = 0; k <= c.length; k++) { el.textContent = c.slice(0, k); await sleep(75); }
      await sleep(250); out.innerHTML = html();
      await sleep(2600);
      for (let k = c.length; k >= 0; k--) { el.textContent = c.slice(0, k); await sleep(20); }
    }
  })();

  /* KI-Chat */
  (async function chatLoop() {
    const u = $('#msgU'), a = $('#msgA'), at = $('#msgAt');
    const Q = t('Fasse diese Seite kurz zusammen');
    const A = t('Das ist Lunas Startseite: Uhr, Suche und deine Musik, alles ruhig an einem Ort. Ich laufe lokal auf deinem Mac, ganz ohne Konto.');
    if (reduce) { u.textContent = Q; at.textContent = A; return; }
    for (;;) {
      await until('ai');
      u.textContent = ''; at.textContent = ''; a.style.opacity = 0; u.classList.add('typing');
      for (let k = 1; k <= Q.length; k++) { u.textContent = Q.slice(0, k); await sleep(38); }
      u.classList.remove('typing'); await sleep(500); a.style.opacity = 1; a.classList.add('typing');
      for (let k = 1; k <= A.length; k++) { at.textContent = A.slice(0, k); await sleep(22); }
      a.classList.remove('typing'); await sleep(4200);
    }
  })();

  /* Musik: Zeit, Fortschritt, Visualizer, Lautstärke */
  (function music() {
    const tNow = $('#tNow'), fillBar = $('#barFill'), viz = $('#viz');
    const bars = Array.from({ length: 36 }, () => { const i = document.createElement('i'); i.style.height = '100%'; viz.append(i); return i; });
    let s = 72;
    setInterval(() => {
      if (document.hidden || scene !== 'music') return;
      s = s >= 319 ? 72 : s + 1;
      tNow.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      fillBar.style.width = `${(s / 320) * 100}%`;
      const v = 45 + Math.sin(s / 4) * 20;
      $('.v1').style.setProperty('--v', `${v}%`); $('.v2').style.setProperty('--v', `${v}%`);
    }, 1000);
    if (reduce) return;
    (function frame(now) {
      if (scene === 'music' && deviceVisible) bars.forEach((b, i) => { b.style.transform = `scaleY(${0.15 + Math.abs(Math.sin(now / 260 + i * 0.6) * Math.cos(now / 410 + i * 0.25))})`; });
      requestAnimationFrame(frame);
    })(0);
  })();

  /* Gesten: selbst zeichnen, S oder Kreis wird erkannt */
  const gest = $('#gest'), cv = $('#trail'), ctx = cv.getContext('2d');
  let pts = [], stroke = [], down = false, W = 0, H = 0;
  function fit() {
    const r = gest.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(fit).observe(gest); fit();
  const pos = (e) => { const r = gest.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }; };
  gest.addEventListener('pointerdown', (e) => {
    down = true; gest.setPointerCapture(e.pointerId); const p = pos(e);
    pts.push({ ...p, brk: true }); stroke = [p];
    $('#gHint').style.opacity = 0; gest.classList.add('drawn'); e.preventDefault();
  });
  gest.addEventListener('pointermove', (e) => { if (down) { const p = pos(e); pts.push(p); stroke.push(p); } });
  const show = (id, ms = 2200) => { const el = $(id); el.classList.add('show'); setTimeout(() => el.classList.remove('show'), ms); };
  function recognise(path) {
    if (path.length < 8) return null;
    const xs = path.map((p) => p.x), ys = path.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), size = Math.max(w, h);
    if (size < 40) return null;
    const a = path[0], b = path[path.length - 1];
    const closed = Math.hypot(a.x - b.x, a.y - b.y) < size * 0.3;
    return closed ? 'circle' : 's';
  }
  const up = () => {
    if (!down) return; down = false;
    const kind = recognise(stroke);
    if (kind === 'circle') { $('#gBadge kbd').textContent = '○'; $('#gBadgeT').textContent = t('Notizzettel'); show('#gBadge'); show('#gNote', 2600); }
    else if (kind === 's') { $('#gBadge kbd').textContent = 'S'; $('#gBadgeT').textContent = 'Screenshot'; show('#gBadge'); flash(); show('#gPol', 2600); }
  };
  function flash() { gest.animate([{ background: '#fff' }, { background: '' }], { duration: 350 }); }
  gest.addEventListener('pointerup', up); gest.addEventListener('pointercancel', up);
  // Ohne Interaktion zeichnet die Demo das S selbst
  (async function autoGesture() {
    if (reduce) return;
    const path = $('#gPath'), len = path.getTotalLength();
    for (;;) {
      await until('gest');
      await sleep(1400);
      if (gest.classList.contains('drawn') || scene !== 'gest') continue;
      const box = $('.gest-s').getBoundingClientRect(), gb = gest.getBoundingClientRect();
      const sx = box.width / 300, sy = box.height / 220;
      for (let d = 0; d <= len; d += len / 50) {
        const p = path.getPointAtLength(d);
        pts.push({ x: box.left - gb.left + p.x * sx, y: box.top - gb.top + p.y * sy, t: performance.now(), brk: d === 0 });
        await sleep(16);
      }
      $('#gBadge kbd').textContent = 'S'; $('#gBadgeT').textContent = 'Screenshot';
      show('#gBadge'); flash(); show('#gPol', 2600);
      await sleep(4200);
    }
  })();
  (function draw() {
    if (scene === 'gest' || pts.length) {
      ctx.clearRect(0, 0, W, H);
      const now = performance.now();
      pts = pts.filter((p) => now - p.t < 1400);
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i], q = pts[i - 1]; if (p.brk) continue;
        const life = 1 - (now - p.t) / 1400;
        ctx.globalAlpha = Math.max(0, life);
        ctx.strokeStyle = accent; ctx.lineWidth = 3 + 9 * life; ctx.lineCap = 'round';
        ctx.shadowColor = accent; ctx.shadowBlur = 18 * life;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
    requestAnimationFrame(draw);
  })();

  /* ---------- Trailer ---------- */
  const vid = $('#vid'), box = $('#video');
  const playToggle = () => (vid.paused ? vid.play() : vid.pause());
  $('#vplay').onclick = () => vid.play();
  vid.addEventListener('click', playToggle);
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
