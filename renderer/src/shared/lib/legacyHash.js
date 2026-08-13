/**
 * Pre-router builds used bare hashes (`#employees`). HashRouter expects
 * `#/employees`, so rewrite the location before the router reads it.
 */

export const KNOWN_PAGES = [
  'employees',
  'departments',
  'positions',
  'scan-inbox',
  'trash',
  'archived-employees',
  'backup',
  'export',
  'settings',
];

/**
 * @param {string} hash Raw `location.hash` (with or without the leading `#`).
 * @returns {string | null} The router hash to use, or null when nothing to do.
 */
export function legacyHashTarget(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw || raw.startsWith('/')) return null;
  const page = raw.split(/[?/]/)[0];
  return KNOWN_PAGES.includes(page) ? `#/${raw}` : null;
}

/**
 * Rewrites a legacy hash in place (no extra history entry).
 * @param {Window} [win]
 * @returns {string | null} The applied hash, or null when nothing changed.
 */
export function redirectLegacyHash(win = typeof window !== 'undefined' ? window : undefined) {
  const target = legacyHashTarget(win?.location?.hash);
  if (!target) return null;
  const { pathname = '', search = '' } = win.location;
  win.history.replaceState(null, '', `${pathname}${search}${target}`);
  return target;
}
