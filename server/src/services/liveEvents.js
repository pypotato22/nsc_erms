/** In-memory SSE subscriber hub (single Node process). */

const clients = new Set();
const HEARTBEAT_MS = 25_000;

let heartbeatTimer = null;

function ensureHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    for (const res of clients) {
      try {
        res.write(': ping\n\n');
      } catch {
        clients.delete(res);
      }
    }
    if (clients.size === 0) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }, HEARTBEAT_MS);
  // Do not keep the process alive solely for heartbeats
  heartbeatTimer.unref?.();
}

/**
 * @param {import('express').Response} res
 */
export function subscribe(res) {
  clients.add(res);
  ensureHeartbeat();
}

/**
 * @param {import('express').Response} res
 */
export function unsubscribe(res) {
  clients.delete(res);
  if (clients.size === 0 && heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/**
 * @param {string} eventType
 * @param {Record<string, unknown>} payload
 */
export function publish(eventType, payload = {}) {
  const data = JSON.stringify(payload);
  const frame = `event: ${eventType}\ndata: ${data}\n\n`;
  for (const res of clients) {
    try {
      res.write(frame);
    } catch {
      clients.delete(res);
    }
  }
}

/** Number of connected live-sync clients (lets background watchers idle when nobody is listening). */
export function clientCount() {
  return clients.size;
}
