/**
 * Unit tests for MIME magic-byte validation.
 * Run: node server/src/db/test-file-magic.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sniffMime, assertAllowedBuffer, MIME } from '../services/fileMagic.js';

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

const docAllowed = new Set([
  MIME.PDF,
  MIME.JPEG,
  MIME.PNG,
  'image/jpg',
  MIME.DOC,
  MIME.DOCX,
]);

test('sniffs PDF', () => {
  assert(sniffMime(Buffer.from('%PDF-1.7\n...')) === MIME.PDF);
});

test('sniffs JPEG', () => {
  assert(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])) === MIME.JPEG);
});

test('sniffs PNG', () => {
  assert(
    sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])) ===
      MIME.PNG,
  );
});

test('sniffs WebP', () => {
  const buf = Buffer.alloc(16);
  buf.write('RIFF', 0);
  buf.write('WEBP', 8);
  assert(sniffMime(buf) === MIME.WEBP);
});

test('sniffs OLE DOC', () => {
  assert(
    sniffMime(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00])) ===
      MIME.DOC,
  );
});

test('sniffs DOCX zip with word/', () => {
  const buf = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('xxxxword/document.xml'),
  ]);
  assert(sniffMime(buf) === MIME.DOCX);
});

test('rejects plain ZIP without word/', () => {
  const buf = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('xl/workbook.xml'),
  ]);
  assert(sniffMime(buf) === null);
});

test('rejects EXE renamed as PDF', () => {
  const buf = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
  assert(sniffMime(buf) === null);
  let threw = false;
  try {
    assertAllowedBuffer(buf, docAllowed);
  } catch (e) {
    threw = true;
    assert(e.code === 'VALIDATION', e.code);
  }
  assert(threw);
});

test('accepts real PDF content', () => {
  assert(assertAllowedBuffer(Buffer.from('%PDF-1.4 fake'), docAllowed) === MIME.PDF);
});

test('photo allowlist rejects PDF bytes', () => {
  let threw = false;
  try {
    assertAllowedBuffer(Buffer.from('%PDF-1.4'), [MIME.JPEG, MIME.PNG, MIME.WEBP]);
  } catch {
    threw = true;
  }
  assert(threw);
});

const root = path.dirname(fileURLToPath(import.meta.url));
const docs = fs.readFileSync(path.join(root, '../routes/documents.js'), 'utf8');
const emps = fs.readFileSync(path.join(root, '../routes/employees.js'), 'utf8');
const scan = fs.readFileSync(path.join(root, '../services/scanInbox.js'), 'utf8');

test('documents route uses assertAllowedBuffer + stores sniffed mime', () => {
  assert(docs.includes('assertAllowedBuffer'));
  assert(/mimeType,\s*\n\s*versionNumber/.test(docs) || docs.includes('mimeType,'));
});

test('employees photo/signature use assertAllowedBuffer', () => {
  assert(emps.includes('assertAllowedBuffer'));
  assert((emps.match(/assertAllowedBuffer/g) || []).length >= 2);
});

test('scan claim uses assertAllowedBuffer', () => {
  assert(scan.includes('assertAllowedBuffer'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — MIME magic-byte validation');
