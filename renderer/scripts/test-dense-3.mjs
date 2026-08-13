/**
 * Dense slice 3 — Profile panel.
 * Run: node renderer/scripts/test-dense-3.mjs
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

const featurePath = path.join(root, 'src/features/profile/ProfilePanel.jsx');
const bridgePath = path.join(root, 'src/js/components/profilePanel.js');

test('ProfilePanel feature exists', () => {
  assert(fs.existsSync(featurePath), 'ProfilePanel.jsx missing');
  const src = fs.readFileSync(featurePath, 'utf8');
  assert(src.includes('export function ProfilePanel'), 'ProfilePanel export missing');
  assert(src.includes('panel-hdr') && src.includes('panel-tabs'), 'header/tabs markup missing');
  assert(src.includes('id="tab-docs"'), 'tab-docs host missing');
  assert(src.includes('renderTabDocs'), 'documents bridge not called');
  assert(src.includes('listEmployeeAssignments'), 'assignment history missing');
  assert(src.includes('openPdsViewer') && src.includes('downloadOfficialPdsExcel'), 'PDS actions missing');
  assert(src.includes('deleteEmployee') && src.includes('restoreEmployee'), 'archive/undo missing');
  assert(src.includes('canWrite'), 'write gating missing');
  assert(src.includes('getYearsOfService') && src.includes('getInitials'), 'helpers not reused');
  assert(!src.includes('getStatusBadge'), 'still using HTML-string status badge');
});

test('ProfilePanel leaves tab-docs empty for the documents island', () => {
  const src = fs.readFileSync(featurePath, 'utf8');
  assert(
    /id="tab-docs"[^>]*\/>/.test(src.replace(/\s+/g, ' ')),
    'tab-docs must be a childless host',
  );
});

test('bridge mounts React and keeps all exports', () => {
  const bridge = fs.readFileSync(bridgePath, 'utf8');
  assert(bridge.includes('mountIsland'), 'mountIsland missing');
  assert(bridge.includes('ProfilePanel'), 'ProfilePanel import missing');
  for (const sig of [
    'export function initProfilePanel',
    'export async function openProfilePanel',
    'export function closeProfilePanel',
    'export function getOpenProfileEmployeeId',
    'export async function refreshOpenProfileForLiveSync',
    'export async function refreshPanelHeader',
  ]) {
    assert(bridge.includes(sig), `${sig} missing`);
  }
  assert(!bridge.includes('setHTML'), 'bridge still renders HTML strings');
});

test('bridge toggles open classes on panel and backdrop', () => {
  const bridge = fs.readFileSync(bridgePath, 'utf8');
  assert(/getElementById\('panel'\)\?\.classList\.add\('open'\)/.test(bridge), 'panel open missing');
  assert(
    /getElementById\('panel-backdrop'\)\?\.classList\.add\('open'\)/.test(bridge),
    'backdrop open missing',
  );
  assert(
    /getElementById\('panel-backdrop'\)\?\.addEventListener\('click', closeProfilePanel\)/.test(bridge),
    'backdrop click close missing',
  );
});

test('panel is an empty host in index.html', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\s+/g, ' ');
  assert(/id="panel-backdrop"><\/div>/.test(html), 'panel-backdrop missing');
  assert(/<div id="panel"><\/div>/.test(html), 'panel is not an empty host');
  assert(!html.includes('id="panel-header"'), 'stale panel-header markup');
  assert(!html.includes('id="tab-info"'), 'stale tab markup');
});

test('main.js can still call refreshPanelHeader().catch', () => {
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  assert(main.includes('refreshPanelHeader().catch'), 'refreshPanelHeader().catch missing');
  const bridge = fs.readFileSync(bridgePath, 'utf8');
  assert(
    /export async function refreshPanelHeader/.test(bridge),
    'refreshPanelHeader must stay async so .catch works',
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — Dense 3 Profile panel');
