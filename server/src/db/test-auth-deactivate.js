/**
 * Unit tests for fix 1: deactivated users cannot keep using the API.
 * Run: node server/src/db/test-auth-deactivate.js
 */
import {
  requireAuth,
  requireRole,
  clearUserSessions,
  __setQueryForTests as setAuthQuery,
} from '../middleware/auth.js';
import {
  passwordChangeGate,
  __setQueryForTests as setGateQuery,
} from '../middleware/passwordGate.js';
import { HttpError } from '../middleware/errors.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`OK ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}: ${err.message}`);
  } finally {
    setAuthQuery(null);
    setGateQuery(null);
  }
}

function mockReq({ userId = 'U1', url = '/api/v1/employees', role } = {}) {
  const session = {
    userId,
    roleCode: role,
    destroyed: false,
    destroy(cb) {
      this.destroyed = true;
      if (cb) cb();
    },
  };
  return { session, originalUrl: url, url, userRole: undefined };
}

function runMw(mw, req) {
  return new Promise((resolve) => {
    mw(req, {}, (err) => resolve({ err, req }));
  });
}

await test('requireAuth allows active user and sets role', async () => {
  setAuthQuery(async () => ({ rows: [{ code: 'staff' }] }));
  const req = mockReq();
  const { err } = await runMw(requireAuth, req);
  assert(!err, `unexpected err ${err?.message}`);
  assert(req.userRole === 'staff', `role=${req.userRole}`);
  assert(req.session.roleCode === 'staff', 'session role synced');
});

await test('requireAuth rejects missing session', async () => {
  const req = { session: {}, originalUrl: '/api/v1/employees' };
  const { err } = await runMw(requireAuth, req);
  assert(err instanceof HttpError && err.status === 401, `got ${err?.status}`);
});

await test('requireAuth rejects inactive / missing user', async () => {
  setAuthQuery(async () => ({ rows: [] }));
  const req = mockReq();
  const { err } = await runMw(requireAuth, req);
  assert(err instanceof HttpError && err.status === 401, `got ${err?.status}`);
  assert(req.session.destroyed === true, 'session should be destroyed');
});

await test('requireRole forbids wrong role', async () => {
  setAuthQuery(async () => ({ rows: [{ code: 'viewer' }] }));
  const req = mockReq();
  const { err } = await runMw(requireRole('admin', 'superadmin'), req);
  assert(err instanceof HttpError && err.status === 403, `got ${err?.status}`);
});

await test('requireRole allows matching role from requireAuth cache', async () => {
  const req = mockReq();
  req.userRole = 'admin';
  const { err } = await runMw(requireRole('admin', 'superadmin'), req);
  assert(!err, `unexpected ${err?.message}`);
});

await test('passwordGate rejects inactive user on protected route', async () => {
  setGateQuery(async () => ({ rows: [{ must_change_password: false, is_active: false }] }));
  const req = mockReq({ url: '/api/v1/employees' });
  const { err } = await runMw(passwordChangeGate, req);
  assert(err instanceof HttpError && err.status === 401, `got ${err?.status}`);
});

await test('passwordGate rejects missing user row', async () => {
  setGateQuery(async () => ({ rows: [] }));
  const req = mockReq({ url: '/api/v1/documents' });
  const { err } = await runMw(passwordChangeGate, req);
  assert(err instanceof HttpError && err.status === 401, `got ${err?.status}`);
});

await test('passwordGate still blocks must_change_password', async () => {
  setGateQuery(async () => ({ rows: [{ must_change_password: true, is_active: true }] }));
  const req = mockReq({ url: '/api/v1/employees' });
  const { err } = await runMw(passwordChangeGate, req);
  assert(err instanceof HttpError && err.status === 403, `got ${err?.status}`);
  assert(err.code === 'PASSWORD_CHANGE_REQUIRED', `code=${err.code}`);
});

await test('passwordGate allows active user', async () => {
  setGateQuery(async () => ({ rows: [{ must_change_password: false, is_active: true }] }));
  const req = mockReq({ url: '/api/v1/employees' });
  const { err } = await runMw(passwordChangeGate, req);
  assert(!err, `unexpected ${err?.message}`);
});

await test('clearUserSessions issues DELETE with userId', async () => {
  let seen = null;
  setAuthQuery(async (sql, params) => {
    seen = { sql, params };
    return { rows: [] };
  });
  await clearUserSessions('01ABC');
  assert(seen?.sql?.includes('DELETE FROM session'), `sql=${seen?.sql}`);
  assert(seen?.params?.[0] === '01ABC', `params=${seen?.params}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — fix 1 (deactivate session lifecycle)');
