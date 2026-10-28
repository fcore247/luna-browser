import { t as l10n, msg as l10nMsg } from './i18n.js';
import { esc } from './ui.js';

const number = (value) => {
  const match = String(value).match(/[-+]?\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(',', '.')) : null;
};
const safeURL = (value) => {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};
export const blockKinds = [
  'metric',
  'text',
  'list',
  'heading',
  'divider',
  'notice',
  'badge',
  'progress',
  'gauge',
  'bars',
  'line',
  'table',
  'timeline',
  'image',
  'link',
  'accordion',
  'hero',
  'cards',
  'grid',
];

// A number with an optional unit and a trailing note: "0.0 l/m2 in 1 Std." -> 0.0 | l/m2 | in 1 Std.
const UNITS =
  '°C|°F|°|%|‰|km\\/h|m\\/s|mph|hPa|mbar|mm|cm|m²|l\\/m²|l\\/m2|kWh|kW|W|€|\\$|EUR|Uhr|Std\\.?|Min\\.?';
const metricPattern = new RegExp(
  `^\\s*([-+−]?\\d+(?:[.,]\\d+)?)(?![:/\\-.,\\d])(?:\\s*(${UNITS})(?![\\p{L}]))?\\s*(.*?)\\s*$`,
  'iu',
);
function metricHTML(raw) {
  const value = String(raw).trim();
  const found = value.length <= 48 && value.match(metricPattern);
  if (found) {
    const degree = found[2]?.startsWith('°') ? ' pp-unit-deg' : '';
    // The space stays in the text (copy, screen readers) but the degree sign sits tight against the number.
    const unit = found[2]
      ? degree
        ? `<span class="pp-unit${degree}"><span class="pp-gap"> </span>${esc(found[2])}</span>`
        : ` <span class="pp-unit">${esc(found[2])}</span>`
      : '';
    const note = found[3] ? `<small class="pp-metric-note">${esc(found[3])}</small>` : '';
    return `<p class="pp-metric-value"><span class="pp-num">${esc(found[1])}</span>${unit}</p>${note}`;
  }
  const size = value.length <= 12 ? 'l' : value.length <= 28 ? 'm' : 's';
  return `<p class="pp-metric-text pp-size-${size}">${esc(value)}</p>`;
}
// Paragraphs, line breaks and bullet lists instead of one long line.
const bulletPattern = /^[•·▪‣*–—-]\s+(.*)$/;
function proseHTML(texts) {
  return texts
    .map((raw) =>
      String(raw)
        .split(/\n{2,}/)
        .map((chunk) => {
          const parts = [];
          let lines = null,
            list = null;
          for (const line of chunk.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const bullet = trimmed.match(bulletPattern);
            if (bullet) {
              lines = null;
              if (!list) parts.push((list = { bullets: [] }));
              list.bullets.push(bullet[1]);
            } else {
              list = null;
              if (!lines) parts.push((lines = { lines: [] }));
              lines.lines.push(trimmed);
            }
          }
          return parts
            .map((part) =>
              part.bullets
                ? `<ul class="pp-bullets">${part.bullets.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
                : `<p>${part.lines.map(esc).join('<br>')}</p>`,
            )
            .join('');
        })
        .join(''),
    )
    .join('');
}
// "11:34 Uhr Dienstag wird's mild" -> a time chip and the text.
const timePattern =
  /^(\d{1,2}:\d{2}(?:\s*Uhr)?|\d{1,2}\.\d{2}\s*Uhr|\d{1,2}\.\d{1,2}\.(?:\d{2,4})?(?:,?\s+\d{1,2}:\d{2}(?:\s*Uhr)?)?)\s+(\S.*)$/;
function itemHTML(value) {
  const found = String(value).match(timePattern);
  return found
    ? `<time class="pp-chip">${esc(found[1])}</time> <span class="pp-item-text">${esc(found[2])}</span>`
    : esc(value);
}

export function renderPersonalizedBlock(field, source, loading, blockIndex) {
  const values = (source?.values || []).slice(0, field.limit || 20);
  const missing = loading
    ? l10nMsg`<div class="pp-skeleton pp-skeleton-${esc(field.kind)}" role="status" aria-busy="true" aria-label="Wird geladen …"><i></i><i></i><i></i></div>`
    : l10nMsg`<p class="pp-missing">Auf der Originalseite nicht gefunden</p>`;
  const proseKinds = ['text', 'notice', 'accordion'];
  const rich =
    !field.format && Array.isArray(source?.rich) && source.rich.length
      ? source.rich.slice(0, field.limit || 20)
      : null;
  const text = !values.length
    ? missing
    : ['metric', 'hero'].includes(field.kind)
      ? metricHTML(values.join(' · '))
      : proseKinds.includes(field.kind)
        ? `<div class="pp-prose">${proseHTML(rich || values)}</div>`
        : `<p>${esc(values.join(' · '))}</p>`;
  // Rows of a block with `open` can be clicked in the Luna view. The reader's row signatures let Luna
  // check that the row on the source page is still the one the user saw.
  const openAttrs = (position, name) =>
    field.open && blockIndex !== undefined && source?.sigs
      ? ` class="pp-openable" data-pp-open="${blockIndex}:${position}" tabindex="0" role="button" aria-label="${esc(l10n('Öffnen: ') + name)}"`
      : '';
  const valuePosition = (k) => source?.valueIdx?.[k] ?? k;
  const label = `<div class="pp-card-label"><span aria-hidden="true">${esc(field.icon || '✧')}</span><h2>${esc(field.title)}</h2></div>`;
  const width = field.width || (field.kind === 'hero' ? 'full' : '');
  const span = ['wide', 'full'].includes(width) ? ` pp-width-${width}` : '';
  let resolvedTone = field.tone;
  const measured = number(values[0]);
  for (const threshold of field.thresholds || []) {
    if (measured === null) break;
    const yes =
      threshold.op === 'gt'
        ? measured > threshold.value
        : threshold.op === 'gte'
          ? measured >= threshold.value
          : threshold.op === 'lt'
            ? measured < threshold.value
            : measured <= threshold.value;
    if (yes) resolvedTone = threshold.tone;
  }
  const tone = ['positive', 'warning', 'critical'].includes(resolvedTone)
    ? ` pp-tone-${resolvedTone}`
    : '';
  let body = text;
  switch (field.kind) {
    case 'divider':
      return `<div class="pp-divider${span}" role="separator"><span>${esc(field.title)}</span></div>`;
    case 'heading':
      return `<header class="pp-section-heading${span}"><h2>${esc(field.title)}</h2>${values.length ? text : ''}</header>`;
    case 'list':
      body = values.length
        ? `<ul>${values.map((value, k) => `<li${openAttrs(valuePosition(k), value)}>${itemHTML(value)}</li>`).join('')}</ul>`
        : missing;
      break;
    case 'badge':
      body = values.length
        ? `<div class="pp-badges">${values.map((value) => `<span>${esc(value)}</span>`).join('')}</div>`
        : missing;
      break;
    case 'notice':
      body = `<div role="note">${text}</div>`;
      break;
    case 'progress':
    case 'gauge': {
      const value = number(values[0]),
        max = field.max || 100;
      const percent = value === null ? null : Math.min(100, Math.max(0, (value / max) * 100));
      body =
        percent === null
          ? missing
          : field.kind === 'gauge'
            ? l10nMsg`<div class="pp-gauge-ring" style="--pp-value:${percent}%"><span>${esc(values[0])}</span></div><p class="pp-scale">Skala 0–${esc(max)}</p>`
            : l10nMsg`${text}<progress max="${max}" value="${Math.max(0, Math.min(max, value))}" aria-label="${esc(field.title)}"></progress><p class="pp-scale">Skala 0–${esc(max)}</p>`;
      break;
    }
    case 'bars':
    case 'line': {
      const points = values
        .map((label) => ({ label, value: number(label) }))
        .filter((point) => point.value !== null);
      if (!points.length) {
        body = missing;
        break;
      }
      const low = Math.min(0, ...points.map((p) => p.value)),
        high = Math.max(1, ...points.map((p) => p.value));
      if (field.kind === 'bars')
        body = `<div class="pp-bars">${points.map((p) => `<div><span>${esc(p.label)}</span><div class="pp-bar-track"><i style="margin-left:${((Math.min(0, p.value) - low) / (high - low)) * 100}%;width:${Math.max(0.5, (Math.abs(p.value) / (high - low)) * 100)}%"></i></div></div>`).join('')}</div>`;
      else {
        const x = (i) => 10 + (i / Math.max(1, points.length - 1)) * 280;
        const y = (value) => 90 - ((value - low) / (high - low)) * 80;
        const positions = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
        const area = `10,90 ${positions} ${x(points.length - 1)},90`;
        const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
        const grid = [10, 50, 90].map((line) => `<path d="M10 ${line}H290"/>`).join('');
        body = `<svg class="pp-line-chart" viewBox="0 0 300 110" role="img" aria-label="${esc(field.title)}"><g class="pp-line-grid">${grid}</g><polygon class="pp-line-area" points="${area}"/><polyline points="${positions}"/>${points.map((p, i) => `<circle${i === peak ? ' class="pp-line-peak"' : ''} cx="${x(i)}" cy="${y(p.value)}" r="${i === peak ? 4.5 : 3}"><title>${esc(p.label)}</title></circle>`).join('')}</svg><ul class="pp-chart-values">${points.map((p) => `<li>${esc(p.label)}</li>`).join('')}</ul>`;
      }
      break;
    }
    case 'table': {
      const items = (source?.items || []).slice(0, field.limit || 20);
      const cell = (entry) =>
        `${entry.image && safeURL(entry.image) ? `<img class="pp-cell-image" src="${esc(safeURL(entry.image))}" alt="${esc(entry.text)}" referrerpolicy="no-referrer">` : ''}${esc(entry.text || '—')}`;
      if (field.columns?.length && items.length) {
        body = `<div class="pp-table-scroll"><table><thead><tr>${field.columns.map((col) => `<th scope="col">${esc(col.title)}</th>`).join('')}</tr></thead><tbody>${items.map((row, k) => `<tr${openAttrs(k, row.cells[0]?.text || '')}>${row.cells.map((entry) => `<td>${cell(entry)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        break;
      }
      const rows = (source?.rows || []).filter((row) => row.length).slice(0, field.limit || 20);
      body = rows.length
        ? `<div class="pp-table-scroll"><table><tbody>${rows.map((row, index) => `<tr>${row.map((cell) => (index === 0 && field.firstRowHeader ? `<th scope="col">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`
        : missing;
      break;
    }
    case 'cards':
    case 'grid': {
      const fromItems = !!source?.items?.length;
      const items = (
        fromItems ? source.items : values.map((value) => ({ cells: [{ text: value }] }))
      ).slice(0, field.limit || 20);
      body = items.length
        ? `<div class="pp-repeat pp-repeat-${field.kind}">${items.map((row, k) => `<article${openAttrs(fromItems ? k : valuePosition(k), row.cells[0]?.text || '')}>${row.cells.map((cell, index) => `${cell.image && safeURL(cell.image) ? `<img src="${esc(safeURL(cell.image))}" alt="${esc(cell.text || '')}" referrerpolicy="no-referrer">` : ''}<div>${field.columns?.[index]?.title ? `<span>${esc(field.columns[index].title)}</span>` : ''}${index === 0 ? `<h3>${esc(cell.text || '—')}</h3>` : `<p>${esc(cell.text || '—')}</p>`}</div>`).join('')}</article>`).join('')}</div>`
        : missing;
      break;
    }
    case 'timeline':
      body = values.length
        ? `<ol class="pp-timeline">${values.map((value, k) => `<li${openAttrs(valuePosition(k), value)}>${itemHTML(value)}</li>`).join('')}</ol>`
        : missing;
      break;
    case 'image': {
      const images = (source?.images || [])
        .filter((image) => safeURL(image.src))
        .slice(0, field.limit || 6);
      body = images.length
        ? `<div class="pp-images">${images.map((image) => `<figure><img src="${esc(safeURL(image.src))}" alt="${esc(image.alt || field.title)}" loading="lazy" referrerpolicy="no-referrer">${image.alt ? `<figcaption>${esc(image.alt)}</figcaption>` : ''}</figure>`).join('')}</div>`
        : missing;
      break;
    }
    case 'link': {
      const links = (source?.links || [])
        .filter((link) => safeURL(link.href))
        .slice(0, field.limit || 10);
      body = links.length
        ? `<div class="pp-links">${links.map((link) => `<button data-pp-link="${esc(safeURL(link.href))}">${esc(link.text || new URL(link.href).hostname)} <span aria-hidden="true">↗</span></button>`).join('')}</div>`
        : missing;
      break;
    }
    case 'accordion':
      return `<details class="pp-card pp-accordion${span}${tone}"><summary>${esc(field.icon || '✧')} ${esc(field.title)}</summary>${text}</details>`;
  }
  return `<section class="pp-card pp-${esc(field.kind === 'grid' ? 'block-grid' : field.kind)}${span}${tone}">${label}${body}</section>`;
}
