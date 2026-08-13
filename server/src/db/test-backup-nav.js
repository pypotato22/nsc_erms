/**
 * Tests for Backup nav RBAC visibility.
 * Run: node server/src/db/test-backup-nav.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const html = fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/style.css'), 'utf8');
const main = fs.readFileSync(path.join(root, 'renderer/src/main.js'), 'utf8');

test('backup nav link has needs-admin class', () => {
  assert(/data-page="backup"[^>]*class="[^"]*needs-admin/.test(html) ||
    /class="[^"]*needs-admin[^"]*"[^>]*data-page="backup"/.test(html) ||
    html.includes('data-page="backup" class="needs-admin"'));
});

test('CSS hides needs-admin for viewer and staff', () => {
  assert(css.includes('body[data-role="viewer"] .needs-admin'));
  assert(css.includes('body[data-role="staff"] .needs-admin'));
  assert(css.includes('display: none !important'));
});

test('navTo blocks backup for non-admins', () => {
  assert(main.includes("pageName === 'backup'"));
  assert(main.includes('canManageUsers()'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — backup nav RBAC');
