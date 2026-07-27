/**
 * Dual-citizenship + Other civil-status path: tick Dual / by birth, country
 * dropdown, Other civil status + F19 text; assert ctrlProp + VML.
 *
 * Usage: node src/db/verify-pds-excel-dual.js
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { buildFilledPdsWorkbook } from '../services/pdsExcel.js';
import {
  C1_CTRL,
  C1_COUNTRY_DROP,
  isCtrlChecked,
  isVmlChecked,
  getFormDropSel,
} from '../services/pdsExcelCheckboxes.js';
import { normalizePds } from '../services/pds.js';

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
      surname: 'Reyes',
      firstName: 'Ana',
      middleName: 'Cruz',
      birthDate: '1988-03-20',
      placeOfBirth: 'Manila',
      sex: 'female',
      civilStatus: 'Other',
      civilStatusOther: 'Annulled',
      citizenship: 'Filipino',
      dualCitizenship: true,
      dualCitizenshipType: 'by birth',
      dualCitizenshipCountry: 'United Kingdom',
      agencyEmployeeNo: 'DEMO-PDS-DUAL',
      email: 'ana.dual@nsc.edu.ph',
      mobileNo: '09171112222',
      residentialAddress: {
        houseBlockLot: '1',
        street: 'Mabini',
        barangay: 'Centro',
        cityMunicipality: 'Catarman',
        province: 'Northern Samar',
        zipCode: '6400',
      },
    },
    otherInfo: {
      q34: { a: { answer: 'No' }, b: { answer: 'No' }, details: '' },
      q35: { a: { answer: 'No', details: '' }, b: { answer: 'No', details: '' } },
      q36: { answer: 'No', details: '' },
      q37: { answer: 'No', details: '' },
      q38: { a: { answer: 'No', details: '' }, b: { answer: 'No', details: '' } },
      q39: { answer: 'No', details: '' },
      q40: { a: { answer: 'No', details: '' }, b: { answer: 'No', details: '' }, c: { answer: 'No', details: '' } },
      references: [],
    },
  });

  const employee = {
    firstName: pds.personal.firstName,
    lastName: pds.personal.surname,
    employeeNo: 'DEMO-PDS-DUAL',
    pds,
  };

  const buf = await buildFilledPdsWorkbook(employee);
  const bufCells = await buildFilledPdsWorkbook(employee, { skipFormCheckboxes: true });
  const outDir = path.join(projectRoot, 'tmp');
  await fs.mkdir(outDir, { recursive: true });
  const xlsxPath = path.join(outDir, 'DEMO-PDS-DUAL-verify.xlsx');
  await fs.writeFile(xlsxPath, buf);
  console.log('Wrote', xlsxPath);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bufCells);
  const c1 = wb.getWorksheet('C1');

  const checks = [];
  function expectCell(addr, expected) {
    const actual = cellText(c1, addr);
    const ok = actual === expected || actual.includes(expected);
    checks.push({ addr, expect: expected, actual, ok });
  }

  expectCell('D10', 'Reyes');
  expectCell('D11', 'Ana');
  expectCell('F19', 'Annulled');
  expectCell('L16', 'United Kingdom');

  const zip = await JSZip.loadAsync(buf);
  const vml1 = await zip.file('xl/drawings/vmlDrawing1.vml').async('string');

  const c1Expected = {
    female: true,
    male: false,
    other: true,
    married: false,
    filipino: false,
    dual: true,
    byBirth: true,
    byNaturalization: false,
  };
  for (const [key, on] of Object.entries(c1Expected)) {
    const meta = C1_CTRL[key];
    const xml = await zip.file(`xl/ctrlProps/ctrlProp${meta.prop}.xml`).async('string');
    const checked = isCtrlChecked(xml);
    checks.push({
      addr: `ctrl.${key}`,
      expect: on ? 'Checked' : 'off',
      actual: checked ? 'Checked' : 'off',
      ok: checked === on,
    });
    const vmlOn = isVmlChecked(vml1, meta);
    checks.push({
      addr: `vml.${key}`,
      expect: on ? 'Checked' : 'off',
      actual: vmlOn ? 'Checked' : 'off',
      ok: vmlOn === on,
    });
  }

  const dropXml = await zip
    .file(`xl/ctrlProps/ctrlProp${C1_COUNTRY_DROP.prop}.xml`)
    .async('string');
  const sel = getFormDropSel(dropXml);
  checks.push({
    addr: 'drop.country.sel',
    expect: 'United Kingdom index (>1)',
    actual: String(sel),
    ok: typeof sel === 'number' && sel > 1,
  });
  // Also confirm selected label if we can resolve from a known UK index
  checks.push({
    addr: 'drop.country.xml',
    expect: 'sel attr present',
    actual: /\ssel="\d+"/.test(dropXml) ? 'present' : 'missing',
    ok: /\ssel="\d+"/.test(dropXml) && sel > 1,
  });

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? 'OK ' : 'FAIL'} ${c.addr}: expected~="${c.expect}" actual="${c.actual}"`);
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} dual-path checks passed`);
  if (failed.length) {
    process.exitCode = 1;
    console.error('Dual-path Excel mapping failed.');
  } else {
    console.log('Dual-path Excel mapping check passed.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
