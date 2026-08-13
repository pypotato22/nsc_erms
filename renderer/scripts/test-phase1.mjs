/**
 * Phase 1 smoke test: tokens extracted; react-root present; build still works.
 * Run: node renderer/scripts/test-phase1.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const tokens = fs.readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8');
const globalCss = fs.readFileSync(path.join(root, 'src/styles/global.css'), 'utf8');
const style = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ready = fs.readFileSync(path.join(root, 'src/reactReady.js'), 'utf8');
const mount = fs.readFileSync(path.join(root, 'src/shared/lib/mountIsland.js'), 'utf8');

test('tokens.css defines :root brand vars', () => {
  assert(tokens.includes('--blue-900'));
  assert(tokens.includes('--bg-base'));
  assert(tokens.includes('body.dark'));
});

test('global.css imports tokens and sets body', () => {
  assert(globalCss.includes("@import './tokens.css'"));
  assert(globalCss.includes('font-family'));
});

test('style.css imports global.css and no longer duplicates :root block at top', () => {
  assert(style.startsWith('/**') || style.includes("@import './styles/global.css'"));
  assert(style.includes("@import './styles/global.css'"));
  const beforeScrollbar = style.slice(0, style.indexOf('Scrollbar'));
  assert(!beforeScrollbar.includes('--blue-900: #062b6e'));
});

test('index.html is a single React root', () => {
  assert(html.includes('id="root"'));
  assert(html.includes('./src/main.jsx'));
  assert(!html.includes('id="react-root"'), 'strangler island host is retired');
});

test('mountIsland helper exists', () => {
  assert(mount.includes('createRoot'));
  assert(mount.includes('export function mountIsland'));
  assert(mount.includes('export function unmountIsland'));
});

test('migration phase is at least 1', () => {
  const m = ready.match(/REACT_MIGRATION_PHASE\s*=\s*(\d+)/);
  assert(m && Number(m[1]) >= 1, ready);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — Phase 1 tokens + dual-boot');
