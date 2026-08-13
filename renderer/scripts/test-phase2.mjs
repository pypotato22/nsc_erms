/**
 * Phase 2 smoke tests: Toast + Login + ChangePassword + SetupWizard React slices.
 * Run: node renderer/scripts/test-phase2.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pushToast, clearToast, getToast, subscribeToast } from '../src/shared/ui/toast/toastStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

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

test('toastStore push/subscribe/clear', () => {
  let seen = null;
  const unsub = subscribeToast((item) => {
    seen = item;
  });
  pushToast('hello', 'success');
  assert(getToast()?.message === 'hello');
  assert(seen?.type === 'success');
  clearToast();
  assert(getToast() === null);
  assert(seen === null);
  unsub();
});

test('React auth feature files exist', () => {
  for (const rel of [
    'src/features/auth/LoginPage.jsx',
    'src/features/auth/ChangePasswordModal.jsx',
    'src/features/auth/SetupWizard.jsx',
    'src/features/auth/normalizeUser.js',
    'src/shared/ui/toast/ToastHost.jsx',
    'src/shared/ui/toast/ToastHost.module.css',
    'src/shared/ui/toast/toastStore.js',
  ]) {
    assert(fs.existsSync(path.join(root, rel)), rel);
  }
});

test('vanilla bridges mount React islands', () => {
  const login = fs.readFileSync(path.join(root, 'src/js/components/login.js'), 'utf8');
  const pw = fs.readFileSync(path.join(root, 'src/js/components/changePassword.js'), 'utf8');
  const setup = fs.readFileSync(path.join(root, 'src/js/components/setupWizard.js'), 'utf8');
  assert(login.includes('LoginPage'));
  assert(login.includes('mountIsland'));
  assert(pw.includes('ChangePasswordModal'));
  assert(setup.includes('SetupWizard'));
});

test('main.js mounts ToastHost', () => {
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  assert(main.includes('ToastHost'));
  assert(main.includes('mountIsland'));
});

test('showToast uses toastStore', () => {
  const toast = fs.readFileSync(path.join(root, 'src/js/utils/toast.js'), 'utf8');
  assert(toast.includes('pushToast'));
});

test('migration phase is at least 2', () => {
  const ready = fs.readFileSync(path.join(root, 'src/reactReady.js'), 'utf8');
  const m = ready.match(/REACT_MIGRATION_PHASE\s*=\s*(\d+)/);
  assert(m && Number(m[1]) >= 2, ready);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — Phase 2 auth React islands');
