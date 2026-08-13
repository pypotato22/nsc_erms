/**
 * Phase 5–8 smoke tests (includes dense surfaces).
 * Run: node renderer/scripts/test-phase5-7.mjs
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

const appShell = fs.readFileSync(path.join(root, 'src/layouts/AppShell.jsx'), 'utf8');

test('SettingsPage is routed with its prefs props', () => {
  assert(fs.existsSync(path.join(root, 'src/features/settings/SettingsPage.jsx')));
  assert(!fs.existsSync(path.join(root, 'src/js/components/settings.js')), 'settings bridge should be gone');
  assert(appShell.includes('<SettingsPage'), 'SettingsPage not rendered by AppShell');
  for (const prop of ['getPrefs={getPrefs}', 'savePrefs={savePrefs}', 'getCurrentUser={getCurrentUser}']) {
    assert(appShell.includes(prop), `${prop} not passed to SettingsPage`);
  }
});

test('EmployeesPage is routed and event driven', () => {
  const page = fs.readFileSync(path.join(root, 'src/features/employees/EmployeesPage.jsx'), 'utf8');
  assert(!fs.existsSync(path.join(root, 'src/js/components/employeeTable.js')), 'table bridge should be gone');
  assert(appShell.includes('<EmployeesPage'), 'EmployeesPage not rendered by AppShell');
  assert(!page.includes('registerApi'), 'registerApi should be replaced by app events');
  for (const event of [
    "onAppEvent('employees.refresh'",
    "onAppEvent('employees.refreshFilters'",
    "onAppEvent('employees.clearSearch'",
  ]) {
    assert(page.includes(event), `${event} subscription missing`);
  }
});

test('dense surfaces are React islands', () => {
  assert(fs.existsSync(path.join(root, 'src/features/pds-viewer/PdsViewer.jsx')));
  assert(fs.existsSync(path.join(root, 'src/features/documents/DocumentsTab.jsx')));
  assert(fs.existsSync(path.join(root, 'src/features/profile/ProfilePanel.jsx')));
  assert(fs.existsSync(path.join(root, 'src/features/employee-wizard/EmployeeWizardModal.jsx')));
  for (const f of ['employeeModal.js', 'profilePanel.js', 'documents.js', 'pdsViewer.js']) {
    const bridge = fs.readFileSync(path.join(root, 'src/js/components', f), 'utf8');
    assert(bridge.includes('mountIsland'), `${f} should mount React`);
  }
});

test('migration phase is at least 8', () => {
  const ready = fs.readFileSync(path.join(root, 'src/reactReady.js'), 'utf8');
  const m = ready.match(/REACT_MIGRATION_PHASE\s*=\s*(\d+)/);
  assert(m && Number(m[1]) >= 8, 'expected REACT_MIGRATION_PHASE >= 8');
});

test('docs/frontend documents the React boot', () => {
  const docs = fs.readFileSync(path.join(root, '../docs/frontend.md'), 'utf8');
  assert(/React/i.test(docs) && /HashRouter/.test(docs));
  assert(docs.includes('main.jsx') && docs.includes('RootApp'));
  assert(docs.includes('appEvents'), 'app event bus not documented');
  assert(docs.includes('styles/'), 'split stylesheets not documented');
});

test('routes render the page inside the legacy #page-* host', () => {
  const shell = appShell.replace(/\s+/g, ' ');
  assert(/id=\{`page-\$\{id\}`\} className="page active"/.test(shell), 'page host wrapper missing');
  assert(!/'page active' : 'page'/.test(shell), 'stale multi-host page switching');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — Phase 5–8');
