/* Luna Browser – Webseite
   Eine virtuelle Luna, die wirklich reagiert: Adressleiste mit Befehlen, Tabs, Farbwelten,
   Spotify, Sira-Chat und Mausgesten. Dazu Download mit Plattform-Erkennung. */
(() => {
  'use strict';
  const { t, language } = window.lunaI18n;
  const locale = language === 'de' ? 'de-DE' : 'en-US';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };

  /* ================================================================ Farbwelten
     Gleiche Formeln wie color-themes.js im Browser. */
  const THEMES = [
    ['luna', 'Luna Rosé', 325, 38], ['lavender', t('Lavendel'), 265, 42], ['ocean', t('Ozean'), 210, 55],
    ['mint', t('Minze'), 163, 40], ['forest', t('Wald'), 140, 30], ['sand', 'Sand', 38, 42],
    ['peach', t('Pfirsich'), 22, 58], ['cherry', t('Kirschblüte'), 350, 46], ['arctic', t('Arktis'), 188, 43],
    ['graphite', t('Graphit'), 220, 5],
  ];
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
  root.classList.add('js');
  const sysDark = matchMedia('(prefers-color-scheme: dark)');
  let themeId = store.get('luna-site-theme');
  if (!THEMES.some((x) => x[0] === themeId)) themeId = 'luna';
  let mode = store.get('luna-site-mode') || (sysDark.matches ? 'dark' : 'light');
  let modeAuto = !store.get('luna-site-mode');
  let trailColor = '#a24d84';

  function apply(persist) {
    const dark = mode === 'dark';
    const { v, h, s } = palette(themeId, dark);
    root.dataset.mode = mode;
    root.style.colorScheme = dark ? 'dark' : 'light';
    root.style.setProperty('--h', h); root.style.setProperty('--s', s);
    for (const [k, val] of Object.entries(v)) root.style.setProperty(`--${k}`, val);
    trailColor = v.acc;
    const meta = $('meta[name=theme-color]'); if (meta) meta.content = v.body;
    $$('[data-theme-id]').forEach((b) => b.setAttribute('aria-checked', b.dataset.themeId === themeId));
    $$('.segm button').forEach((b) => b.classList.toggle('on', b.dataset.m === (modeAuto ? 'auto' : mode)));
    if (persist) { store.set('luna-site-theme', themeId); if (!modeAuto) store.set('luna-site-mode', mode); }
  }
  const themeName = (id) => (THEMES.find((x) => x[0] === id) || THEMES[0])[1];
  function setTheme(id, quiet) {
    if (!THEMES.some((x) => x[0] === id)) return;
    themeId = id; apply(true);
    if (!quiet) bounceDock();
  }
  function setMode(m) {
    if (m === 'auto') { modeAuto = true; mode = sysDark.matches ? 'dark' : 'light'; try { localStorage.removeItem('luna-site-mode'); } catch {} }
    else { modeAuto = false; mode = m; }
    apply(true);
  }
  sysDark.addEventListener?.('change', (e) => { if (modeAuto) { mode = e.matches ? 'dark' : 'light'; apply(false); } });

  // Punkte in der Navigation
  const dots = $('#dots');
  THEMES.forEach(([id, name, h, s]) => {
    const d = document.createElement('button');
    d.dataset.themeId = id; d.setAttribute('role', 'radio'); d.title = name; d.setAttribute('aria-label', name);
    d.style.setProperty('--c', `hsl(${h} ${Math.max(s, 18)}% 68%)`);
    d.onclick = () => setTheme(id);
    dots.append(d);
  });
  // Große Kacheln im Farbwelten-Streifen
  const swatches = $('#swatches');
  THEMES.forEach(([id, name], i) => {
    const light = palette(id, false).v, dark = palette(id, true).v;
    const b = el(`<button class="sw" role="radio" data-theme-id="${id}"><span class="mini"><i></i><u></u></span><b>${esc(name)}</b><span>${String(i + 1).padStart(2, '0')} / 10</span><span class="ck"><svg><use href="#i-check"/></svg></span></button>`);
    const setVars = () => {
      const v = mode === 'dark' ? dark : light;
      b.style.setProperty('--c-bg', v.body); b.style.setProperty('--c-ink', v.ink); b.style.setProperty('--c-card', v.card);
      b.style.setProperty('--c-bar', v.panel); b.style.setProperty('--c-tile', v.tile);
    };
    setVars(); b._setVars = setVars;
    b.onclick = () => { setTheme(id); toast(t('Farbwelt') + ': ' + name); };
    swatches.append(b);
  });
  const origApply = apply;
  apply = function (p) { origApply(p); $$('.sw', swatches).forEach((b) => b._setVars()); };
  $('#mode').onclick = () => setMode(mode === 'dark' ? 'light' : 'dark');
  apply(false);

  /* ================================================================ Kleinkram: Nav, Reveal */
  const nav = $('#nav');
  addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8), { passive: true });
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  $$('.reveal').forEach((n) => io.observe(n));

  /* ================================================================ Virtuelle Luna */
  const win = $('#win'), page = $('#page'), tabsEl = $('#tabs'), addr = $('#addr'), drop = $('#drop');
  const isWindows = /Win/i.test(navigator.userAgentData?.platform || navigator.platform || '') || /Windows/i.test(navigator.userAgent);
  const isMac = !isWindows && /Mac/i.test(navigator.userAgentData?.platform || navigator.platform || '');
  win.dataset.os = isWindows ? 'win' : 'mac';
  const mod = isWindows ? 'Ctrl' : '⌘';

  const CATALOG = [
    ['One More Time', 'Daft Punk', 'Discovery'], ['Get Lucky', 'Daft Punk', 'Random Access Memories'], ['Harder, Better, Faster, Stronger', 'Daft Punk', 'Discovery'],
    ['Bohemian Rhapsody', 'Queen', 'A Night at the Opera'], ['Blinding Lights', 'The Weeknd', 'After Hours'], ['Nightcall', 'Kavinsky', 'OutRun'],
    ['Weightless', 'Marconi Union', 'Weightless'], ['Clair de Lune', 'Claude Debussy', 'Suite bergamasque'], ['Moon River', 'Audrey Hepburn', 'Breakfast at Tiffany’s'],
  ];
  const COMMANDS = [
    { id: 'theme', word: 'theme', title: t('Farbwelt wählen'), text: t('Die Eingabeleiste wächst nach unten und zeigt alle Themes. Ein Klick färbt Luna sofort um.'), enter: false },
    { id: 'chat', word: 'chat', title: t('Luna Chat öffnen'), text: t('Sobald du chat getippt hast, öffnet sich der Chat. Auch hier ohne Enter.'), enter: false },
    { id: 'spotify', word: 'spotify', title: t('Spotify durchsuchen'), text: t('Tippe spotify und danach einen Suchbegriff. Treffer erscheinen direkt in Luna.'), enter: false, arg: true },
    { id: 'play', word: 'play', title: t('Song sofort abspielen'), text: t('play und ein Songname, dann Enter. Luna übergibt den besten Treffer an Spotify.'), enter: true, arg: true },
    { id: 'tab', word: 'tab', title: t('Tabs steuern'), text: t('tab open youtube.com, tab close, tab list, tab reload oder tab zoom 120. Mit Enter ausführen.'), enter: true, arg: true },
    { id: 'settings', word: t('einstellungen'), title: t('Einstellungen öffnen'), text: t('Luna fragt kurz nach, ob du die Einstellungen öffnen möchtest, statt im Web zu suchen.'), enter: false },
    { id: 'commands', word: 'commands', title: t('Alle Befehle zeigen'), text: t('Öffnet diese Übersicht. Jeder Befehl hat einen Schalter: grün für an, rot für aus.'), enter: true },
    { id: 'sites', word: 'youtube · google', title: t('Direkt zu einer Seite'), text: t('Tippe youtube oder google und eine kurze Tipp-Pause später bist du dort.'), enter: false },
  ];
  const cmdOff = new Set();
  const commandOn = (id) => !cmdOff.has(id);

  const state = { tabs: [], active: null, nextId: 1, playing: null, paused: false, chatOpen: false, gestMode: false };

  /* ---------- Toast & Dock ---------- */
  let toastTimer;
  function toast(msg, ms = 2200) {
    const n = $('#toast'); n.textContent = msg; n.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => n.classList.remove('show'), ms);
  }
  function bounceDock() {
    const d = $('.dock'); if (reduce) return;
    d.classList.remove('bounce'); void d.offsetWidth; d.classList.add('bounce');
  }
  function spotlight() { win.classList.add('on-air'); setTimeout(() => win.classList.remove('on-air'), 900); }

  /* ---------- Tabs ---------- */
  const FAV = {
    globe: '<svg class="fav" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
    search: '<svg class="fav" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
    cmd: '<svg class="fav" viewBox="0 0 24 24"><path d="M6 8l4 4-4 4M12 16h6"/></svg>',
    gear: '<svg class="fav" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/></svg>',
  };
  function tabTitle(tb) {
    if (tb.kind === 'start') return t('Neuer Tab');
    if (tb.kind === 'site') return tb.arg.replace(/^www\./, '');
    if (tb.kind === 'search') return tb.arg + ' · Luna Search';
    if (tb.kind === 'commands') return t('Befehle');
    if (tb.kind === 'settings') return t('Einstellungen');
    return 'Luna';
  }
  function tabFav(tb) { return tb.kind === 'search' ? FAV.search : tb.kind === 'commands' ? FAV.cmd : tb.kind === 'settings' ? FAV.gear : FAV.globe; }
  function renderTabs() {
    tabsEl.innerHTML = '';
    for (const tb of state.tabs) {
      const n = el(`<div class="tab${tb.id === state.active ? ' on' : ''}" role="tab" aria-selected="${tb.id === state.active}" tabindex="0">${tabFav(tb)}<span class="t">${esc(tabTitle(tb))}</span><button class="x" aria-label="${esc(t('Tab schließen'))}">×</button></div>`);
      n.onclick = (e) => { if (e.target.closest('.x')) closeTab(tb.id); else activate(tb.id); };
      n.onkeydown = (e) => { if (e.key === 'Enter') activate(tb.id); };
      tabsEl.append(n);
    }
  }
  function openTab(kind = 'start', arg = '', quiet) {
    const tb = { id: state.nextId++, kind, arg };
    state.tabs.push(tb); state.active = tb.id;
    renderTabs(); renderPage();
    if (!quiet && kind !== 'start') toast(t('Neuer Tab') + ' · ' + tabTitle(tb));
    return tb;
  }
  function activate(id) { state.active = id; renderTabs(); renderPage(); closeDrop(); }
  function closeTab(id) {
    if (state.tabs.length === 1) { navigate('start', ''); return; }
    const i = state.tabs.findIndex((x) => x.id === id);
    const node = tabsEl.children[i];
    const done = () => {
      state.tabs.splice(i, 1);
      if (state.active === id) state.active = state.tabs[Math.max(0, i - 1)].id;
      renderTabs(); renderPage();
    };
    if (node && !reduce) { node.classList.add('closing'); setTimeout(done, 200); } else done();
  }
  const current = () => state.tabs.find((x) => x.id === state.active);
  function navigate(kind, arg) {
    const tb = current(); tb.kind = kind; tb.arg = arg;
    renderTabs(); renderPage(true);
  }

  /* ---------- Seiten ---------- */
  function hue(str) { let h = 0; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
  function greeting() { const h = new Date().getHours(); return h < 5 ? t('Gute Nacht') : h < 11 ? t('Guten Morgen') : h < 18 ? t('Guten Tag') : t('Guten Abend'); }
  function clockText() { return new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  function dateText() { return new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }); }

  function renderPage(fade) {
    const tb = current(); if (!tb) return;
    page.classList.remove('fade'); if (fade && !reduce) { void page.offsetWidth; page.classList.add('fade'); }
    let html = '';
    if (tb.kind === 'start') {
      html = `<div class="start">
        <svg class="waves" viewBox="0 0 1600 400" preserveAspectRatio="none" aria-hidden="true"><path d="M0 120 C260 80 420 150 700 120 C980 90 1180 40 1600 90 L1600 400 L0 400Z"/><path class="w2" d="M0 220 C300 180 520 250 820 220 C1100 190 1300 150 1600 200 L1600 400 L0 400Z"/><path class="w3" d="M0 300 C280 275 560 330 880 305 C1160 280 1380 260 1600 290 L1600 400 L0 400Z"/></svg>
        <svg class="p-icon"><use href="#icon"/></svg>
        <div class="p-clock"><b id="clock">${clockText()}</b><i></i><svg class="p-wm"><use href="#wm"/></svg></div>
        <div class="p-greet"><b>${greeting()}</b><span>${dateText()}</span></div>
        <div class="p-search" id="pSearch"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>${t('Mit Luna Search suchen oder Adresse eingeben')}<kbd>${mod}L</kbd></div>
        <div class="p-chips"><span data-go="bookmarks">☆ ${t('Lesezeichen')}</span><span data-go="history">◷ ${t('Verlauf')}</span><span data-go="downloads">↓ Downloads</span><span data-go="appearance">☾ ${t('Erscheinungsbild')}</span><span data-go="settings">⚙ ${t('Einstellungen')}</span></div>
      </div>`;
    } else if (tb.kind === 'site') {
      const d = tb.arg.replace(/^www\./, ''), name = d.split('.')[0];
      const h = hue(d), yt = /youtube/.test(d), gg = /google/.test(d), gh = /github/.test(d);
      const col = yt ? '#ff0033' : gg ? '#4285f4' : gh ? '#24292f' : `hsl(${h} 55% 50%)`;
      html = `<div class="pg"><div class="site-h"><span class="favi" style="background:${col}">${esc(name[0].toUpperCase())}</span><div><b>${esc(name[0].toUpperCase() + name.slice(1))}</b><span>https://${esc(d)}</span></div></div>` +
        (yt ? `<div class="sk h"></div><div class="sk-grid">${'<div></div><p></p>'.repeat(6).replace(/<div><\/div><p><\/p>/g, '<div><div></div><p></p></div>')}</div>`
          : gg ? `<div style="max-width:520px;margin:6% auto 0;text-align:center"><div class="sk h" style="margin:0 auto 18px;width:40%"></div><div class="start-like" style="height:44px;border-radius:999px;border:1px solid var(--line);box-shadow:var(--shadow)"></div></div>`
          : `<div class="sk h"></div><div class="sk w1"></div><div class="sk w2"></div><div class="sk w3"></div><div class="sk w4"></div><div class="sk-grid"><div><div></div><p></p></div><div><div></div><p></p></div><div><div></div><p></p></div></div>`) +
        `</div>`;
    } else if (tb.kind === 'search') {
      const q = esc(tb.arg);
      html = `<div class="pg"><h4>${q}</h4><p class="sub">Luna Search · ${t('ungefähr')} ${(hue(tb.arg) * 1234 + 48000).toLocaleString(locale)} ${t('Ergebnisse')}</p>` +
        [[t('Wikipedia'), `${q} – ${t('Übersicht')}`, t('Alles Wichtige auf einen Blick, kompakt zusammengefasst.')], [t('Offizielle Seite'), q, t('Die offizielle Seite mit Neuigkeiten, Hintergründen und mehr.')], ['Luna Chat', `${t('Frag Sira zu')} „${q}“`, t('Lass dir die Treffer von Sira zusammenfassen, lokal auf deinem Mac.')], [t('Video'), `${q} ${t('erklärt in drei Minuten')}`, t('Kurz, verständlich und ohne Umwege.')]]
          .map(([s, b, p]) => `<div class="res"><small>${s}</small><b>${b}</b><p>${p}</p></div>`).join('') + `</div>`;
    } else if (tb.kind === 'commands') {
      html = `<div class="pg"><h4>${t('Befehle')}</h4><p class="sub">${t('Jeder Befehl hat einen Schalter. Klick eine Karte, um ihn an- oder auszuschalten.')}</p><div class="cmds">` +
        COMMANDS.map((c) => `<div class="cmdc${commandOn(c.id) ? '' : ' off'}" data-cmd-id="${c.id}"><code>${esc(c.word)}</code><b>${esc(c.title)}</b><p>${esc(c.text)}</p><span class="sw"><i></i>${commandOn(c.id) ? t('An') : t('Aus')}</span></div>`).join('') + `</div></div>`;
    } else if (tb.kind === 'settings') {
      const rows = [[t('Befehle'), t('Welche Wörter in der Adressleiste etwas auslösen'), true], [t('Mausgesten'), t('S für Screenshot, Kreis für Notizen'), true], ['Spotify', t('Suche, Warteschlange und Wiedergabe'), true], [t('KI-Zugriff für andere Apps'), t('Standardmäßig aus, braucht Touch ID'), false], [t('Sitzung wiederherstellen'), t('Tabs beim nächsten Start wieder öffnen'), true]];
      html = `<div class="pg"><h4>${t('Einstellungen')}</h4><p class="sub">${t('Alles freiwillig, alles jederzeit änderbar.')}</p>` +
        rows.map(([a, b, on]) => `<div class="res" style="display:flex;align-items:center;gap:14px"><div style="flex:1"><b style="color:var(--ink)">${a}</b><p>${b}</p></div><span class="cmdc ${on ? '' : 'off'}" style="padding:0;border:0;background:none"><span class="sw"><i></i></span></span></div>`).join('') + `</div>`;
    }
    page.innerHTML = html;
    $('#pSearch')?.addEventListener('click', () => addr.focus());
    $$('.p-chips span', page).forEach((s) => s.onclick = () => {
      const go = s.dataset.go;
      if (go === 'appearance') { setMode(mode === 'dark' ? 'light' : 'dark'); toast(mode === 'dark' ? t('Dunkel') : t('Hell')); }
      else if (go === 'settings') navigate('settings', '');
      else toast({ bookmarks: t('Noch keine Lesezeichen'), history: t('Dein Verlauf bleibt lokal auf deinem Mac'), downloads: t('Keine Downloads') }[go]);
    });
    $$('.cmdc[data-cmd-id]', page).forEach((c) => c.onclick = () => {
      const id = c.dataset.cmdId;
      if (commandOn(id)) cmdOff.add(id); else cmdOff.delete(id);
      c.classList.toggle('off', !commandOn(id)); c.querySelector('.sw').lastChild.textContent = commandOn(id) ? t('An') : t('Aus');
      toast(`${c.querySelector('code').textContent} · ${commandOn(id) ? t('An') : t('Aus')}`);
    });
  }
  setInterval(() => { const c = $('#clock'); if (c) c.textContent = clockText(); }, 10000);

  /* ---------- Adressleiste & Aufklapper ---------- */
  function openDrop(html) { drop.innerHTML = html; drop.hidden = false; }
  function closeDrop() { drop.hidden = true; drop.innerHTML = ''; }
  let idleTimer;

  function themeDrop() {
    openDrop(`<div class="dh"><span>${t('Deine Farbwelt')}</span><span class="segm"><button data-m="light">${t('Hell')}</button><button data-m="dark">${t('Dunkel')}</button><button data-m="auto">Auto</button></span></div><div class="tgrid">` +
      THEMES.map(([id, name, h, s]) => `<button class="tc" role="radio" data-theme-id="${id}" aria-checked="${id === themeId}" style="--c1:hsl(${h} ${s}% 70%);--c2:hsl(${h} ${s}% 86%)"><span class="pv" style="background:hsl(${h} ${s}% 80%)"><i style="left:8px"></i><i style="left:17px"></i><i style="left:26px"></i><u></u></span><b>${esc(name)}</b><span class="ck"><svg><use href="#i-check"/></svg></span></button>`).join('') + `</div>`);
    $$('.tc', drop).forEach((b) => b.onclick = () => { setTheme(b.dataset.themeId); toast(t('Farbwelt') + ': ' + themeName(themeId)); });
    $$('.segm button', drop).forEach((b) => b.onclick = () => setMode(b.dataset.m));
    apply(false);
  }
  function findTracks(q) {
    const s = q.toLowerCase();
    const hits = CATALOG.filter(([ti, ar]) => ti.toLowerCase().includes(s) || ar.toLowerCase().includes(s));
    const nice = q.replace(/\b\w/g, (c) => c.toUpperCase());
    if (!hits.length) hits.push([nice, t('Top-Treffer'), 'Single'], [`${nice} (Live)`, t('Top-Treffer'), 'Live'], [nice, t('Künstler'), '']);
    return hits.slice(0, 4);
  }
  function spotifyDrop(q) {
    const hits = findTracks(q);
    openDrop(`<div class="dh"><span>Spotify · „${esc(q)}“</span><small>${t('Top-Treffer')} · Songs · ${t('Künstler')}</small></div>` +
      hits.map(([ti, ar, al], i) => `<div class="sp" data-i="${i}"><span class="cv">${esc(ti[0])}</span><div><b>${esc(ti)}</b><span>${esc(ar)}${al ? ' · ' + esc(al) : ''}</span></div><em>${i === 0 ? t('Enter') : ''}</em></div>`).join(''));
    $$('.sp', drop).forEach((n) => n.onclick = () => { const [ti, ar] = hits[+n.dataset.i]; play(ti, ar); });
  }
  function confirmDrop(label, yes) {
    openDrop(`<div class="conf"><b>${esc(label)}</b><button class="y">${t('Öffnen')}</button><button class="n">${t('Lieber suchen')}</button></div>`);
    $('.y', drop).onclick = yes;
    $('.n', drop).onclick = () => { navigate('search', addr.value.trim()); addr.value = ''; closeDrop(); };
  }
  function suggDrop(val) {
    const v = val.toLowerCase();
    const items = COMMANDS.filter((c) => commandOn(c.id) && c.word.split(' · ').some((w) => w.startsWith(v) && w !== v)).slice(0, 4)
      .map((c) => `<div class="sugg" data-fill="${esc(c.word.split(' · ')[0])}${c.arg ? ' ' : ''}"><code>${esc(c.word.split(' · ')[0])}</code><span>${esc(c.title)}</span><kbd>${c.enter ? 'Enter' : t('sofort')}</kbd></div>`);
    if (/^play\s+\S/.test(v)) items.unshift(`<div class="sugg hl" data-enter><code>▶</code><span>${esc(t('Abspielen'))}: ${esc(val.slice(5))}</span><kbd>Enter</kbd></div>`);
    if (/^tab\s*/.test(v) && v.length <= 4) items.unshift(...['tab open youtube.com', 'tab close', 'tab list', 'tab reload', 'tab zoom 120'].map((s) => `<div class="sugg" data-fill="${s}"><code>${s}</code><span></span><kbd>Enter</kbd></div>`));
    items.push(`<div class="sugg" data-enter><code>⌕</code><span>${esc(t('Suchen'))}: ${esc(val)}</span><kbd>Enter</kbd></div>`);
    openDrop(items.join(''));
    $$('.sugg', drop).forEach((n) => n.onclick = () => { if (n.dataset.fill != null) { addr.value = n.dataset.fill; addr.focus(); onInput(); } else submit(); });
  }

  function onInput() {
    const val = addr.value, v = val.trim().toLowerCase();
    clearTimeout(idleTimer);
    if (!v) return closeDrop();
    if (v === 'theme' && commandOn('theme')) return themeDrop();
    if (v === 'chat' && commandOn('chat')) { addr.value = ''; closeDrop(); openChat(); return; }
    if ((v === 'einstellungen' || v === 'settings') && commandOn('settings')) return confirmDrop(t('Einstellungen öffnen?'), () => { navigate('settings', ''); addr.value = ''; closeDrop(); });
    const sp = v.match(/^spotify\s+(.{2,})$/);
    if (sp && commandOn('spotify')) return spotifyDrop(sp[1].trim());
    if ((v === 'youtube' || v === 'google') && commandOn('sites')) {
      suggDrop(val);
      idleTimer = setTimeout(() => { navigate('site', v + '.com'); addr.value = ''; closeDrop(); toast(`${v}.com ${t('wird geöffnet')}`); }, 900);
      return;
    }
    suggDrop(val);
  }
  function submit() {
    const val = addr.value.trim(), v = val.toLowerCase();
    clearTimeout(idleTimer);
    if (!v) return;
    let m;
    if ((m = v.match(/^play\s+(.+)$/)) && commandOn('play')) { const [ti, ar] = findTracks(m[1])[0]; play(ti, ar); }
    else if ((m = v.match(/^spotify\s+(.+)$/)) && commandOn('spotify')) { const [ti, ar] = findTracks(m[1])[0]; play(ti, ar); }
    else if (v === 'theme' && commandOn('theme')) { themeDrop(); return; }
    else if (v === 'commands' && commandOn('commands')) navigate('commands', '');
    else if ((v === 'einstellungen' || v === 'settings') && commandOn('settings')) navigate('settings', '');
    else if ((m = v.match(/^tab\s+(\w+)(?:\s+(.+))?$/)) && commandOn('tab')) {
      const [, sub, arg] = m;
      if (sub === 'open' && arg) openTab('site', arg.replace(/^https?:\/\//, ''));
      else if (sub === 'close' && arg) { const before = state.tabs.length; state.tabs = state.tabs.filter((x) => !(x.kind === 'site' && x.arg.includes(arg))) ; if (!state.tabs.length) state.tabs.push({ id: state.nextId++, kind: 'start', arg: '' }); if (!state.tabs.some((x) => x.id === state.active)) state.active = state.tabs[0].id; renderTabs(); renderPage(); toast(`${before - state.tabs.length} ${t('Tabs geschlossen')}`); }
      else if (sub === 'close') closeTab(state.active);
      else if (sub === 'list') toast(state.tabs.map(tabTitle).join(' · '), 3200);
      else if (sub === 'reload') reload();
      else if (sub === 'zoom') { page.style.zoom = ''; page.style.fontSize = (parseInt(arg, 10) || 100) / 100 + 'em'; toast(`Zoom ${arg || 100} %`); }
      else toast(t('Unbekannter Tab-Befehl'));
    }
    else if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) navigate('site', v.replace(/^https?:\/\//, '').split('/')[0]);
    else navigate('search', val);
    addr.value = ''; closeDrop(); addr.blur();
  }
  addr.addEventListener('input', onInput);
  $('#addrForm').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  addr.addEventListener('keydown', (e) => { if (e.key === 'Escape') { addr.value = ''; closeDrop(); addr.blur(); } });
  addr.addEventListener('focus', () => { if (addr.value) onInput(); });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.addr-wrap')) closeDrop(); });

  function reload() { const b = $('#navReload'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin'); renderPage(true); }
  $('#navReload').onclick = reload;
  $('#navBack').onclick = () => { const tb = current(); if (tb.kind !== 'start') navigate('start', ''); else toast(t('Schon ganz am Anfang')); };
  $('#tabPlus').onclick = () => { openTab('start', '', true); addr.focus(); };
  $('#chatBtn').onclick = () => state.chatOpen ? closeChat() : openChat();

  /* ---------- Spotify ---------- */
  function play(title, artist) {
    state.playing = { title, artist }; state.paused = false;
    $('#wpillText').textContent = `${title} · ${artist}`;
    const eq = $('#wpillEq'); eq.hidden = false; eq.classList.remove('paused');
    toast('▶ ' + t('Wiedergabe an Spotify übergeben')); bounceDock();
    addr.value = ''; closeDrop();
  }
  $('#wpill').onclick = () => {
    if (!state.playing) { addr.value = 'spotify '; addr.focus(); onInput(); return; }
    state.paused = !state.paused; $('#wpillEq').classList.toggle('paused', state.paused);
    toast(state.paused ? t('Pause') : '▶ ' + state.playing.title);
  };

  /* ---------- Luna Chat (Sira) ---------- */
  const chat = $('#chat'), log = $('#chatLog');
  function openChat() {
    chat.hidden = false; state.chatOpen = true; $('#chatBtn').classList.add('on');
    if (!log.children.length) sira(t('Hallo, ich bin Sira. Ich laufe lokal auf deinem Mac, ohne Konto und ohne Schlüssel. Frag mich etwas, oder sag „Farbwelt Ozean“, „dunkel“ oder „spiel One More Time“.'));
    setTimeout(() => $('#chatInput').focus(), 50);
  }
  function closeChat() { chat.hidden = true; state.chatOpen = false; $('#chatBtn').classList.remove('on'); }
  $('#chatClose').onclick = closeChat;
  function bubble(cls, html) { const n = el(`<div class="msg ${cls}">${html}</div>`); log.append(n); log.scrollTop = log.scrollHeight; return n; }
  function sira(text, after) {
    const n = bubble('a', `<b>Sira</b><span class="dots3"><i></i><i></i><i></i></span>`);
    const span = n.querySelector('span');
    setTimeout(() => {
      if (reduce) { span.className = ''; span.textContent = text; after?.(); return; }
      span.className = ''; let i = 0;
      const tick = () => { span.textContent = text.slice(0, ++i); log.scrollTop = log.scrollHeight; if (i < text.length) setTimeout(tick, 14); else after?.(); };
      tick();
    }, 500);
  }
  function answer(q) {
    const v = q.toLowerCase();
    const th = THEMES.find(([id, name]) => v.includes(id) || v.includes(name.toLowerCase()));
    if (th && /farb|theme|color|welt|mach|stell/.test(v)) { setTheme(th[0]); return `${t('Gern. Luna trägt jetzt')} ${th[1]}.`; }
    if (th) { setTheme(th[0]); return `${th[1]}? ${t('Gute Wahl, schon umgestellt.')}`; }
    if (/dunkel|dark|nacht/.test(v)) { setMode('dark'); return t('Dunkel gestellt. Schön für den Abend.'); }
    if (/hell|light|tag/.test(v)) { setMode('light'); return t('Hell gestellt.'); }
    if ((th === undefined) && /spiel|play|musik|music|song/.test(v)) { const q2 = q.replace(/.*?(spiel|play|mal|bitte)\s*/i, '').trim() || 'One More Time'; const [ti, ar] = findTracks(q2)[0]; play(ti, ar); return `${t('Läuft')}: ${ti} ${t('von')} ${ar}.`; }
    if (/zusammen|summar|worum|was steht/.test(v)) { const tb = current(); return tb.kind === 'start' ? t('Das ist Lunas Startseite: Uhr, Suche und deine Musik, alles ruhig an einem Ort. Nichts, was dich ablenkt.') : `${t('Du bist gerade auf')} ${tabTitle(tb)}. ${t('In Luna lese ich die Seite und fasse sie dir in drei Sätzen zusammen, lokal und ohne dass etwas deinen Mac verlässt.')}`; }
    if (/tab/.test(v)) { const d = (v.match(/[\w-]+\.[a-z]{2,}/) || ['wikipedia.org'])[0]; openTab('site', d); return `${t('Neuer Tab mit')} ${d} ${t('ist offen.')}`; }
    if (/wer bist|who are|was kannst|what can/.test(v)) return t('Ich bin Sira, Lunas KI auf Apples eigenem Modell. Ich kann Tabs öffnen, Seiten zusammenfassen, die Farbwelt wechseln oder Musik starten. Für größere Fragen gibt es im Luna Chat auch Modelle von Groq und OpenRouter.');
    if (/geste|gesture/.test(v)) return t('Halte die Maustaste auf der Seite gedrückt und zeichne ein S. Dann fliegt ein Sofortbild in die Ecke. Ein Kreis öffnet den Notizzettel.');
    if (/hallo|hi|hey|moin|servus/.test(v)) return t('Hallo! Schön, dass du da bist. Was darf ich für dich tun?');
    if (/danke|thank/.test(v)) return t('Sehr gern.');
    const pool = [t('Das würde ich in Luna direkt für dich erledigen. Hier auf der Webseite kann ich Tabs öffnen, die Farbwelt wechseln, Musik starten oder die Seite zusammenfassen.'), t('Gute Frage. In der echten Luna beantworte ich das mit Blick auf deine offenen Tabs, lokal auf deinem Mac.'), t('Probier mal „Farbwelt Lavendel“, „dunkel“ oder „spiel Nightcall“.')];
    return pool[hue(q) % pool.length];
  }
  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#chatInput'), q = inp.value.trim(); if (!q) return;
    bubble('u', esc(q)); inp.value = '';
    setTimeout(() => sira(answer(q)), 250);
  });

  /* ---------- Mausgesten ---------- */
  const canvas = $('#trail'), ctx = canvas.getContext('2d');
  const TPL = (() => {
    const circle = Array.from({ length: 24 }, (_, i) => { const a = -Math.PI / 2 + (i / 24) * Math.PI * 2; return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]; });
    return {
      S: [[1, .12], [.75, 0], [.3, 0], [.05, .2], [.15, .42], [.5, .5], [.85, .58], [1, .8], [.75, 1], [.3, 1], [0, .88]],
      O: circle, 'O2': [...circle].reverse(),
      C: [[1, .1], [.7, 0], [.2, .1], [0, .5], [.2, .9], [.7, 1], [1, .9]],
      N: [[0, 1], [0, 0], [1, 1], [1, 0]], Z: [[0, 0], [1, 0], [0, 1], [1, 1]], L: [[0, 0], [0, 1], [1, 1]], V: [[0, 0], [.5, 1], [1, 0]],
      M: [[0, 1], [0, 0], [.5, .6], [1, 0], [1, 1]], W: [[0, 0], [.25, 1], [.5, .3], [.75, 1], [1, 0]],
    };
  })();
  function resample(pts, n = 48) {
    const len = pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
    const I = len / (n - 1); let D = 0; const out = [pts[0]]; const src = pts.map((p) => [...p]);
    for (let i = 1; i < src.length; i++) {
      const [x0, y0] = src[i - 1], [x1, y1] = src[i], d = Math.hypot(x1 - x0, y1 - y0);
      if (D + d >= I && d > 0) { const q = [x0 + ((I - D) / d) * (x1 - x0), y0 + ((I - D) / d) * (y1 - y0)]; out.push(q); src.splice(i, 0, q); D = 0; } else D += d;
    }
    while (out.length < n) out.push(pts[pts.length - 1]);
    return out.slice(0, n);
  }
  function normalize(pts) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = Math.max(maxX - minX, 1e-6), h = Math.max(maxY - minY, 1e-6);
    return pts.map(([x, y]) => [(x - minX) / w, (y - minY) / h]);
  }
  function isCircle(raw) {
    const r = resample(raw, 32);
    const cx = r.reduce((a, p) => a + p[0], 0) / r.length, cy = r.reduce((a, p) => a + p[1], 0) / r.length;
    const rad = r.map(([x, y]) => Math.hypot(x - cx, y - cy)), mean = rad.reduce((a, b) => a + b) / rad.length;
    const spread = Math.sqrt(rad.reduce((a, d) => a + (d - mean) ** 2, 0) / rad.length) / mean;
    let turn = 0;
    for (let i = 2; i < r.length; i++) {
      const a1 = Math.atan2(r[i - 1][1] - r[i - 2][1], r[i - 1][0] - r[i - 2][0]), a2 = Math.atan2(r[i][1] - r[i - 1][1], r[i][0] - r[i - 1][0]);
      let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += d;
    }
    const closure = Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) / (mean * 2);
    return spread < 0.3 && Math.abs(turn) > Math.PI * 1.5 && closure < 0.6;
  }
  function recognize(raw) {
    if (isCircle(raw)) return 'O';
    const pts = normalize(resample(raw));
    let best = null, bestD = Infinity;
    for (const [name, tpl] of Object.entries(TPL)) {
      const T = normalize(resample(tpl));
      const d = pts.reduce((a, p, i) => a + Math.hypot(p[0] - T[i][0], p[1] - T[i][1]), 0) / pts.length;
      if (d < bestD) { bestD = d; best = name; }
    }
    return bestD < 0.26 ? best.replace('O2', 'O') : null;
  }
  let drawing = false, pts = [], raf, fadeT;
  function sizeCanvas() { const r = page.getBoundingClientRect(), dpr = devicePixelRatio || 1; canvas.width = r.width * dpr; canvas.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  new ResizeObserver(sizeCanvas).observe(page);
  function drawTrail(alpha = 1) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (pts.length < 2) return;
    ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = trailColor; ctx.lineWidth = 4; ctx.shadowColor = trailColor; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  function fadeTrail() { let a = 1; clearInterval(fadeT); fadeT = setInterval(() => { a -= 0.08; if (a <= 0) { clearInterval(fadeT); pts = []; ctx.clearRect(0, 0, canvas.width, canvas.height); } else drawTrail(a); }, 24); }
  const pos = (e) => { const r = page.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  page.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.pointerType === 'touch' && !state.gestMode) return;
    if (e.target.closest('.note,.cmdc,.p-chips,.res,.sp')) { /* Klicks auf Inhalte bleiben Klicks, Gesten funktionieren trotzdem */ }
    drawing = true; pts = [pos(e)]; clearInterval(fadeT); sizeCanvas();
  });
  addEventListener('pointermove', (e) => { if (!drawing) return; pts.push(pos(e)); cancelAnimationFrame(raf); raf = requestAnimationFrame(() => drawTrail()); });
  addEventListener('pointerup', () => {
    if (!drawing) return; drawing = false;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    if (pts.length < 8 || Math.max(w, h) < 40) { pts = []; ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    const g = recognize(pts); fadeTrail(); gesture(g);
  });
  addEventListener('pointercancel', () => { drawing = false; pts = []; ctx.clearRect(0, 0, canvas.width, canvas.height); });
  let polCount = 0;
  function gesture(g) {
    if (g === 'S') {
      const f = $('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
      try { const a = $('#shutter'); a.currentTime = 0; a.volume = 0.5; a.play().catch(() => {}); } catch {}
      const p = el(`<div class="pol" style="--rot:${(Math.random() * 10 - 5).toFixed(1)}deg"><div class="img"></div><em>${esc(tabTitle(current()))}</em></div>`);
      const box = $('#polaroids'); box.append(p); if (++polCount > 3) box.firstElementChild.remove();
      toast(t('Screenshot gespeichert')); bounceDock();
    } else if (g === 'O') {
      const n = el(`<div class="note"><small>${t('Notiz')} · ${esc(tabTitle(current()))}</small><textarea placeholder="${esc(t('Deine Gedanken zu dieser Seite …'))}"></textarea><button aria-label="${esc(t('Notiz schließen'))}">×</button></div>`);
      n.querySelector('button').onclick = () => n.remove();
      $('#notes').append(n); n.querySelector('textarea').focus(); toast(t('Notizzettel geöffnet'));
    } else if (g === 'N') { openTab('start', '', true); toast(t('Neuer Tab')); }
    else if (g === 'C') { closeTab(state.active); toast(t('Tab geschlossen')); }
    else if (g) toast(`${t('Geste')} „${g}“ ${t('erkannt. Was sie auslöst, legst du in Luna selbst fest.')}`, 3000);
    else toast(t('Nicht erkannt. Probier ein S oder einen Kreis.'));
  }
  $('#gestBtn').onclick = () => { state.gestMode = !state.gestMode; page.classList.toggle('gest', state.gestMode); $('#gestBtn').classList.toggle('on', state.gestMode); toast(state.gestMode ? t('Gesten-Modus an: jetzt mit dem Finger zeichnen') : t('Gesten-Modus aus')); };

  /* ---------- Chips und „Ausprobieren“-Links ---------- */
  function runCmd(cmd, enter) {
    closeChat();
    const y = $('#stage').getBoundingClientRect().top + scrollY - 90;
    if (Math.abs(scrollY - y) > 60) scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    spotlight();
    if (cmd === 'gesture') {
      // Luna zeichnet das S einmal vor
      setTimeout(() => {
        const r = page.getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2, sc = Math.min(r.width, r.height) * 0.18;
        const path = TPL.S, tot = 40; let i = 0; pts = []; sizeCanvas();
        const step = () => {
          const f = (i / tot) * (path.length - 1), k = Math.floor(f), fr = f - k, a = path[k], b = path[Math.min(k + 1, path.length - 1)];
          pts.push([cx + (a[0] + (b[0] - a[0]) * fr - 0.5) * sc * 2, cy + (a[1] + (b[1] - a[1]) * fr - 0.5) * sc * 2]); drawTrail();
          if (++i <= tot) setTimeout(step, 18); else { fadeTrail(); gesture('S'); setTimeout(() => toast(t('Jetzt du: Maustaste halten und ein S zeichnen'), 3000), 900); }
        };
        step();
      }, 500);
      return;
    }
    addr.value = ''; addr.focus();
    let i = 0;
    const type = () => {
      addr.value = cmd.slice(0, ++i); onInput();
      if (i < cmd.length) setTimeout(type, reduce ? 0 : 38);
      else if (enter) setTimeout(submit, 350);
    };
    setTimeout(type, 300);
  }
  $$('#tryRow button').forEach((b) => b.onclick = () => runCmd(b.dataset.cmd, b.hasAttribute('data-enter')));
  $$('[data-try]').forEach((b) => b.onclick = () => runCmd(b.dataset.try, b.hasAttribute('data-enter')));

  openTab('start', '', true);

  /* ================================================================ Trailer */
  const vid = $('#vid'), video = $('#video');
  $('#vplay').onclick = () => { vid.controls = true; vid.play(); };
  vid.addEventListener('play', () => video.classList.add('playing'));
  vid.addEventListener('pause', () => video.classList.remove('playing'));
  $$('.vlang button').forEach((b) => b.onclick = () => {
    $$('.vlang button').forEach((x) => x.classList.toggle('on', x === b));
    const was = !vid.paused; vid.src = b.dataset.src; if (was) vid.play();
  });

  /* ================================================================ Download */
  const command = `( installer=$(mktemp) && trap 'rm -f "$installer"' EXIT && curl --fail --location --proto '=https' --proto-redir '=https' https://raw.githubusercontent.com/fcore247/luna-browser/main/docs/install.sh -o "$installer" && /bin/bash "$installer" )`;
  $('#installCommand').textContent = command;
  $('#copy').onclick = async () => {
    const status = $('#copyStatus');
    try { await navigator.clipboard.writeText(command); status.textContent = t('Kopiert. Jetzt im Terminal einfügen und Enter drücken.'); }
    catch { const sel = getSelection(), range = document.createRange(); range.selectNodeContents($('#installCommand')); sel.removeAllRanges(); sel.addRange(range); status.textContent = t('Bitte den markierten Befehl mit ⌘ C kopieren.'); }
    setTimeout(() => { status.textContent = ''; }, 5000);
  };
  const segMac = $('#segMac'), segWin = $('#segWin');
  function pickOS(w) {
    segMac.setAttribute('aria-selected', !w); segWin.setAttribute('aria-selected', w);
    $('#panelMac').hidden = w; $('#panelWin').hidden = !w;
    $('#heroDownload').firstChild.textContent = w ? t('Für Windows laden') + ' ' : t('Luna herunterladen') + ' ';
  }
  segMac.onclick = () => pickOS(false); segWin.onclick = () => pickOS(true);
  pickOS(isWindows);
  // Neueste Version von GitHub holen; fällt sonst auf die eingetragene zurück.
  const mb = (n) => (n / 1048576).toFixed(0) + ' MB';
  fetch('https://api.github.com/repos/fcore247/luna-browser/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((rel) => {
      const tag = rel.tag_name || '';
      const winZip = (rel.assets || []).find((a) => /windows-amd64\.zip$/.test(a.name));
      const macDmg = (rel.assets || []).find((a) => /\.dmg$/.test(a.name));
      if (tag) { $('#versionText').textContent = `${tag} · macOS & Windows`; $('#versionPill').href = rel.html_url || $('#versionPill').href; }
      if (winZip) { $('#winDownload').href = winZip.browser_download_url; $('#winSize').textContent = mb(winZip.size); }
      if (macDmg) $('#macSize').textContent = mb(macDmg.size);
    })
    .catch(() => { $('#versionText').textContent = 'v1.3.0 · macOS & Windows'; });

  /* ================================================================ Sprache */
  $('#langToggle').textContent = language === 'de' ? 'EN' : 'DE';
  $('#langToggle').onclick = () => { store.set('luna-site-lang', language === 'de' ? 'en' : 'de'); location.reload(); };
})();
