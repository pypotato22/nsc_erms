/**
 * Polish slice: app event bus, legacy hash redirect, split stylesheets and
 * the React password toggles.
 * Run: node renderer/scripts/test-polish.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onAppEvent, emitAppEvent, clearAppEvents } from '../src/shared/lib/appEvents.js';
import { legacyHashTarget, redirectLegacyHash, KNOWN_PAGES } from '../src/shared/lib/legacyHash.js';

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

test('appEvents delivers payloads to every listener', () => {
  clearAppEvents();
  const seen = [];
  const offA = onAppEvent('employees.refresh', (p) => seen.push(['a', p?.q]));
  const offB = onAppEvent('employees.refresh', (p) => seen.push(['b', p?.q]));
  emitAppEvent('employees.refresh', { q: 'ana' });
  assert(JSON.stringify(seen) === JSON.stringify([['a', 'ana'], ['b', 'ana']]), JSON.stringify(seen));
  offA();
  offB();
});

test('appEvents unsubscribe stops delivery', () => {
  clearAppEvents();
  let calls = 0;
  const off = onAppEvent('trash.refresh', () => {
    calls += 1;
  });
  emitAppEvent('trash.refresh');
  off();
  emitAppEvent('trash.refresh');
  assert(calls === 1, `expected 1 call, got ${calls}`);
});

test('appEvents ignores unknown types and isolates throwing listeners', () => {
  clearAppEvents();
  emitAppEvent('nothing.listening');
  let reached = false;
  onAppEvent('scan.refresh', () => {
    throw new Error('boom');
  });
  onAppEvent('scan.refresh', () => {
    reached = true;
  });
  emitAppEvent('scan.refresh');
  assert(reached, 'a throwing listener must not stop the next one');
  clearAppEvents();
});

test('legacyHashTarget rewrites bare page hashes only', () => {
  assert(legacyHashTarget('#employees') === '#/employees');
  assert(legacyHashTarget('#archived-employees') === '#/archived-employees');
  assert(legacyHashTarget('#settings') === '#/settings');
  assert(legacyHashTarget('#/employees') === null, 'router hashes are left alone');
  assert(legacyHashTarget('') === null);
  assert(legacyHashTarget('#nonsense') === null, 'unknown pages are left alone');
  for (const page of KNOWN_PAGES) {
    assert(legacyHashTarget(`#${page}`) === `#/${page}`, page);
  }
});

test('redirectLegacyHash replaces history in place', () => {
  const calls = [];
  const win = {
    location: { hash: '#trash', pathname: '/index.html', search: '' },
    history: { replaceState: (a, b, url) => calls.push(url) },
  };
  assert(redirectLegacyHash(win) === '#/trash');
  assert(calls[0] === '/index.html#/trash', calls[0]);

  const already = {
    location: { hash: '#/trash', pathname: '/index.html', search: '' },
    history: { replaceState: () => calls.push('nope') },
  };
  assert(redirectLegacyHash(already) === null);
  assert(calls.length === 1, 'must not touch history when nothing to rewrite');
});

test('main.jsx redirects legacy hashes before the router boots', () => {
  const main = fs.readFileSync(path.join(root, 'src/main.jsx'), 'utf8');
  assert(main.includes('redirectLegacyHash'), 'redirect not called');
  assert(
    main.indexOf('redirectLegacyHash()') < main.indexOf('createRoot(container)'),
    'redirect must run before the root renders',
  );
});

const STYLE_FILES = [
  'tokens.css',
  'global.css',
  'layout.css',
  'ui.css',
  'overlays.css',
  'profile.css',
  'org.css',
  'tools.css',
  'auth.css',
  'pds.css',
  'print.css',
  'rbac.css',
];

test('style.css is a thin barrel over plain stylesheets', () => {
  const barrel = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
  assert(barrel.includes("@import './styles/global.css';"), 'global.css not imported');
  for (const file of STYLE_FILES) {
    if (file === 'tokens.css' || file === 'global.css') continue;
    assert(barrel.includes(`@import './styles/${file}';`), `${file} not imported`);
  }
  assert(barrel.includes('::-webkit-scrollbar'), 'scrollbar rules should stay in the barrel');
  assert(barrel.length < 2000, `barrel should stay thin, got ${barrel.length} bytes`);
});

test('split stylesheets exist and are plain CSS (no modules)', () => {
  const dir = path.join(root, 'src/styles');
  for (const file of STYLE_FILES) {
    assert(fs.existsSync(path.join(dir, file)), `styles/${file} missing`);
  }
  const modules = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.module.css'));
  assert(!modules.length, `styles/ must not hold CSS modules: ${modules.join(', ')}`);
});

test('key class names survived the split', () => {
  const dir = path.join(root, 'src/styles');
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const checks = [
    ['layout.css', ['#app', '#sidebar', '#topbar', '.page.active', '.nav-badge']],
    ['ui.css', ['.card', '.badge', '.btn', '.toolbar', '.avatar', '.empty', '.pager', '.password-toggle']],
    ['overlays.css', ['.overlay', '.modal', '.modal-close']],
    ['profile.css', ['.panel-hdr', '.panel-tabs', '.doc-item']],
    ['org.css', ['.dept-name', '.dept-pos-chip']],
    ['tools.css', ['.bk-item', '.settings-card', '.path-field-row']],
    ['auth.css', ['.login-box', '.login-btn']],
    ['pds.css', ['.cs212', '.pds-stepper']],
    ['print.css', ['@media print', '#print-area']],
    ['rbac.css', ['.needs-write', '.needs-admin', '.needs-superadmin']],
  ];
  for (const [file, selectors] of checks) {
    const css = read(file);
    for (const sel of selectors) {
      assert(css.includes(sel), `${sel} missing from styles/${file}`);
    }
  }
});

test('password fields use the React toggle component', () => {
  const component = fs.readFileSync(path.join(root, 'src/shared/ui/PasswordInput.jsx'), 'utf8');
  assert(component.includes('password-field') && component.includes('password-toggle'));
  assert(component.includes("type={visible ? 'text' : 'password'}"), 'toggle does not swap the input type');

  for (const rel of [
    'src/features/auth/LoginPage.jsx',
    'src/features/auth/ChangePasswordModal.jsx',
    'src/features/settings/SettingsPage.jsx',
  ]) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    assert(src.includes('PasswordInput'), `${rel} does not use PasswordInput`);
    assert(!src.includes('type="password"'), `${rel} still has a bare password input`);
  }
  assert(
    !fs.existsSync(path.join(root, 'src/js/utils/passwordToggle.js')),
    'the DOM-wrapping passwordToggle util should be deleted',
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — app events, hash redirect, split CSS, password toggles');
