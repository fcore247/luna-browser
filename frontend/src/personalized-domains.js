// Domains for which the user switched Luna views off with the "Luna" switch in the address bar.
// A per-browser preference: it survives restarts and applies to every tab and page of the domain.
const KEY = 'luna-personalized-off-domains';

// www.example.org and example.org are the same site, as everywhere else in personalized pages.
export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function offDomains() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '[]');
    return new Set(Array.isArray(stored) ? stored.filter((item) => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveOffDomains(domains) {
  try {
    if (domains.size) localStorage.setItem(KEY, JSON.stringify([...domains].sort()));
    else localStorage.removeItem(KEY);
  } catch {
    /* Private window or blocked storage: the switch then only lasts for this session. */
  }
}
