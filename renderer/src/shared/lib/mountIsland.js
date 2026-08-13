import { createRoot } from 'react-dom/client';

/** @type {Map<string, import('react-dom/client').Root>} */
const roots = new Map();

/**
 * Mount (or remount) a React tree into a DOM container.
 * Used for strangler islands while vanilla still owns the rest of the app.
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
  let root = roots.get(key);
  if (!root) {
    root = createRoot(el);
    roots.set(key, root);
  }
  root.render(element);
  return root;
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
  const root = roots.get(key);
  if (root) {
    root.unmount();
    roots.delete(key);
  }
}
