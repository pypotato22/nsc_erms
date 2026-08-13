/**
 * Phase 3 smoke tests: hooks, titlebar, AppShell stub, react-router installed.
 * Run: node renderer/scripts/test-phase3.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(path.join(root, 'package.json'));

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

test('react-router-dom is installed', () => {
  const mod = require('react-router-dom');
  assert(typeof mod.HashRouter === 'function' || typeof mod.Router === 'function');
});

test('usePrefs and useLiveSync hooks exist', () => {
  assert(fs.existsSync(path.join(root, 'src/shared/hooks/usePrefs.js')));
  assert(fs.existsSync(path.join(root, 'src/shared/hooks/useLiveSync.js')));
  const prefs = fs.readFileSync(path.join(root, 'src/shared/hooks/usePrefs.js'), 'utf8');
  assert(prefs.includes('nsc_erms_prefs'));
});

test('Titlebar React layout is rendered by RootApp', () => {
  assert(fs.existsSync(path.join(root, 'src/layouts/Titlebar.jsx')));
  const rootApp = fs.readFileSync(path.join(root, 'src/app/RootApp.jsx'), 'utf8');
  assert(rootApp.includes('<Titlebar />'), 'RootApp must render the titlebar');
  assert(rootApp.includes('desktop-titlebar'), 'titlebar host missing');
  assert(!fs.existsSync(path.join(root, 'src/js/components/titlebar.js')), 'titlebar bridge should be gone');
});

test('AppShell owns the routed shell', () => {
  const shell = fs.readFileSync(path.join(root, 'src/layouts/AppShell.jsx'), 'utf8');
  assert(shell.includes('HashRouter'));
  assert(shell.includes('export function AppShell'));
});

test('migration phase is at least 3', () => {
  const ready = fs.readFileSync(path.join(root, 'src/reactReady.js'), 'utf8');
  const m = ready.match(/REACT_MIGRATION_PHASE\s*=\s*(\d+)/);
  assert(m && Number(m[1]) >= 3, 'expected REACT_MIGRATION_PHASE >= 3');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — Phase 3 shell foundations');
