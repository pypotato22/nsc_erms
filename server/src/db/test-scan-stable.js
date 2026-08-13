/**
 * Tests for scan inbox stable-file window.
 * Run: node server/src/db/test-scan-stable.js
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isStableFile, SCAN_STABLE_MS } from '../services/scanInbox.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erms-scan-stable-'));
const file = path.join(tmp, 'scan.pdf');
fs.writeFileSync(file, '%PDF-1.4 test');

test('rejects zero-byte file', () => {
  const empty = path.join(tmp, 'empty.pdf');
  fs.writeFileSync(empty, '');
  assert(isStableFile(empty) === false);
});

test('rejects freshly written file (mtime too new)', () => {
  const fresh = path.join(tmp, 'fresh.pdf');
  fs.writeFileSync(fresh, '%PDF');
  const now = Date.now();
  assert(isStableFile(fresh, { now, stableMs: SCAN_STABLE_MS }) === false);
});

test('accepts file older than stable window', () => {
  const old = path.join(tmp, 'old.pdf');
  fs.writeFileSync(old, '%PDF-old');
  const st = fs.statSync(old);
  const now = (st.mtimeMs ?? st.mtime.getTime()) + SCAN_STABLE_MS + 100;
  assert(isStableFile(old, { now, stableMs: SCAN_STABLE_MS }) === true);
});

test('rejects missing file', () => {
  assert(isStableFile(path.join(tmp, 'nope.pdf')) === false);
});

test('claim path re-checks isStableFile', () => {
  const src = fs.readFileSync(
    new URL('../services/scanInbox.js', import.meta.url),
    'utf8',
  );
  assert(src.includes('isStableFile(abs)'));
  assert(src.includes('still being written'));
});

try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* ignore */
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — scan stable-file window');
