/**
 * Phase 9 smoke tests: React owns the boot — minimal index.html, HashRouter AppShell.
 * Run: node renderer/scripts/test-shell.mjs
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

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mainJsx = fs.readFileSync(path.join(root, 'src/main.jsx'), 'utf8');
const rootApp = fs.readFileSync(path.join(root, 'src/app/RootApp.jsx'), 'utf8');
const appShell = fs.readFileSync(path.join(root, 'src/layouts/AppShell.jsx'), 'utf8');

test('index.html mounts only #root', () => {
  assert(html.includes('id="root"'), '#root missing');
  for (const stale of [
    'id="login-screen"',
    'id="setup-screen"',
    'id="app"',
    'id="sidebar"',
    'id="emp-overlay"',
    'id="panel"',
    'id="pw-overlay"',
    'id="react-root"',
    'id="page-employees"',
  ]) {
    assert(!html.includes(stale), `${stale} should no longer live in static HTML`);
  }
});

test('index.html boots src/main.jsx', () => {
  assert(html.includes('./src/main.jsx'), 'main.jsx entry missing');
  assert(!html.includes('./src/main.js"'), 'vanilla main.js entry still referenced');
  assert(!fs.existsSync(path.join(root, 'src/main.js')), 'src/main.js should be deleted');
});

test('main.jsx creates the root and renders RootApp', () => {
  assert(mainJsx.includes('createRoot'), 'createRoot missing');
  assert(/getElementById\('root'\)/.test(mainJsx), 'does not target #root');
  assert(mainJsx.includes('<RootApp />'), 'RootApp not rendered');
});

test('RootApp owns auth screens and global hosts', () => {
  for (const token of ['LoginPage', 'SetupWizard', 'ChangePasswordModal', 'ToastHost', 'Titlebar']) {
    assert(rootApp.includes(token), `${token} missing from RootApp`);
  }
  for (const hostId of [
    'panel-backdrop',
    '"panel"',
    'emp-overlay',
    'pds-view-overlay',
    'doc-overlay',
    'doc-inbox-overlay',
    'pw-react-host',
    'print-area',
  ]) {
    assert(rootApp.includes(hostId), `host ${hostId} missing from RootApp`);
  }
});

test('RootApp wires overlay bridges and live sync', () => {
  assert(rootApp.includes('initEmployeeModal(getSearchQuery)'), 'initEmployeeModal not wired');
  assert(rootApp.includes('initProfilePanel(getSearchQuery)'), 'initProfilePanel not wired');
  assert(rootApp.includes('initPdsViewer'), 'initPdsViewer not wired');
  assert(/initDocuments\(\s*\(\)\s*=>/.test(rootApp), 'initDocuments callback not wired');
  assert(rootApp.includes('refreshPanelHeader().catch'), 'refreshPanelHeader().catch missing');
  assert(rootApp.includes('startLiveSync') && rootApp.includes('stopLiveSync'), 'live sync missing');
  assert(rootApp.includes('setCurrentRole'), 'setCurrentRole missing');
  assert(rootApp.includes("'nsc_erms_prefs'"), 'prefs key changed');
});

test('AppShell routes with HashRouter', () => {
  assert(appShell.includes('HashRouter'), 'HashRouter not imported');
  assert(appShell.includes('react-router-dom'), 'react-router-dom not imported');
  assert(appShell.includes('NavLink'), 'NavLink not used');
  assert(/Navigate to="\/employees"/.test(appShell), 'default redirect to /employees missing');
  for (const page of [
    'employees',
    'departments',
    'positions',
    'scan-inbox',
    'trash',
    'archived-employees',
    'backup',
    'export',
    'settings',
  ]) {
    assert(appShell.includes(`'${page}'`), `route ${page} missing`);
  }
});

test('AppShell renders the sidebar + page hosts React owns', () => {
  assert(appShell.includes('id="sidebar-nav"'), 'sidebar nav missing');
  assert(appShell.includes('id="page-title"'), 'page title missing');
  assert(appShell.includes('`page-${page}`'), 'page hosts not generated');
  for (const badge of ['emp-count-badge', 'scan-inbox-badge', 'trash-badge', 'archived-employees-badge']) {
    assert(appShell.includes(badge), `badge ${badge} missing`);
  }
  assert(appShell.includes('canManageUsers'), 'backup admin guard missing');
  assert(appShell.includes('needs-admin'), 'needs-admin class missing');
});

test('migration phase is at least 9', () => {
  const ready = fs.readFileSync(path.join(root, 'src/reactReady.js'), 'utf8');
  const m = ready.match(/REACT_MIGRATION_PHASE\s*=\s*(\d+)/);
  assert(m && Number(m[1]) >= 9, 'expected REACT_MIGRATION_PHASE >= 9');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — Phase 9 HashRouter AppShell');
