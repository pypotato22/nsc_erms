/**
 * Tiny in-app pub/sub used to keep mounted React pages in sync with changes
 * that happen elsewhere (live sync pushes, overlay saves, cross-page actions).
 *
 * Pages subscribe while mounted; emitters never need to know who is listening,
 * so nothing breaks when a page is unmounted by the router.
 *
 * Known event types:
 *   employees.refresh        { q?: string }
 *   employees.refreshFilters
 *   employees.clearSearch
 *   departments.refresh
 *   positions.refresh
 *   scan.refresh
 *   trash.refresh
 *   archived.refresh
 *   documents.refresh        { employeeId?: string }
 */

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/**
 * @param {string} type
 * @param {(payload?: any) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onAppEvent(type, fn) {
  if (typeof fn !== 'function') return () => {};
  let set = listeners.get(type);
  if (!set) {
    set = new Set();
    listeners.set(type, set);
  }
  set.add(fn);
  return () => {
    const current = listeners.get(type);
    if (!current) return;
    current.delete(fn);
    if (!current.size) listeners.delete(type);
  };
}

/**
 * @param {string} type
 * @param {any} [payload]
 */
export function emitAppEvent(type, payload) {
  const set = listeners.get(type);
  if (!set?.size) return;
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch {
      /* a broken listener must not stop the others */
    }
  }
}

/** Test helper: drop every listener. */
export function clearAppEvents() {
  listeners.clear();
}
