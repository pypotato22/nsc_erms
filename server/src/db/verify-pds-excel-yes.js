/**
 * Yes-path C4 spot check: fill workbook with Yes answers + details,
 * verify cells, optionally convert to PDF.
 *
 * Usage: node src/db/verify-pds-excel-yes.js
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { buildFilledPdsWorkbook } from '../services/pdsExcel.js';
import { normalizePds } from '../services/pds.js';
import { convertXlsxBufferToPdf } from '../services/pdsPdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');

function cellText(ws, addr) {
  const cell = ws.getCell(addr);
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.text) return String(v.text).trim();
    if (v.richText) return v.richText.map((t) => t.text).join('').trim();
    if (v.result != null) return String(v.result).trim();
    return JSON.stringify(v);
  }
  return String(v).trim();
}

async function main() {
  const pds = normalizePds({
    version: 2025,
    personal: {
      surname: 'Dela Cruz',
      firstName: 'Juan',
      middleName: 'Santos',
      nameExtension: 'Jr.',
      birthDate: '1990-05-15',
      placeOfBirth: 'Catarman, Northern Samar',
      sex: 'male',
      civilStatus: 'Married',
      agencyEmployeeNo: 'DEMO-PDS-YES',
      citizenship: 'Filipino',
      email: 'juan.yescheck@nsc.edu.ph',
      mobileNo: '09171234567',
      residentialAddress: {
        houseBlockLot: '123',
        street: 'Rizal St',
        barangay: 'Brgy. Dalakit',
        cityMunicipality: 'Catarman',
        province: 'Northern Samar',
        zipCode: '6400',
      },
    },
    otherInfo: {
      q34: {
        a: { answer: 'Yes' },
        b: { answer: 'No' },
        details: 'Cousin of recommending officer (3rd degree)',
      },
      q35: {
        a: { answer: 'No', details: '' },
        b: {
          answer: 'Yes',
          details: 'People v. Sample — for verification only',
          dateFiled: '2020-06-15',
          status: 'Dismissed',
        },
      },
      q36: { answer: 'No', details: '' },
      q37: { answer: 'No', details: '' },
      q38: {
        a: { answer: 'No', details: '' },
        b: { answer: 'No', details: '' },
      },
      q39: { answer: 'No', details: '' },
      q40: {
        a: { answer: 'Yes', details: 'Waray' },
        b: { answer: 'No', details: '' },
        c: { answer: 'No', details: '' },
      },
      references: [
        { name: 'Dr. Elena Ramos', address: 'NSC', telephoneNo: '09190001111' },
      ],
    },
  });

  const employee = {
    firstName: pds.personal.firstName,
    lastName: pds.personal.surname,
    employeeNo: 'DEMO-PDS-YES',
    pds,
  };

  const buf = await buildFilledPdsWorkbook(employee);
  const outDir = path.join(projectRoot, 'tmp');
  await fs.mkdir(outDir, { recursive: true });
  const xlsxPath = path.join(outDir, 'DEMO-PDS-YES-verify.xlsx');
  await fs.writeFile(xlsxPath, buf);
  console.log('Wrote', xlsxPath);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const c4 = wb.getWorksheet('C4');

  const checks = [];
  function expect(addr, expected) {
    const actual = cellText(c4, addr);
    const ok = actual === expected || actual.includes(expected);
    checks.push({ addr, expect: expected, actual, ok });
  }

  expect('I6', 'YES');
  expect('I8', 'NO');
  expect('G10', 'Cousin of recommending officer');
  expect('I15', 'NO');
  expect('I18', 'YES');
  expect('G19', 'People v. Sample');
  expect('J20', '15/06/2020');
  expect('J21', 'Dismissed');
  expect('I25', 'NO');
  expect('I43', 'YES');
  expect('G44', 'Waray');
  expect('A52', 'Dr. Elena Ramos');

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? 'OK ' : 'FAIL'} C4!${c.addr}: expected~="${c.expect}" actual="${c.actual}"`);
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} Yes-path checks passed`);

  if (failed.length) {
    process.exitCode = 1;
    console.error('Yes-path Excel mapping failed.');
    return;
  }

  try {
    const { pdf, engine } = await convertXlsxBufferToPdf(buf);
    const pdfPath = path.join(outDir, 'DEMO-PDS-YES-verify.pdf');
    await fs.writeFile(pdfPath, pdf);
    console.log(`PDF OK (${engine}) — wrote`, pdfPath, `(${pdf.length} bytes)`);
  } catch (err) {
    console.warn('PDF conversion skipped/failed:', err.message || err);
    console.warn('Excel Yes-path check still passed.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
