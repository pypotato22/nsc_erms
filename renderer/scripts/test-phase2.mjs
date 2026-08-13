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

test('RootApp renders the auth screens directly (bridges retired)', () => {
  const rootApp = fs.readFileSync(path.join(root, 'src/app/RootApp.jsx'), 'utf8');
  assert(rootApp.includes('LoginPage'));
  assert(rootApp.includes('SetupWizard'));
  assert(rootApp.includes('ChangePasswordModal'));
  assert(!fs.existsSync(path.join(root, 'src/js/components/login.js')), 'login bridge should be gone');
  assert(!fs.existsSync(path.join(root, 'src/js/components/setupWizard.js')), 'setup bridge should be gone');
});

test('changePassword bridge still serves the Settings page', () => {
  const pw = fs.readFileSync(path.join(root, 'src/js/components/changePassword.js'), 'utf8');
  assert(pw.includes('ChangePasswordModal'));
  assert(pw.includes('mountIsland'));
  assert(pw.includes('pw-react-host'));
});

test('RootApp renders ToastHost', () => {
  const rootApp = fs.readFileSync(path.join(root, 'src/app/RootApp.jsx'), 'utf8');
  assert(rootApp.includes('ToastHost'));
  assert(rootApp.includes('<ToastHost />'));
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
