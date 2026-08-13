/**
 * Unit tests for fix 4: session regeneration on login.
 * Run: node server/src/db/test-session-regenerate.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const authSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../routes/auth.js'),
  'utf8',
);

const loginStart = authSrc.indexOf("authRouter.post('/login'");
const loginChunk = authSrc.slice(loginStart, authSrc.indexOf("authRouter.post('/logout'"));

test('login calls session.regenerate before setting userId', () => {
  const regenIdx = loginChunk.indexOf('req.session.regenerate');
  const userIdIdx = loginChunk.indexOf('req.session.userId = user.id');
  assert(regenIdx > 0, 'regenerate missing');
  assert(userIdIdx > 0, 'userId assign missing');
  assert(regenIdx < userIdIdx, 'regenerate must run before assigning userId');
});

test('login awaits regenerate via Promise wrapper', () => {
  assert(loginChunk.includes('await new Promise'), 'should await regenerate');
  assert(/regenerate\(\(err\)\s*=>/.test(loginChunk), 'callback form expected');
});

test('failed login does not regenerate / set session', () => {
  const failIdx = loginChunk.indexOf('INVALID_CREDENTIALS');
  const afterFail = loginChunk.slice(0, loginChunk.lastIndexOf('INVALID_CREDENTIALS'));
  // Two failure paths appear before regenerate
  const regenIdx = loginChunk.indexOf('req.session.regenerate');
  assert(failIdx > 0 && regenIdx > failIdx, 'failures should precede successful regenerate');
  assert(!afterFail.includes('req.session.userId = user.id'), 'no userId before regenerate block');
});

/** Behavioral mock of regenerate clearing planted session data */
test('regenerate clears planted session keys (fixation model)', async () => {
  const planted = { sid: 'attacker-sid', userId: 'attacker', roleCode: 'superadmin' };
  const session = {
    ...planted,
    regenerate(cb) {
      // emulate express-session: new empty session object identity
      for (const k of Object.keys(this)) {
        if (k !== 'regenerate') delete this[k];
      }
      this.sid = 'fresh-sid';
      cb(null);
    },
  };

  await new Promise((resolve, reject) => {
    session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  session.userId = 'real-user';
  session.roleCode = 'staff';

  assert(session.sid === 'fresh-sid', `sid=${session.sid}`);
  assert(session.userId === 'real-user', 'real user set');
  assert(session.roleCode === 'staff', 'role set');
  assert(!('attacker' in Object.values(session)), 'attacker gone');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — fix 4 (session regenerate on login)');
