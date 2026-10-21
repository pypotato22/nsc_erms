import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const fingerprintRouter = Router();

const writeRoles = requireRole('staff', 'admin', 'superadmin');
fingerprintRouter.use(requireAuth);

const sessionUrl = new URL('../../../electron/fingerprint/session.js', import.meta.url);

let captureApi;
let capturing = false;
let statusInFlight = null;
let lastStatus = null;

function loadCapture() {
  if (!captureApi) captureApi = import(sessionUrl.href);
  return captureApi;
}

function publicResult(result) {
  const png = result?.image?.png;
  if (result?.ok && typeof png === 'string' && png) {
    return { ok: true, pngBase64: png };
  }
  return {
    ok: false,
    message: result?.message || 'The right thumb was not captured.',
  };
}

const winbioUrl = new URL('../../../electron/fingerprint/winbio.js', import.meta.url);
const chooseUrl = new URL('../../../electron/fingerprint/choose.js', import.meta.url);

async function readReaderStatus() {
  const [{ enumerateSensors }, { chooseRightThumbSensor }] = await Promise.all([
    import(winbioUrl.href),
    import(chooseUrl.href),
  ]);
  const listed = enumerateSensors();
  if (!listed.ok) return { available: false, message: listed.message };
  const sensor = chooseRightThumbSensor(listed.sensors);
  if (!sensor) return { available: false, message: 'U.are.U 4500 not detected' };
  return {
    available: true,
    reader: String(sensor.description || 'U.are.U 4500').replace(/\s+/g, ' ').trim(),
  };
}

/**
 * Is the U.are.U 4500 present? Read-only, and it never runs while a capture is in
 * progress (a capture is waiting on the reader; we must not touch it meanwhile).
 */
fingerprintRouter.get('/status', async (_req, res) => {
  if (process.platform !== 'win32') {
    return res.json({ available: false, message: 'Fingerprint capture needs Windows.' });
  }
  if (capturing) {
    return res.json(lastStatus || { available: true, reader: 'U.are.U 4500' });
  }
  try {
    if (!statusInFlight) {
      statusInFlight = readReaderStatus()
        .then((r) => {
          lastStatus = r;
          return r;
        })
        .finally(() => {
          statusInFlight = null;
        });
    }
    res.json(await statusInFlight);
  } catch (err) {
    res.json({ available: false, message: err?.message || 'Reader status unavailable' });
  }
});

fingerprintRouter.post('/capture', writeRoles, async (req, res, next) => {
  let settled = false;
  // Mark the reader busy right away and let any status probe finish first.
  capturing = true;
  if (statusInFlight) await statusInFlight.catch(() => {});
  const onClose = () => {
    if (settled || res.writableEnded) return;
    loadCapture()
      .then((api) => api.cancelCapture())
      .catch(() => {});
  };
  res.on('close', onClose);

  try {
    const api = await loadCapture();
    const result = await api.captureRightThumb();
    settled = true;
    capturing = false;
    const body = publicResult(result);
    if (body.ok) console.log('[thumb] captured picture');
    else console.warn('[thumb] capture:', body.message);
    if (!res.writableEnded) res.json(body);
  } catch (err) {
    settled = true;
    capturing = false;
    next(err);
  }
});

fingerprintRouter.post('/cancel', writeRoles, async (_req, res, next) => {
  try {
    const api = await loadCapture();
    res.json({ ok: true, canceled: Boolean(api.cancelCapture()) });
  } catch (err) {
    next(err);
  }
});
