import { useEffect, useRef } from 'react';

export const IDLE_LOGOUT_MS = 15 * 60 * 1000;

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
const CHECK_MS = 15_000;
const MOVE_THROTTLE_MS = 1_000;

/**
 * Sign the user out after `timeoutMs` with no mouse/keyboard/touch input.
 * Uses a last-activity timestamp plus a periodic / visibility / focus check so
 * OS sleep still logs out when the window is shown again. Network traffic
 * (SSE, fetch) does not count as activity.
 *
 * @param {{
 *   enabled: boolean,
 *   timeoutMs?: number,
 *   onIdle: () => void,
 * }} opts
 */
export function useIdleLogout({ enabled, timeoutMs = IDLE_LOGOUT_MS, onIdle }) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  const lastActivityRef = useRef(Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      firedRef.current = false;
      return undefined;
    }

    lastActivityRef.current = Date.now();
    firedRef.current = false;
    let lastMoveStamp = 0;

    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const onMove = () => {
      const now = Date.now();
      if (now - lastMoveStamp < MOVE_THROTTLE_MS) return;
      lastMoveStamp = now;
      markActivity();
    };

    const checkIdle = () => {
      if (firedRef.current) return;
      if (Date.now() - lastActivityRef.current < timeoutMs) return;
      firedRef.current = true;
      onIdleRef.current?.();
    };

    const capture = { capture: true };
    for (const name of ACTIVITY_EVENTS) {
      document.addEventListener(name, markActivity, capture);
    }
    document.addEventListener('mousemove', onMove, capture);
    document.addEventListener('visibilitychange', checkIdle);
    window.addEventListener('focus', checkIdle);

    const intervalId = setInterval(checkIdle, CHECK_MS);

    return () => {
      for (const name of ACTIVITY_EVENTS) {
        document.removeEventListener(name, markActivity, capture);
      }
      document.removeEventListener('mousemove', onMove, capture);
      document.removeEventListener('visibilitychange', checkIdle);
      window.removeEventListener('focus', checkIdle);
      clearInterval(intervalId);
    };
  }, [enabled, timeoutMs]);
}
