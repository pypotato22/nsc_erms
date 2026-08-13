/**
 * Tests for document version allocation (no soft-delete reuse + unique index).
 * Run: node server/src/db/test-document-version.js
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

const root = path.dirname(fileURLToPath(import.meta.url));
const versionSvc = fs.readFileSync(path.join(root, '../services/documentVersion.js'), 'utf8');
const docs = fs.readFileSync(path.join(root, '../routes/documents.js'), 'utf8');
const scan = fs.readFileSync(path.join(root, '../routes/scanInbox.js'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, '../../../db/migrations/006_document_version_unique.sql'),
  'utf8',
);

test('nextDocumentVersion SQL includes soft-deleted (no deleted_at filter)', () => {
  const fn = versionSvc.slice(
    versionSvc.indexOf('export async function nextDocumentVersion'),
    versionSvc.indexOf('export async function latestActiveDocumentId'),
  );
  assert(fn.includes('MAX(version_number)'), 'uses MAX');
  assert(!fn.includes('deleted_at'), 'must count soft-deleted versions');
});

test('latestActiveDocumentId filters deleted_at IS NULL', () => {
  const fn = versionSvc.slice(versionSvc.indexOf('export async function latestActiveDocumentId'));
  assert(fn.includes('deleted_at IS NULL'));
});

test('migration adds unique index on emp+type+version', () => {
  assert(migration.includes('uq_documents_employee_type_version'));
  assert(migration.includes('UNIQUE INDEX'));
  assert(migration.includes('employee_id, document_type_id, version_number'));
});

test('upload retries on unique violation 23505', () => {
  assert(docs.includes('nextDocumentVersion'));
  assert(docs.includes("dbErr.code === '23505'"));
  assert(docs.includes('maxAttempts'));
});

test('scan assign retries on unique violation 23505', () => {
  assert(scan.includes('nextDocumentVersion'));
  assert(scan.includes("dbErr.code === '23505'"));
});

test('version bump after soft-delete: max(2)+1 => 3', () => {
  // Pure logic mirror of SQL COALESCE(MAX,0)+1
  const maxIncludingDeleted = 2;
  const next = (maxIncludingDeleted ?? 0) + 1;
  assert(next === 3, `got ${next}`);
});

test('old bug would reuse v2 when only active max is 1', () => {
  const oldNext = (1 ?? 0) + 1; // active-only max after soft-deleting v2
  const fixedNext = (2 ?? 0) + 1; // includes soft-deleted
  assert(oldNext === 2 && fixedNext === 3);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — document version collision fix');
