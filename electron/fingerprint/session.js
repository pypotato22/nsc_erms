import { Worker } from 'node:worker_threads';
import { cancelSession } from './winbio.js';

const CAPTURE_TIMEOUT_MS = 25000;
const CANCELED = 0x80098004;

let active = null;

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
    };
    active = job;

    const finish = (result) => {
      if (job.settled) return;
      job.settled = true;
      clearTimeout(job.timer);
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
      resolve(next);
    };

    job.timer = setTimeout(() => {
      job.timedOut = true;
      job.cancelled = true;
      if (job.handle != null) cancelSession(job.handle);
    }, CAPTURE_TIMEOUT_MS);

    worker.on('message', (message) => {
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
