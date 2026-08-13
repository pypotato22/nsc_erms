/**
 * Dense slice 1 — PDS viewer.
 * Run: node renderer/scripts/test-dense-1.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

test('PdsViewer feature exists', () => {
  assert(fs.existsSync(path.join(root, 'src/features/pds-viewer/PdsViewer.jsx')));
});

test('pdsViewer bridge mounts React', () => {
  const bridge = fs.readFileSync(path.join(root, 'src/js/components/pdsViewer.js'), 'utf8');
  assert(bridge.includes('PdsViewer') && bridge.includes('mountIsland'));
  assert(bridge.includes('export async function openPdsViewer'));
  assert(bridge.includes('export function downloadOfficialPdsExcel'));
});

test('pds-view-overlay is an empty host rendered by RootApp', () => {
  const rootApp = fs.readFileSync(path.join(root, 'src/app/RootApp.jsx'), 'utf8').replace(/\s+/g, ' ');
  assert(/<div id="pds-view-overlay" className="overlay" \/>/.test(rootApp), 'pds-view-overlay host missing');
});

test('full-bleed layout rules present', () => {
  const css = fs.readFileSync(path.join(root, 'src/styles/layout.css'), 'utf8');
  assert(/#app\s*\{[^}]*position:\s*fixed/s.test(css));
  assert(/#sidebar\s*\{[^}]*box-shadow:\s*none/s.test(css));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — Dense 1 PDS viewer');
