/** Tiny pub/sub so vanilla `showToast` and React ToastHost share one channel. */

/** @typedef {{ id: number, message: string, type: string, actionLabel?: string, onAction?: Function, duration: number }} ToastItem */

/** @type {ToastItem|null} */
let current = null;
/** @type {Set<(item: ToastItem|null) => void>} */
const listeners = new Set();
let seq = 0;

export function subscribeToast(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(current);
}

/**
 * @param {string} message
 * @param {string} [type]
 * @param {{ actionLabel?: string, onAction?: Function, duration?: number }} [options]
 */
export function pushToast(message, type = 'info', options = {}) {
  const { actionLabel, onAction, duration = 3200 } = options;
  current = {
    id: ++seq,
    message: String(message || ''),
    type,
    actionLabel,
    onAction,
    duration,
  };
  emit();
  return current.id;
}

export function clearToast() {
  current = null;
  emit();
}

export function getToast() {
  return current;
}
