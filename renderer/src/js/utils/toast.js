import { pushToast } from '../../shared/ui/toast/toastStore.js';

/**
 * App-wide toast API (vanilla + React).
 * Backed by toastStore; rendered by ToastHost.
 */
export function showToast(message, type = 'info', options = {}) {
  pushToast(message, type, options);
}
