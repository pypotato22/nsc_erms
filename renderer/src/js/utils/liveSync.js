/** Same-origin SSE client for live UI invalidation. */

const STREAM_URL = '/api/v1/events/stream';
const DEBOUNCE_MS = 300;

/** @type {EventSource | null} */
let source = null;
/** @type {Record<string, ReturnType<typeof setTimeout> | null>} */
const debounceTimers = {};
/** @type {Record<string, object>} */
const pendingPayloads = {};
/** @type {(Record<string, (payload?: object) => void> & {
 *   getCurrentUserId?: () => string | null | undefined,
 * }) | null} */
let handlers = null;

/**
 * @param {Record<string, (payload?: object) => void> & {
 *   getCurrentUserId?: () => string | null | undefined,
 * }} opts
 * Event keys: employees.changed, documents.changed, scan.changed,
 * departments.changed, positions.changed
 */
export function startLiveSync(opts) {
  handlers = opts;
  if (source) {
    source.close();
    source = null;
  }

  const es = new EventSource(STREAM_URL);
  source = es;

  for (const eventName of [
    'employees.changed',
    'documents.changed',
    'scan.changed',
    'departments.changed',
    'positions.changed',
  ]) {
    wireEvent(es, eventName);
  }

  es.onerror = () => {
    // Browser auto-reconnects
  };
}

/**
 * @param {EventSource} es
 * @param {string} eventName
 */
function wireEvent(es, eventName) {
  es.addEventListener(eventName, (ev) => {
    let payload = {};
    try {
      payload = JSON.parse(ev.data || '{}');
    } catch {
      payload = {};
    }

    const actorId = payload.actorUserId;
    const me = handlers?.getCurrentUserId?.();
    if (actorId && me && String(actorId) === String(me)) return;

    // Merge latest payload; debounce coalesces bursts
    pendingPayloads[eventName] = { ...pendingPayloads[eventName], ...payload };

    if (debounceTimers[eventName]) clearTimeout(debounceTimers[eventName]);
    debounceTimers[eventName] = setTimeout(() => {
      debounceTimers[eventName] = null;
      const data = pendingPayloads[eventName] || {};
      delete pendingPayloads[eventName];
      handlers?.[eventName]?.(data);
    }, DEBOUNCE_MS);
  });
}

export function stopLiveSync() {
  for (const key of Object.keys(debounceTimers)) {
    if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
    debounceTimers[key] = null;
  }
  for (const key of Object.keys(pendingPayloads)) {
    delete pendingPayloads[key];
  }
  if (source) {
    source.close();
    source = null;
  }
  handlers = null;
}
