/**
 * Phase 4 smoke tests for migrated catalog/tool pages. The page bridges are
 * gone, so the pages must be imported and routed by AppShell instead.
 * Run: node renderer/scripts/test-phase4.mjs
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

const features = [
  ['positions/PositionsPage.jsx', 'PositionsPage'],
  ['departments/DepartmentsPage.jsx', 'DepartmentsPage'],
  ['export/ExportPage.jsx', 'ExportPage'],
  ['backup/BackupPage.jsx', 'BackupPage'],
  ['trash/TrashPage.jsx', 'TrashPage'],
  ['archived/ArchivedEmployeesPage.jsx', 'ArchivedEmployeesPage'],
  ['scan-inbox/ScanInboxPage.jsx', 'ScanInboxPage'],
];

for (const [file, component] of features) {
  test(`AppShell routes ${component}`, () => {
    assert(fs.existsSync(path.join(root, 'src/features', file)), `${file} missing`);
    assert(appShell.includes(`../features/${file}`), `${component} not imported`);
    assert(appShell.includes(`<${component}`), `${component} not rendered`);
  });
}

const retiredBridges = [
  'positions.js',
  'departments.js',
  'export.js',
  'backup.js',
  'trash.js',
  'archivedEmployees.js',
  'scanInbox.js',
  'settings.js',
  'employeeTable.js',
];

for (const b of retiredBridges) {
  test(`bridge ${b} is retired`, () => {
    assert(!fs.existsSync(path.join(root, 'src/js/components', b)), `${b} should be deleted`);
  });
}

test('only overlay bridges remain', () => {
  const remaining = fs.readdirSync(path.join(root, 'src/js/components')).sort();
  const expected = [
    'changePassword.js',
    'documents.js',
    'employeeModal.js',
    'pdsViewer.js',
    'profilePanel.js',
  ];
  assert(
    JSON.stringify(remaining) === JSON.stringify(expected),
    `unexpected bridges: ${remaining.join(', ')}`,
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — Phase 4 pages');
