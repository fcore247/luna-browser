import { getLanguage } from './i18n.js';
import { t as l10n, msg as l10nMsg } from './i18n.js';
import { clockHTML } from './flipclock.js';
// Suchansicht: Ergebnisse der eigenen Suche (Brave) als eingebaute Browser-Seite,
// im selben Design wie Startseite und Seitenleiste (kein fremdes Web-Layout, keine Kopfzeile).
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const letter = (s) => esc((s || '?').trim().charAt(0).toUpperCase() || '?');
const secs = (ms) => (ms / 1000).toFixed(2).replace('.', ',');

const I = {
  tab: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M8 6V4h8v2"/></svg>',
  star: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1-4.5-4.3 6.1-.8z"/></svg>',
  starOn:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="#a24d84" stroke="#a24d84" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1-4.5-4.3 6.1-.8z"/></svg>',
  warn: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/></svg>',
  key: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/></svg>',
};

function fav(url, host) {
  return url
    ? `<img class="sr-fav" src="${esc(url)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.outerHTML='<span class=&quot;sr-fav fb&quot;>${letter(host)}</span>'">`
    : `<span class="sr-fav fb">${letter(host)}</span>`;
}
const thumb = (u, cls) =>
  u
    ? `<img class="${cls}" src="${esc(u)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display='none'">`
    : '';

function result(r, i, sel, bm) {
  const on = bm(r.url);
  return l10nMsg`<article class="sr ${i === sel ? 'sel' : ''}" data-i="${i}" style="animation-delay:${Math.min(i, 8) * 28}ms">
    ${fav(r.favicon, r.host)}
    <div class="sr-body">
      <div class="sr-site"><b>${esc(r.host)}</b><span>${esc(r.path)}</span>${r.age ? `<em>${esc(r.age)}</em>` : ''}</div>
      <a class="sr-t" href="${esc(r.url)}" data-act="sr-open" data-url="${esc(r.url)}">${esc(r.title)}</a>
      <p class="sr-d">${r.desc || ''}</p>
      ${(r.extra || []).map((x) => `<div class="sr-x">${x}</div>`).join('')}
    </div>
    ${thumb(r.thumb, 'sr-th')}
    <div class="sr-act"><button data-act="sr-tab" data-url="${esc(r.url)}" title="In neuem Tab öffnen" aria-label="In neuem Tab öffnen">${I.tab}</button><button data-act="sr-bm" data-url="${esc(r.url)}" data-title="${esc(r.title)}" title="Lesezeichen" aria-label="Lesezeichen">${on ? I.starOn : I.star}</button></div>
  </article>`;
}

function strips(d, filter) {
  let h = '';
  const news = d.news || [],
    vids = d.videos || [];
  if (news.length && (filter === 'all' || filter === 'news')) {
    h += l10nMsg`<h3 class="sv-h">${getLanguage() === 'en' ? 'News' : 'Nachrichten'}</h3><div class="${filter === 'news' ? 'sv-grid3' : 'strip'}">${news.map((n) => `<a class="nc" href="${esc(n.url)}" data-act="sr-open" data-url="${esc(n.url)}"><div class="im">${thumb(n.thumb, '')}</div><div class="cb"><div class="ct">${esc(n.title)}</div><div class="cm">${fav(n.favicon, n.host)}<span>${esc(n.host)}${n.age ? ' · ' + esc(n.age) : ''}</span></div></div></a>`).join('')}</div>`;
  }
  if (vids.length && (filter === 'all' || filter === 'video')) {
    h += `<h3 class="sv-h">Videos</h3><div class="${filter === 'video' ? 'sv-grid3' : 'strip'}">${vids.map((v) => `<a class="nc" href="${esc(v.url)}" data-act="sr-open" data-url="${esc(v.url)}"><div class="im">${thumb(v.thumb, '')}${v.duration ? `<span class="du">${esc(v.duration)}</span>` : ''}</div><div class="cb"><div class="ct">${esc(v.title)}</div><div class="cm"><span>${esc(v.host)}${v.age ? ' · ' + esc(v.age) : ''}</span></div></div></a>`).join('')}</div>`;
  }
  return h;
}

function pager(t, d) {
  const cur = t.page;
  let last = cur;
  if (d.more && cur < 9) last = cur + 1;
  const start = Math.max(0, last - 6);
  const out = [];
  if (cur > 0)
    out.push(
      l10nMsg`<button data-act="sv-page" data-p="${cur - 1}" aria-label="${l10n('Zurück')}">←</button>`,
    );
  for (let i = start; i <= last; i++)
    out.push(
      i === cur
        ? `<span class="cur">${i + 1}</span>`
        : `<button data-act="sv-page" data-p="${i}">${i + 1}</button>`,
    );
  if (d.more && cur < 9)
    out.push(
      l10nMsg`<button data-act="sv-page" data-p="${cur + 1}" aria-label="${l10n('Weiter')}">→</button>`,
    );
  return out.length > 1
    ? l10nMsg`<nav class="sv-pg" aria-label="Seiten">${out.join('')}</nav>`
    : '';
}

// ---------- Bildersuche ----------
const IM = {
  x: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  l: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  r: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  go: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
};

// Ladeansicht der Bildersuche: Karten fliegen durch einen Tunnel auf dich zu (nach „Perspective Tunnel Hero“
// von 21st.dev, hier als reines CSS). Als Karten dienen Vorschaubilder der Websuche, sonst Farbflächen.
function tunnelHTML(t) {
  const d = t.data || {};
  const pool = [
    ...(d.results || []).map((r) => ({ src: r.thumb, label: r.host })),
    ...(d.news || []).map((n) => ({ src: n.thumb, label: n.host })),
    ...(d.videos || []).map((v) => ({ src: v.thumb, label: v.host })),
  ].filter((x) => x.src);
  const cards = Array.from({ length: 9 }, (_, i) => {
    const item = pool[i];
    const a = i * 137.5 * (Math.PI / 180); // Goldener Winkel: gleichmäßig um die Mitte verteilt
    const bx = (Math.cos(a) * (0.28 + (i % 3) * 0.08) * 100).toFixed(2);
    const by = (Math.sin(a) * (0.26 + (i % 2) * 0.09) * 100).toFixed(2);
    const rot = (i % 2 === 0 ? 1 : -1) * (3 + (i % 5) * 2);
    return `<span class="tn-card" style="--bx:${bx}cqw;--by:${by}cqh;--rot:${rot}deg;--i:${i};--k:${i % 5}">${
      item
        ? `<img src="${esc(item.src)}" alt="" referrerpolicy="no-referrer" draggable="false" onerror="this.remove()">`
        : ''
    }<em>${esc(item?.label || 'Luna')}</em></span>`;
  }).join('');
  return `<section class="tn" role="status" aria-live="polite" aria-label="${l10n('Luna sucht')}">
    <i class="tn-ring a"></i><i class="tn-ring b"></i>
    <div class="tn-copy"><p class="tn-eyebrow">${l10n('Bildersuche')}</p><h1 class="tn-title">${l10n('Luna sucht')}<span class="tn-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></h1><p class="tn-q">„${esc(t.q)}“</p></div>
    <div class="tn-plane" aria-hidden="true">${cards}</div>
  </section>`;
}

function imagesHTML(t) {
  const im = t.images;
  if (!im || im.loading) return tunnelHTML(t);
  if (im.err)
    return `<div class="sv-msg">${I.warn}<h2>${l10n('Bilder nicht verfügbar')}</h2><p>${esc(im.err)}</p><div class="row">${l10n('<button class="btn pri" data-act="sv-img-retry">Erneut versuchen</button>')}</div></div>`;
  const list = im.data?.images || [];
  if (im.data?.provider === 'Tavily')
    return `<div class="sv-msg">${I.key}<h2>${l10n('Bildersuche braucht Brave')}</h2><p>${getLanguage() === 'en' ? 'Image search works with a Brave Search key. Add one in Settings.' : 'Die Bildersuche läuft über einen Brave-Search-Schlüssel. Hinterlege ihn in den Einstellungen.'}</p><div class="row">${l10n('<button class="btn pri" data-act="settings">Einstellungen öffnen</button>')}</div></div>`;
  if (!list.length)
    return l10nMsg`<div class="sv-msg"><h2>Keine Bilder</h2><p>Zu „${esc(t.q)}“ hat Luna Search keine Bilder gefunden.</p></div>`;
  return `<div class="im-grid">${list
    .map((m, i) => {
      const ratio = m.w > 0 && m.h > 0 ? Math.max(0.5, Math.min(2, m.w / m.h)) : 1.2;
      return `<button class="im lg-card" data-act="im-open" data-i="${i}" style="animation-delay:${Math.min(i, 12) * 24}ms" aria-label="${esc(m.title || m.host)}"><img src="${esc(m.thumb)}" alt="" referrerpolicy="no-referrer" loading="lazy" style="aspect-ratio:${ratio.toFixed(3)}" onerror="this.closest('.im')?.remove()"><span class="im-cap"><b>${esc(m.host)}</b>${m.w && m.h ? `<em>${m.w}×${m.h}</em>` : ''}</span></button>`;
    })
    .join('')}</div>`;
}

function lightbox(t) {
  const list = t.images?.data?.images;
  if (t.filter !== 'images' || t.lb == null || !list?.[t.lb]) return '';
  const m = list[t.lb];
  const n = list.length;
  return `<div class="im-lb" data-act="im-close" role="dialog" aria-modal="true" aria-label="${esc(m.title || l10n('Bild'))}">
    <button class="im-x" data-act="im-close" aria-label="${l10n('Schließen')}">${IM.x}</button>
    ${t.lb > 0 ? `<button class="im-nav prev" data-act="im-prev" aria-label="${l10n('Zurück')}">${IM.l}</button>` : ''}
    ${t.lb < n - 1 ? `<button class="im-nav next" data-act="im-next" aria-label="${l10n('Weiter')}">${IM.r}</button>` : ''}
    <figure class="im-fig"><img src="${esc(m.full)}" alt="${esc(m.title)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${esc(m.thumb)}'">
      <figcaption><div class="im-t"><b>${esc(m.title || m.host)}</b><span>${esc(m.host)}${m.w && m.h ? ' · ' + m.w + '×' + m.h : ''} · ${t.lb + 1}/${n}</span></div>
      <div class="im-btns">${m.url ? l10nMsg`<button class="btn pri" data-act="sr-open" data-url="${esc(m.url)}">${l10n('Seite besuchen')} ${IM.go}</button><button class="btn" data-act="sr-tab" data-url="${esc(m.url)}">In neuem Tab</button>` : ''}</div></figcaption></figure></div>`;
}

function skeleton() {
  return Array.from(
    { length: 6 },
    () =>
      '<div class="sk"><i class="a"></i><div><i class="b"></i><i class="c"></i><i class="d"></i></div></div>',
  ).join('');
}

function problem(t) {
  const e = t.sErr;
  const key = e === 'NOKEY' || /Schlüssel/.test(e);
  return `<div class="sv-msg">${key ? I.key : I.warn}<h2>${e === 'NOKEY' ? l10n('Luna Search einrichten') : key ? l10n('Schlüssel wird abgelehnt') : l10n('Suche nicht möglich')}</h2>
    <p>${e === 'NOKEY' ? (getLanguage() === 'en' ? 'Connect your search provider in Settings to use Luna Search.' : 'Verbinde deinen Suchanbieter in den Einstellungen, um Luna Search zu nutzen.') : esc(e)}</p>
    <div class="row">${key ? l10n('<button class="btn pri" data-act="settings">Einstellungen öffnen</button><button class="btn" data-act="open-brave">API-Key holen</button>') : l10n('<button class="btn pri" data-act="sv-retry">Erneut versuchen</button>')}</div></div>`;
}

const FILTERS = ['all', 'images', 'news', 'video'];

// Filterleiste (Alle · Bilder · Nachrichten · Videos): sitzt in der Adressleiste, nicht auf der Seite.
export function filterPillsHTML(t) {
  const d = t.data;
  if (!d || t.sErr || t.sLoading || d.local || t.provider === 'spotify') return '';
  const fi = Math.max(0, FILTERS.indexOf(t.filter));
  const ff = t.filterFrom == null ? fi : Math.max(0, t.filterFrom);
  const cnt = (n) => (n ? ' · ' + n : '');
  return l10nMsg`<div class="sv-pills sv-filter" role="tablist" style="--i:${fi};--from:${ff};--n:${FILTERS.length}"><i class="sv-drop" aria-hidden="true"></i>
    <button class="${t.filter === 'all' ? 'on' : ''}" data-act="sv-filter" data-k="all">Alle</button>
    <button class="${t.filter === 'images' ? 'on' : ''}" data-act="sv-filter" data-k="images">Bilder${cnt(t.images?.data?.images?.length)}</button>
    <button class="${t.filter === 'news' ? 'on' : ''}" data-act="sv-filter" data-k="news">Nachrichten${cnt(d.news?.length)}</button>
    <button class="${t.filter === 'video' ? 'on' : ''}" data-act="sv-filter" data-k="video">Videos${cnt(d.videos?.length)}</button></div>`;
}

// t: Tab mit q, page, data, sErr, sLoading, sel, filter; bm(url) sagt, ob ein Lesezeichen existiert.
export function searchHTML(t, bm) {
  const d = t.data;
  const head = `<div class="sv-top"><div class="sv-bar"><div class="sv-brand"><span class="sv-moon" aria-hidden="true"></span><span class="luna-search-brand">Luna Search</span></div><span class="sv-meta">${t.sLoading ? l10n('Suche läuft …') : d && !d.local ? l10nMsg`Seite ${t.page + 1} · ${secs(d.millis)} s · ${esc(d.provider || 'Brave')}` : ''}</span>${t.sLoading ? '<i class="sv-prog" aria-hidden="true"></i>' : ''}</div></div>`;
  if (d?.local) return `<div class="sv">${head}${clockHTML()}</div>`;
  if (t.sErr) return `<div class="sv">${head}${problem(t)}</div>`;
  if (t.sLoading || !d)
    return `<div class="sv">${head}<div class="sv-grid"><div class="sv-main">${skeleton()}</div></div></div>`;
  const alt = d.altered
    ? l10nMsg`<div class="sv-alt">Ergebnisse für <b>${esc(d.altered)}</b>. <button class="link" data-act="sv-alt" data-q="${esc(d.altered)}">Stattdessen „${esc(t.q)}“ suchen</button></div>`
    : '';
  let main = '';
  if (t.filter === 'all') {
    const res = d.results || [];
    const first = res
      .slice(0, 3)
      .map((r, i) => result(r, i, t.sel, bm))
      .join('');
    const rest = res
      .slice(3)
      .map((r, i) => result(r, i + 3, t.sel, bm))
      .join('');
    const faq = (d.faq || []).length
      ? l10nMsg`<h3 class="sv-h">Häufige Fragen</h3><div class="sv-faq">${d.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>`
      : '';
    main = res.length
      ? first + strips(d, 'all') + faq + rest
      : l10nMsg`<div class="sv-msg"><h2>Keine Treffer</h2><p>Zu „${esc(t.q)}“ hat Luna Search nichts gefunden.</p></div>`;
  } else if (t.filter === 'images') {
    main = imagesHTML(t);
  } else {
    main =
      strips(d, t.filter) ||
      l10nMsg`<div class="sv-msg"><h2>Nichts gefunden</h2><p>Für diese Suche gibt es hier keine ${t.filter === 'news' ? (getLanguage() === 'en' ? 'news' : 'Nachrichten') : 'Videos'}.</p></div>`;
  }
  const info =
    d.info && t.filter === 'all' && t.page === 0
      ? `<aside class="sv-side"><div class="info">${thumb(d.info.thumb, 'in-im')}<div class="ib"><h2>${esc(d.info.title)}</h2>${d.info.desc ? `<p>${d.info.desc}</p>` : ''}${(d.info.attrs || []).length ? `<dl>${d.info.attrs.map((a) => `<dt>${esc(a[0])}</dt><dd>${esc(a[1])}</dd>`).join('')}</dl>` : ''}${d.info.url ? `<a class="go" href="${esc(d.info.url)}" data-act="sr-open" data-url="${esc(d.info.url)}">${esc(d.info.host)} ↗</a>` : ''}</div></div></aside>`
      : '';
  return `<div class="sv">${head}${alt}<div class="sv-grid ${info ? 'two' : ''}"><div class="sv-main">${main}${t.filter === 'all' ? pager(t, d) : ''}</div>${info}</div>${lightbox(t)}</div>`;
}
