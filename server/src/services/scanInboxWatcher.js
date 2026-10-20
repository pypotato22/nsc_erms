import fs from 'node:fs';
import path from 'node:path';
import { getScanInboxPath } from './settings.js';
import { isStableFile } from './scanInbox.js';
import { publish, clientCount } from './liveEvents.js';

/**
 * Watches the scan inbox folder and pushes a `scan.changed` live event whenever
 * the set of claimable files changes (a scan lands, is removed, or is renamed
 * outside the app), so open Scan Inbox pages refresh without clicking Refresh.
 *
 * fs.watch gives near-instant reaction on local disks; a slow poll is the safety
 * net for network shares, where fs.watch can miss events, and it also catches
 * files that only become "stable" (done being written) a moment after they appear.
 */

const ALLOWED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx']);
const POLL_MS = 3000;
const WATCH_DEBOUNCE_MS = 400;
// Re-check once the scanner has had time to finish writing (see SCAN_STABLE_MS).
const SETTLE_CHECK_MS = 2000;

let started = false;
let watchedPath = null;
let watcher = null;
let lastSignature = null;
let debounceTimer = null;
let settleTimer = null;
let checking = false;

function signatureOf(inbox) {
  const parts = [];
  for (const ent of fs.readdirSync(inbox, { withFileTypes: true })) {
    if (!ent.isFile()) continue;
    if (!ALLOWED_EXT.has(path.extname(ent.name).toLowerCase())) continue;
    const abs = path.join(inbox, ent.name);
    if (!isStableFile(abs)) continue; // mirrors what the inbox list shows
    try {
      const st = fs.statSync(abs);
      parts.push(`${ent.name}|${st.size}|${Math.floor(st.mtimeMs)}`);
    } catch {
      /* removed between readdir and stat */
    }
  }
  return parts.sort().join('\n');
}

function closeWatcher() {
  if (watcher) {
    try {
      watcher.close();
    } catch {
      /* ignore */
    }
    watcher = null;
  }
}

function scheduleCheck() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(check, WATCH_DEBOUNCE_MS);
  debounceTimer.unref?.();
  clearTimeout(settleTimer);
  settleTimer = setTimeout(check, SETTLE_CHECK_MS);
  settleTimer.unref?.();
}

function watchFolder(inbox) {
  closeWatcher();
  watchedPath = inbox;
  try {
    watcher = fs.watch(inbox, { persistent: false }, scheduleCheck);
    watcher.on('error', () => {
      // Folder removed/unreachable — the poll will re-establish the watch.
      closeWatcher();
      watchedPath = null;
    });
  } catch {
    watcher = null; // polling alone still works
  }
}

async function check() {
  if (checking || clientCount() === 0) {
    // Nobody is listening: forget the baseline so the next client starts clean.
    if (clientCount() === 0) lastSignature = null;
    return;
  }
  checking = true;
  try {
    const inbox = await getScanInboxPath();
    if (!fs.existsSync(inbox)) return;
    if (inbox !== watchedPath || !watcher) watchFolder(inbox);

    const sig = signatureOf(inbox);
    if (lastSignature !== null && sig !== lastSignature) {
      publish('scan.changed', { action: 'detected' });
    }
    lastSignature = sig;
  } catch (err) {
    console.error('[scan-inbox watcher]', err.message);
  } finally {
    checking = false;
  }
}

export function startScanInboxWatcher() {
  if (started) return;
  started = true;
  const timer = setInterval(check, POLL_MS);
  timer.unref?.();
  check();
}
