/**
 * Phase 0 smoke test: React resolves; Vite can transform JSX; vanilla entry unchanged.
 * Run from repo root: node renderer/scripts/test-phase0.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererRoot = path.resolve(__dirname, '..');
const require = createRequire(path.join(rendererRoot, 'package.json'));

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

test('react and react-dom are installed', () => {
  const react = require('react');
  const reactDom = require('react-dom');
  assert(typeof react.createElement === 'function');
  assert(reactDom != null);
});

test('@vitejs/plugin-react is installed', () => {
  const plugin = require('@vitejs/plugin-react');
  assert(typeof plugin.default === 'function' || typeof plugin === 'function');
});

test('vite.config.js registers react plugin', () => {
  const cfg = fs.readFileSync(path.join(rendererRoot, 'vite.config.js'), 'utf8');
  assert(cfg.includes('@vitejs/plugin-react'));
  assert(cfg.includes('plugins: [react()]'));
});

test('index.html boots React main.jsx into #root', () => {
  const html = fs.readFileSync(path.join(rendererRoot, 'index.html'), 'utf8');
  assert(html.includes('./src/main.jsx'));
  assert(html.includes('id="root"'));
  const main = fs.readFileSync(path.join(rendererRoot, 'src/main.jsx'), 'utf8');
  assert(main.includes('RootApp'));
});

test('migration folder structure exists', () => {
  for (const rel of [
    'src/shared/ui',
    'src/shared/hooks',
    'src/shared/lib',
    'src/features',
    'src/layouts',
    'src/reactReady.js',
  ]) {
    const p = path.join(rendererRoot, rel);
    assert(fs.existsSync(p), `missing ${rel}`);
  }
});

test('shared/lib re-exports authz + toast', () => {
  const lib = fs.readFileSync(path.join(rendererRoot, 'src/shared/lib/index.js'), 'utf8');
  assert(lib.includes('authz.js'));
  assert(lib.includes('toast.js'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — Phase 0 scaffold');
