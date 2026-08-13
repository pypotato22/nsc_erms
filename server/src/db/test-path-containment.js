/**
 * Unit tests for fix 2: path containment under FILES_ROOT.
 * Run: node server/src/db/test-path-containment.js
 */
import path from 'node:path';
import { absoluteFromRelative, isInsideRoot } from '../services/files.js';

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

// Use Windows-style roots when on win32 so sibling-prefix bug is real
const root = path.resolve('C:\\nsc-erms-storage');
const sibling = path.resolve('C:\\nsc-erms-storage2\\secret.txt');
const nested = path.join(root, 'employees', '01ABC', 'documents', 'doc.pdf');
const traversal = path.join(root, '..', 'nsc-erms-storage2', 'secret.txt');

test('isInsideRoot allows nested path', () => {
  assert(isInsideRoot(root, nested) === true, 'nested should be inside');
});

test('isInsideRoot allows root itself', () => {
  assert(isInsideRoot(root, root) === true, 'root should be inside itself');
});

test('isInsideRoot rejects sibling prefix path (storage vs storage2)', () => {
  assert(isInsideRoot(root, sibling) === false, 'sibling prefix must be rejected');
});

test('isInsideRoot rejects .. traversal to sibling', () => {
  const escaped = path.resolve(root, '..', 'nsc-erms-storage2', 'x');
  assert(isInsideRoot(root, escaped) === false, `escaped=${escaped}`);
});

test('absoluteFromRelative accepts valid relative path', () => {
  const abs = absoluteFromRelative(root, 'employees/01ABC/photo.jpg');
  assert(abs === path.resolve(root, 'employees/01ABC/photo.jpg'), abs);
});

test('absoluteFromRelative rejects absolute escape outside root', () => {
  let threw = false;
  try {
    // On Windows this resolves outside; on posix use /etc/passwd style
    absoluteFromRelative(root, sibling);
  } catch {
    threw = true;
  }
  // sibling as second arg: path.resolve(root, absolutePath) => absolutePath on win/posix
  assert(threw, 'absolute outside path should throw');
});

test('absoluteFromRelative rejects ..\\.. escape', () => {
  let threw = false;
  try {
    absoluteFromRelative(root, path.join('..', 'nsc-erms-storage2', 'evil.pdf'));
  } catch (err) {
    threw = true;
    assert(/Invalid storage path/.test(err.message), err.message);
  }
  assert(threw, 'traversal should throw');
});

test('absoluteFromRelative rejects storage2 when root is storage', () => {
  // Classic startsWith bug: resolve(root, '../nsc-erms-storage2/x')
  let threw = false;
  try {
    absoluteFromRelative(root, `..${path.sep}nsc-erms-storage2${path.sep}x.pdf`);
  } catch {
    threw = true;
  }
  assert(threw, 'prefix sibling via relative must throw');
});

// Demonstrate old startsWith would have failed this case
test('legacy startsWith would wrongly allow storage2', () => {
  const rootAbs = path.resolve(root);
  const bad = path.resolve('C:\\nsc-erms-storage2\\x');
  const legacyAllows = bad.startsWith(rootAbs);
  assert(legacyAllows === true, 'precondition: startsWith is unsafe here');
  assert(isInsideRoot(rootAbs, bad) === false, 'new check must reject');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — fix 2 (path containment)');
