/**
 * Unit tests for fix 3: disk/DB ordering and rollback helpers.
 * Run: node server/src/db/test-storage-integrity.js
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollbackAbsoluteFile } from '../services/files.js';
import { restoreClaimedToInbox } from '../services/scanInbox.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
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

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'erms-fix3-'));

test('rollbackAbsoluteFile deletes written file', () => {
  const f = path.join(tmpRoot, 'orphan.pdf');
  fs.writeFileSync(f, 'x');
  assert(fs.existsSync(f), 'precondition');
  assert(rollbackAbsoluteFile(f) === true, 'should delete');
  assert(!fs.existsSync(f), 'file gone');
});

test('rollbackAbsoluteFile is no-op for missing path', () => {
  assert(rollbackAbsoluteFile(path.join(tmpRoot, 'missing.bin')) === false);
});

test('restoreClaimedToInbox moves file back to inbox', () => {
  const inbox = path.join(tmpRoot, 'inbox');
  const empDocs = path.join(tmpRoot, 'employees', 'E1', 'documents');
  fs.mkdirSync(inbox, { recursive: true });
  fs.mkdirSync(empDocs, { recursive: true });
  const claimed = path.join(empDocs, '01DOC_scan.pdf');
  fs.writeFileSync(claimed, 'pdf-bytes');
  const ok = restoreClaimedToInbox(inbox, claimed, 'scan.pdf');
  assert(ok === true, 'restore ok');
  assert(!fs.existsSync(claimed), 'claimed gone');
  assert(fs.existsSync(path.join(inbox, 'scan.pdf')), 'back in inbox');
});

test('restoreClaimedToInbox uses timestamped name if inbox name taken', () => {
  const inbox = path.join(tmpRoot, 'inbox2');
  const claimed = path.join(tmpRoot, 'claimed2.pdf');
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(path.join(inbox, 'scan.pdf'), 'old');
  fs.writeFileSync(claimed, 'new');
  restoreClaimedToInbox(inbox, claimed, 'scan.pdf');
  const restored = fs.readdirSync(inbox).filter((n) => n.includes('_restored_scan.pdf'));
  assert(restored.length === 1, `expected restored file, got ${fs.readdirSync(inbox)}`);
  assert(!fs.existsSync(claimed), 'claimed gone');
});

// Source-order checks: permanent deletes commit DB before disk cleanup
test('employee permanent delete: DB transaction before storage remove', () => {
  const src = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../routes/employees.js'),
    'utf8',
  );
  const start = src.indexOf("employeesRouter.delete('/:id/permanent'");
  const chunk = src.slice(start, start + 2500);
  const dbIdx = chunk.indexOf('DELETE FROM employees');
  const diskIdx = chunk.indexOf('removeEmployeeStorage');
  assert(dbIdx > 0 && diskIdx > 0, 'markers missing');
  assert(dbIdx < diskIdx, `DB delete at ${dbIdx} should precede storage remove at ${diskIdx}`);
  assert(chunk.includes('DB first'), 'should document DB-first intent');
});

test('document permanent delete: DELETE before removeStoredFile', () => {
  const src = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../routes/documents.js'),
    'utf8',
  );
  const start = src.indexOf("documentItemRouter.delete('/:id/permanent'");
  const chunk = src.slice(start, start + 1200);
  const dbIdx = chunk.indexOf('DELETE FROM documents');
  const diskIdx = chunk.indexOf('removeStoredFile');
  assert(dbIdx > 0 && diskIdx > 0, 'markers missing');
  assert(dbIdx < diskIdx, `DB at ${dbIdx} before disk at ${diskIdx}`);
});

test('document upload rolls back file on INSERT failure', () => {
  const src = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../routes/documents.js'),
    'utf8',
  );
  assert(src.includes('rollbackAbsoluteFile(saved.absolutePath)'), 'upload rollback missing');
});

test('scan assign restores inbox file on INSERT failure', () => {
  const src = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../routes/scanInbox.js'),
    'utf8',
  );
  assert(src.includes('restoreClaimedInboxFile'), 'scan restore missing');
});

try {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
} catch {
  /* ignore */
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — fix 3 (storage integrity)');
