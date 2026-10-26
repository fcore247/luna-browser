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

export function renderPersonalizedBlock(field, source, loading) {
  const values = (source?.values || []).slice(0, field.limit || 20);
  const missing = `<p class="pp-missing">${loading ? 'Wird geladen …' : 'Auf der Originalseite nicht gefunden'}</p>`;
  const text = values.length ? `<p>${esc(values.join(' · '))}</p>` : missing;
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
        ? `<ul>${values.map((value) => `<li>${esc(value)}</li>`).join('')}</ul>`
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
            ? `<div class="pp-gauge-ring" style="--pp-value:${percent}%"><span>${esc(values[0])}</span></div><p class="pp-scale">Skala 0–${esc(max)}</p>`
            : `${text}<progress max="${max}" value="${Math.max(0, Math.min(max, value))}" aria-label="${esc(field.title)}"></progress><p class="pp-scale">Skala 0–${esc(max)}</p>`;
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
        const positions = points
          .map(
            (p, i) =>
              `${10 + (i / Math.max(1, points.length - 1)) * 280},${90 - ((p.value - low) / (high - low)) * 80}`,
          )
          .join(' ');
        body = `<svg class="pp-line-chart" viewBox="0 0 300 110" role="img" aria-label="${esc(field.title)}"><path d="M10 10V90H290"/><polyline points="${positions}"/>${points.map((p, i) => `<circle cx="${10 + (i / Math.max(1, points.length - 1)) * 280}" cy="${90 - ((p.value - low) / (high - low)) * 80}" r="3"><title>${esc(p.label)}</title></circle>`).join('')}</svg><ul class="pp-chart-values">${points.map((p) => `<li>${esc(p.label)}</li>`).join('')}</ul>`;
      }
      break;
    }
    case 'table': {
      const items = (source?.items || []).slice(0, field.limit || 20);
      const cell = (entry) =>
        `${entry.image && safeURL(entry.image) ? `<img class="pp-cell-image" src="${esc(safeURL(entry.image))}" alt="${esc(entry.text)}" referrerpolicy="no-referrer">` : ''}${esc(entry.text || '—')}`;
      if (field.columns?.length && items.length) {
        body = `<div class="pp-table-scroll"><table><thead><tr>${field.columns.map((col) => `<th scope="col">${esc(col.title)}</th>`).join('')}</tr></thead><tbody>${items.map((row) => `<tr>${row.cells.map((entry) => `<td>${cell(entry)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
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
      const items = (
        source?.items?.length ? source.items : values.map((value) => ({ cells: [{ text: value }] }))
      ).slice(0, field.limit || 20);
      body = items.length
        ? `<div class="pp-repeat pp-repeat-${field.kind}">${items.map((row) => `<article>${row.cells.map((cell, index) => `${cell.image && safeURL(cell.image) ? `<img src="${esc(safeURL(cell.image))}" alt="${esc(cell.text || '')}" referrerpolicy="no-referrer">` : ''}<div>${field.columns?.[index]?.title ? `<span>${esc(field.columns[index].title)}</span>` : ''}${index === 0 ? `<h3>${esc(cell.text || '—')}</h3>` : `<p>${esc(cell.text || '—')}</p>`}</div>`).join('')}</article>`).join('')}</div>`
        : missing;
      break;
    }
    case 'timeline':
      body = values.length
        ? `<ol class="pp-timeline">${values.map((value) => `<li>${esc(value)}</li>`).join('')}</ol>`
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
