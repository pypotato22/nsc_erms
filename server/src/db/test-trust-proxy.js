/**
 * Tests for trust proxy / client IP hardening.
 * Run: node server/src/db/test-trust-proxy.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTrustProxy } from '../config.js';
import { clientIp } from '../services/audit.js';

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

test('parseTrustProxy defaults / falsey → false', () => {
  assert(parseTrustProxy(undefined) === false);
  assert(parseTrustProxy('') === false);
  assert(parseTrustProxy('false') === false);
  assert(parseTrustProxy('0') === false);
  assert(parseTrustProxy('off') === false);
});

test('parseTrustProxy true variants → 1', () => {
  assert(parseTrustProxy('true') === 1);
  assert(parseTrustProxy('1') === 1);
  assert(parseTrustProxy('yes') === 1);
});

test('parseTrustProxy hop count', () => {
  assert(parseTrustProxy('2') === 2);
});

test('clientIp uses req.ip, ignores raw X-Forwarded-For header', () => {
  const req = {
    ip: '10.0.0.5',
    headers: { 'x-forwarded-for': '1.2.3.4' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert(clientIp(req) === '10.0.0.5');
});

test('clientIp falls back to socket when req.ip missing', () => {
  const req = {
    headers: { 'x-forwarded-for': '9.9.9.9' },
    socket: { remoteAddress: '192.168.1.10' },
  };
  assert(clientIp(req) === '192.168.1.10', clientIp(req));
});

test('spoofed X-Forwarded-For alone does not win', () => {
  const req = {
    ip: undefined,
    headers: { 'x-forwarded-for': '8.8.8.8' },
    socket: { remoteAddress: '::1' },
  };
  assert(clientIp(req) === '::1');
  assert(clientIp(req) !== '8.8.8.8');
});

const root = path.dirname(fileURLToPath(import.meta.url));
const appSrc = fs.readFileSync(path.join(root, '../app.js'), 'utf8');
const auditSrc = fs.readFileSync(path.join(root, '../services/audit.js'), 'utf8');

test('app uses config.trustProxy (not hard-coded 1)', () => {
  assert(appSrc.includes("app.set('trust proxy', config.trustProxy)"));
  assert(!appSrc.includes("app.set('trust proxy', 1)"));
});

test('clientIp no longer reads x-forwarded-for directly', () => {
  assert(!auditSrc.includes("headers['x-forwarded-for']"));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — trust proxy / client IP hardening');
