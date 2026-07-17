import { HttpError } from './errors.js';
import { clientIp } from '../services/audit.js';

/** @type {Map<string, { count: number, resetAt: number }>} */
const buckets = new Map();

/**
 * Simple in-memory fixed-window rate limiter (single Node process).
 */
export function createRateLimiter({ windowMs, max, keyFn, message = 'Too many requests' }) {
  return (req, _res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      return next(new HttpError(429, message, 'RATE_LIMITED'));
    }
    next();
  };
}

/** Login: limit per IP + username and per IP overall. */
export const loginByAccountLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyFn: (req) => {
    const user = String(req.body?.username || '').trim().toLowerCase() || '_';
    return `login:acct:${clientIp(req)}:${user}`;
  },
  message: 'Too many login attempts for this account. Try again in 15 minutes.',
});

export const loginByIpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyFn: (req) => `login:ip:${clientIp(req)}`,
  message: 'Too many login attempts from this address. Try again later.',
});
