/**
 * Dense slice 2 — Documents tab.
 * Run: node renderer/scripts/test-dense-2.mjs
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

const bridgePath = path.join(root, 'src/js/components/documents.js');
const featurePath = path.join(root, 'src/features/documents/DocumentsTab.jsx');

test('DocumentsTab feature exists', () => {
  assert(fs.existsSync(featurePath), 'DocumentsTab.jsx missing');
  const src = fs.readFileSync(featurePath, 'utf8');
  assert(src.includes('export function DocumentsTab'), 'DocumentsTab export missing');
  assert(src.includes('ALLOWED_DOC_MIMES') && src.includes('ALLOWED_DOC_EXT'), 'drop filters missing');
  assert(src.includes('printDocument'), 'print action missing');
  assert(src.includes('restoreDocument'), 'undo restore missing');
});

test('documents bridge mounts React', () => {
  const bridge = fs.readFileSync(bridgePath, 'utf8');
  assert(bridge.includes('mountIsland'), 'mountIsland missing');
  assert(bridge.includes('DocumentsTab'), 'DocumentsTab import missing');
  assert(bridge.includes('export function initDocuments'), 'initDocuments missing');
  assert(bridge.includes('export async function renderTabDocs'), 'renderTabDocs missing');
  assert(
    bridge.includes('export async function refreshOpenDocsTabForLiveSync'),
    'refreshOpenDocsTabForLiveSync missing',
  );
});

test('documents bridge does not import profilePanel', () => {
  const bridge = fs.readFileSync(bridgePath, 'utf8');
  assert(!bridge.includes('profilePanel'), 'bridge still imports profilePanel');
  assert(bridge.includes('_onHeaderRefresh'), 'header refresh callback missing');
});

test('doc overlays are empty hosts rendered by RootApp', () => {
  const rootApp = fs.readFileSync(path.join(root, 'src/app/RootApp.jsx'), 'utf8').replace(/\s+/g, ' ');
  assert(/<div id="doc-overlay" className="overlay" \/>/.test(rootApp), 'doc-overlay host missing');
  assert(/<div id="doc-inbox-overlay" className="overlay" \/>/.test(rootApp), 'doc-inbox-overlay host missing');
});

test('RootApp passes header refresh into initDocuments', () => {
  const rootApp = fs.readFileSync(path.join(root, 'src/app/RootApp.jsx'), 'utf8');
  assert(/initDocuments\(\s*\(\)\s*=>/.test(rootApp), 'initDocuments callback not wired');
  assert(rootApp.includes('refreshPanelHeader'), 'refreshPanelHeader not imported');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — Dense 2 Documents tab');
