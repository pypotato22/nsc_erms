import { createElement } from 'react';

/**
 * Vanilla [`main.js`](./main.js) remains the active bootstrap until auth/shell migrate.
 */
export const REACT_MIGRATION_PHASE = 8;

/** Proves React resolves under Vite without mounting anything. */
export function reactSmokeVNode() {
  return createElement('span', { 'data-react-smoke': '1' }, 'ok');
}
