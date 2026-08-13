import { createElement } from 'react';

/**
 * React [`main.jsx`](./main.jsx) owns the bootstrap: auth screens and the
 * HashRouter [`AppShell`](./layouts/AppShell.jsx) render into `#root`, and
 * every page is a routed component — bridges remain only for the overlays.
 */
export const REACT_MIGRATION_PHASE = 10;

/** Proves React resolves under Vite without mounting anything. */
export function reactSmokeVNode() {
  return createElement('span', { 'data-react-smoke': '1' }, 'ok');
}
