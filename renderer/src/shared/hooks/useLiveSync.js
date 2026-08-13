import { useEffect } from 'react';
import { startLiveSync, stopLiveSync } from '../../js/utils/liveSync.js';

/**
 * React wrapper around the existing SSE liveSync module.
 * @param {boolean} enabled
 * @param {Record<string, Function> & { getCurrentUserId?: () => string|null|undefined }} handlers
 */
export function useLiveSync(enabled, handlers) {
  useEffect(() => {
    if (!enabled || !handlers) {
      stopLiveSync();
      return undefined;
    }
    startLiveSync(handlers);
    return () => stopLiveSync();
  }, [enabled, handlers]);
}
