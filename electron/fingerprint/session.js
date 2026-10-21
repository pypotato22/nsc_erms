import { Worker } from 'node:worker_threads';
import { cancelSession } from './winbio.js';

const CAPTURE_TIMEOUT_MS = 25000;
const CANCELED = 0x80098004;

let active = null;

// If the small "Place your right thumb" prompt loses the foreground, Windows stops
// feeding it messages (it is blocked inside the reader call) and it ends up "Not
// responding". Detect that early and cancel the reader session cleanly instead.
const FOCUS_POLL_MS = 250;
const FOCUS_LOST_GRACE_MS = 1500;
let foregroundReader; // undefined = not tried yet, null = unavailable

async function loadForegroundReader() {
  if (foregroundReader !== undefined) return foregroundReader;
  try {
    if (process.platform !== 'win32') throw new Error('Windows only');
    const { default: koffi } = await import('koffi');
    const user32 = koffi.load('user32.dll');
    const getForeground = user32.func('void *GetForegroundWindow()');
    foregroundReader = () => {
      const win = getForeground();
      return win ? koffi.address(win) : 0n;
    };
  } catch {
    foregroundReader = null;
  }
  return foregroundReader;
}

async function watchFocus(job, hwndText) {
  if (!hwndText) return;
  const readForeground = await loadForegroundReader();
  if (!readForeground || job.settled) return;
  let target;
  try {
    target = BigInt(hwndText);
  } catch {
    return;
  }
  let seenInFront = false;
  let lostSince = 0;
  job.focusTimer = setInterval(() => {
    if (job.settled) return;
    let inFront;
    try {
      inFront = readForeground() === target;
    } catch {
      return;
    }
    if (inFront) {
      seenInFront = true;
      lostSince = 0;
      return;
    }
    if (!seenInFront) return; // never got focus: leave the normal timeout in charge
    if (!lostSince) {
      lostSince = Date.now();
      return;
    }
    if (Date.now() - lostSince >= FOCUS_LOST_GRACE_MS) {
      clearInterval(job.focusTimer);
      job.focusLost = true;
      job.cancelled = true;
      if (job.handle != null) cancelSession(job.handle);
    }
  }, FOCUS_POLL_MS);
  job.focusTimer.unref?.();
}

export function cancelCapture() {
  if (!active) return false;
  active.cancelled = true;
  if (active.handle != null) cancelSession(active.handle);
  return true;
}

function withoutPicture(result) {
  if (result?.ok && result.image?.png) return result;
  return {
    ...result,
    ok: false,
    image: null,
    message: result?.message || 'The right thumb was not captured.',
  };
}

function runCapture() {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./capture-worker.js', import.meta.url), { execArgv: [] });
    const job = {
      worker,
      handle: null,
      cancelled: false,
      timedOut: false,
      timer: null,
      settled: false,
      focusLost: false,
      focusTimer: null,
    };
    active = job;

    const finish = (result) => {
      if (job.settled) return;
      job.settled = true;
      clearTimeout(job.timer);
      clearInterval(job.focusTimer);
      if (active === job) active = null;
      worker.terminate().catch(() => {});
      let next = withoutPicture(result);
      if (job.timedOut && ((next.hresult >>> 0) === CANCELED || !next.message)) {
        next = {
          ...next,
          ok: false,
          image: null,
          message: 'No thumb was placed on the reader within 25 seconds.',
        };
      }
      if (job.focusLost && !next.ok) {
        next = {
          ...next,
          ok: false,
          image: null,
          message:
            'The capture stopped because the fingerprint prompt lost focus. Keep it in front while scanning, then try again.',
        };
      }
      resolve(next);
    };

    job.timer = setTimeout(() => {
      job.timedOut = true;
      job.cancelled = true;
      if (job.handle != null) cancelSession(job.handle);
    }, CAPTURE_TIMEOUT_MS);

    worker.on('message', (message) => {
      if (message.type === 'window') {
        watchFocus(job, message.hwnd).catch(() => {});
        return;
      }
      if (message.type === 'session') {
        job.handle = message.handle;
        if (job.cancelled) cancelSession(job.handle);
        return;
      }
      if (message.type === 'result') {
        const png = message.result?.image?.png;
        finish({
          ...message.result,
          image: typeof png === 'string' && png
            ? {
                png,
                width: message.result.image.width,
                height: message.result.image.height,
              }
            : null,
        });
      }
    });
    worker.on('error', (error) => {
      finish({
        ok: false,
        stage: 'capture',
        image: null,
        message: error?.message || 'The capture process failed.',
      });
    });
    worker.on('exit', (code) => {
      if (!job.settled && code !== 0) {
        finish({
          ok: false,
          stage: 'capture',
          image: null,
          message: 'The capture process stopped before a fingerprint was read.',
        });
      }
    });

    worker.postMessage({ type: 'capture' });
  });
}

export async function captureRightThumb() {
  if (active) {
    return {
      ok: false,
      stage: 'busy',
      image: null,
      message: 'A thumb capture is already in progress.',
    };
  }
  return runCapture();
}
