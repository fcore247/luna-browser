import english from './locales/en.json';

export const LANGUAGE_KEY = 'luna-language';
export const languages = [
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
];
export function getLanguage() {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'de';
  } catch {
    return 'de';
  }
}
export const locale = () => (getLanguage() === 'en' ? 'en-GB' : 'de-DE');

export function setLanguage(language) {
  if (!languages.some(({ code }) => code === language)) throw Error('Unsupported language');
  // Write before updating the UI: a failed save must not claim to persist a preference.
  localStorage.setItem(LANGUAGE_KEY, language);
  document.documentElement.lang = language;
}

// Only translate authored text. Interpolated names, URLs, website content and user
// input never pass through the catalogue. HTML structure and internal IDs stay intact.
export function mapMessage(source, transform) {
  const text = (value) => {
    const trimmed = value.trim();
    return trimmed ? value.replace(trimmed, () => transform(trimmed)) : value;
  };
  if (!/<[a-z!/]/i.test(source)) return text(source);
  return source
    .split(/(<[^>]*>)/g)
    .map((part) =>
      part.startsWith('<')
        ? part.replace(
            /\b(title|placeholder|aria-label|alt|data-text)=(['"])(.*?)\2/g,
            (_, key, quote, value) =>
              `${key}=${quote}${text(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}${quote}`,
          )
        : text(part),
    )
    .join('');
}

const cache = new Map();
export function t(source) {
  source = String(source ?? '');
  if (getLanguage() !== 'en') return source;
  if (!cache.has(source))
    cache.set(
      source,
      mapMessage(source, (key) => (Object.hasOwn(english, key) ? english[key] : key)),
    );
  return cache.get(source);
}

export function msg(parts, ...values) {
  const source = parts.reduce((out, part, i) => out + (i ? `{{${i - 1}}}` : '') + part, '');
  return t(source).replace(/\{\{(\d+)\}\}/g, (_, index) => String(values[Number(index)]));
}

export function translateBackendError(error) {
  const source = String(error?.message || error);
  let translated = t(source);
  // A backend error may append a service response or a filename after a colon.
  // Keep that detail verbatim while translating the authored prefix.
  if (translated === source && source.includes(': ')) {
    const colon = source.indexOf(': ');
    translated = t(source.slice(0, colon + 1)) + source.slice(colon + 1);
  }
  return error instanceof Error ? new Error(translated, { cause: error }) : translated;
}

export function languagePickerHTML(id = 'luna-language') {
  return `<label for="${id}">${getLanguage() === 'en' ? 'Language' : 'Sprache / Language'}</label>
    <select id="${id}" data-language-picker aria-label="${getLanguage() === 'en' ? 'Language' : 'Sprache / Language'}">
      ${languages.map(({ code, name }) => `<option value="${code}" ${getLanguage() === code ? 'selected' : ''}>${name}</option>`).join('')}
    </select>`;
}

document.documentElement.lang = getLanguage();
// Only the explicitly marked, static shell in index.html uses this helper.
// Website views and user-created DOM are never visited.
document.querySelectorAll('[data-i18n]').forEach((element) => {
  for (const attribute of ['aria-label', 'title', 'placeholder']) {
    if (element.hasAttribute(attribute))
      element.setAttribute(attribute, t(element.getAttribute(attribute)));
  }
  if (element.hasAttribute('data-i18n-text')) element.textContent = t(element.textContent);
});
