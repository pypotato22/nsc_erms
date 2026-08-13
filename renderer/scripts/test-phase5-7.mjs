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

test('SettingsPage + bridge exist', () => {
  assert(fs.existsSync(path.join(root, 'src/features/settings/SettingsPage.jsx')));
  const bridge = fs.readFileSync(path.join(root, 'src/js/components/settings.js'), 'utf8');
  assert(bridge.includes('SettingsPage') && bridge.includes('mountIsland'));
});

test('EmployeesPage + table bridge exist', () => {
  assert(fs.existsSync(path.join(root, 'src/features/employees/EmployeesPage.jsx')));
  const bridge = fs.readFileSync(path.join(root, 'src/js/components/employeeTable.js'), 'utf8');
  assert(bridge.includes('EmployeesPage') && bridge.includes('mountIsland'));
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

test('docs/frontend mentions React migration', () => {
  const docs = fs.readFileSync(path.join(root, '../docs/frontend.md'), 'utf8');
  assert(/React/i.test(docs) && /strangler/i.test(docs));
});

test('page-employees is an empty React host', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert(/id="page-employees"[^>]*class="page active"><\/div>/.test(html.replace(/\s+/g, ' ')));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — Phase 5–8');
