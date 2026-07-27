/**
 * Verify PDS PDF cache key stability and get/put/invalidate round-trip.
 *
 * Usage: node src/db/verify-pds-pdf-cache.js
 */
import { normalizePds } from '../services/pds.js';
import {
  pdsPdfCacheKey,
  getCachedPdsPdf,
  putCachedPdsPdf,
  invalidatePdsPdfCache,
} from '../services/pdsPdfCache.js';

function demoEmployee(overrides = {}) {
  const pds = normalizePds({
    personal: { surname: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos' },
    otherInfo: {
      q34: { a: { answer: 'No' }, b: { answer: 'No' }, details: '' },
      q35: { a: { answer: 'No' }, b: { answer: 'No' } },
      q36: { answer: 'No' },
      q37: { answer: 'No' },
      q38: { a: { answer: 'No' }, b: { answer: 'No' } },
      q39: { answer: 'No' },
      q40: { a: { answer: 'No' }, b: { answer: 'No' }, c: { answer: 'No' } },
    },
  });
  return {
    id: '01VERIFYCACHE0001',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    middleName: 'Santos',
    employeeNo: 'VERIFY-CACHE-001',
    pds,
    profilePicturePath: null,
    ...overrides,
  };
}

async function main() {
  const checks = [];
  const ok = (name, pass) => checks.push({ name, pass });

  const emp = demoEmployee();
  const key1 = pdsPdfCacheKey(emp);
  const key2 = pdsPdfCacheKey(emp);
  ok('stable key', key1 === key2 && key1.length === 64);

  const changed = demoEmployee({
    pds: normalizePds({
      ...emp.pds,
      personal: { ...emp.pds.personal, bloodType: 'A+' },
    }),
  });
  ok('key changes with PDS', pdsPdfCacheKey(changed) !== key1);

  const photo = demoEmployee({ profilePicturePath: 'employees/x/photo.jpg' });
  ok('key changes with photo path', pdsPdfCacheKey(photo) !== key1);

  await invalidatePdsPdfCache(emp.id);
  const miss = await getCachedPdsPdf(emp);
  ok('miss before put', miss === null);

  const fakePdf = Buffer.from('%PDF-1.4 verify-cache');
  await putCachedPdsPdf(emp, fakePdf, 'excel-com');
  const hit = await getCachedPdsPdf(emp);
  ok('hit after put', hit?.pdf?.equals(fakePdf) && hit.engine === 'excel-com');

  await invalidatePdsPdfCache(emp.id);
  const afterInvalidate = await getCachedPdsPdf(emp);
  ok('miss after invalidate', afterInvalidate === null);

  const failed = checks.filter((c) => !c.pass);
  for (const c of checks) {
    console.log(`${c.pass ? 'OK ' : 'FAIL'} ${c.name}`);
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
