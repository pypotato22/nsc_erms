import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const fingerprintRouter = Router();

const writeRoles = requireRole('staff', 'admin', 'superadmin');
fingerprintRouter.use(requireAuth);

const sessionUrl = new URL('../../../electron/fingerprint/session.js', import.meta.url);

let captureApi;

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

fingerprintRouter.post('/capture', writeRoles, async (req, res, next) => {
  let settled = false;
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
    const body = publicResult(result);
    if (body.ok) console.log('[thumb] captured picture');
    else console.warn('[thumb] capture:', body.message);
    if (!res.writableEnded) res.json(body);
  } catch (err) {
    settled = true;
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
