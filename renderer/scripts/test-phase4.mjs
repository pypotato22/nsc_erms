/**
 * Phase 4 smoke tests for migrated catalog/tool pages.
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

const features = [
  'positions/PositionsPage.jsx',
  'departments/DepartmentsPage.jsx',
  'export/ExportPage.jsx',
  'backup/BackupPage.jsx',
  'trash/TrashPage.jsx',
  'archived/ArchivedEmployeesPage.jsx',
  'scan-inbox/ScanInboxPage.jsx',
];

for (const f of features) {
  test(`feature ${f}`, () => {
    assert(fs.existsSync(path.join(root, 'src/features', f)), f);
  });
}

const bridges = [
  'positions.js',
  'departments.js',
  'export.js',
  'backup.js',
  'trash.js',
  'archivedEmployees.js',
  'scanInbox.js',
];

for (const b of bridges) {
  test(`bridge ${b} mounts React`, () => {
    const src = fs.readFileSync(path.join(root, 'src/js/components', b), 'utf8');
    assert(src.includes('mountIsland'), b);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — Phase 4 pages');
