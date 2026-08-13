import { createRoot } from 'react-dom/client';

/** @type {Map<string, { el: HTMLElement, root: import('react-dom/client').Root }>} */
const roots = new Map();

/**
 * Mount (or remount) a React tree into a DOM container.
 * Used for island roots that page/overlay bridges own inside the React shell.
 *
 * Hosts are rendered by the shell, so a host with a known id can be replaced by
 * a brand new element (e.g. after logout unmounts the AppShell). Cached roots
 * are therefore keyed to the element they were created for.
 *
 * @param {string|HTMLElement} containerOrId
 * @param {import('react').ReactNode} element
 */
export function mountIsland(containerOrId, element) {
  const el =
    typeof containerOrId === 'string'
      ? document.getElementById(containerOrId)
      : containerOrId;
  if (!el) {
    throw new Error(
      `mountIsland: container not found (${typeof containerOrId === 'string' ? containerOrId : 'element'})`,
    );
  }
  const key = el.id || '_anon';
  let entry = roots.get(key);
  if (entry && entry.el !== el) {
    entry.root.unmount();
    entry = null;
  }
  if (!entry) {
    entry = { el, root: createRoot(el) };
    roots.set(key, entry);
  }
  entry.root.render(element);
  return entry.root;
}

/**
 * Unmount a previously mounted island.
 * @param {string|HTMLElement} containerOrId
 */
export function unmountIsland(containerOrId) {
  const el =
    typeof containerOrId === 'string'
      ? document.getElementById(containerOrId)
      : containerOrId;
  if (!el) return;
  const key = el.id || '_anon';
  const entry = roots.get(key);
  if (entry) {
    entry.root.unmount();
    roots.delete(key);
  }
}
