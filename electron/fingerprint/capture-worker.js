import { parentPort } from 'node:worker_threads';
import { captureRightThumbOnReader } from './winbio.js';

parentPort.on('message', (message) => {
  if (message?.type !== 'capture') return;
  try {
    const result = captureRightThumbOnReader((handle) => {
      parentPort.postMessage({ type: 'session', handle });
    });
    parentPort.postMessage({ type: 'result', result });
  } catch (error) {
    parentPort.postMessage({
      type: 'result',
      result: {
        ok: false,
        stage: 'capture',
        image: null,
        message: error?.message || 'The fingerprint capture failed.',
      },
    });
  }
});
