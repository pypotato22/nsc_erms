/**
 * Fill demo PDS Excel and verify key cells against expected values.
 * Writes a sample file under tmp/ for manual open in Excel.
 *
 * Usage: node src/db/verify-pds-excel.js
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { buildFilledPdsWorkbook } from '../services/pdsExcel.js';
import { C1_CTRL, C4_YN, isCtrlChecked, isVmlChecked } from '../services/pdsExcelCheckboxes.js';
import { embedC4Photo } from '../services/pdsExcelPhoto.js';
import { embedC4Signature } from '../services/pdsExcelSignature.js';
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
      surname: 'Dela Cruz',
      firstName: 'Juan',
      middleName: 'Santos',
      nameExtension: 'Jr.',
      birthDate: '1990-05-15',
      placeOfBirth: 'Catarman, Northern Samar',
      sex: 'male',
      civilStatus: 'Married',
      heightM: '1.70',
      weightKg: '68',
      bloodType: 'O+',
      gsisUmidNo: '11-1111111-1',
      pagibigNo: '1210-1234-5678',
      philhealthNo: '12-345678901-2',
      philsysNo: '1234-5678-9012-3456',
      tinNo: '123-456-789-000',
      agencyEmployeeNo: 'DEMO-PDS-001',
      citizenship: 'Filipino',
      dualCitizenship: false,
      residentialAddress: {
        houseBlockLot: '123',
        street: 'Rizal St',
        subdivision: 'Sampaguita Village',
        barangay: 'Brgy. Dalakit',
        cityMunicipality: 'Catarman',
        province: 'Northern Samar',
        zipCode: '6400',
      },
      permanentAddress: {
        houseBlockLot: '123',
        street: 'Rizal St',
        subdivision: 'Sampaguita Village',
        barangay: 'Brgy. Dalakit',
        cityMunicipality: 'Catarman',
        province: 'Northern Samar',
        zipCode: '6400',
      },
      telephoneNo: '(055) 500-1234',
      mobileNo: '09171234567',
      email: 'juan.delacruz.demo@nsc.edu.ph',
    },
    family: {
      spouse: {
        surname: 'Dela Cruz',
        firstName: 'Maria',
        middleName: 'Reyes',
        occupation: 'Teacher',
        employer: 'DepEd Northern Samar',
        businessAddress: 'Catarman, Northern Samar',
        telephoneNo: '09181234567',
      },
      father: { surname: 'Dela Cruz', firstName: 'Pedro', middleName: 'Lopez' },
      mother: { surname: 'Santos', firstName: 'Ana', middleName: 'Garcia' },
      children: [
        { name: 'Ana Marie Dela Cruz', dateOfBirth: '2015-03-10' },
        { name: 'Jose Miguel Dela Cruz', dateOfBirth: '2018-11-22' },
        ...Array.from({ length: 12 }, (_, i) => ({
          name: `Child ${i + 3}`,
          dateOfBirth: `2020-0${(i % 9) + 1}-15`,
        })),
      ],
    },
    education: [
      {
        level: 'Elementary',
        schoolName: 'Catarman Central Elementary School',
        degreeCourse: 'Elementary',
        periodFrom: '1997',
        periodTo: '2003',
        yearGraduated: '2003',
        honors: 'With Honors',
      },
      {
        level: 'College',
        schoolName: 'Northern Samar Colleges',
        degreeCourse: 'BSIT',
        periodFrom: '2007',
        periodTo: '2011',
        yearGraduated: '2011',
        honors: 'Cum Laude',
      },
    ],
    eligibility: [
      {
        careerService: 'Professional (Second Level)',
        rating: '85.50',
        examDate: '2012-06-15',
        examPlace: 'CSC RO VIII',
        licenseNumber: 'N/A',
      },
      ...Array.from({ length: 8 }, (_v, i) => ({
        careerService: `Eligibility ${i + 2}`,
        rating: `${80 + i}.00`,
        examDate: `201${(i % 5) + 3}-01-0${(i % 9) + 1}`,
        examPlace: `Testing Center ${i + 2}`,
        licenseNumber: `LIC-${i + 2}`,
        licenseValidity: `202${(i % 5) + 6}-12-31`,
      })),
    ],
    workExperience: [
      {
        from: '2019-06-01',
        to: '',
        positionTitle: 'IT Staff',
        departmentAgency: 'Northern Samar Colleges',
        statusOfAppointment: 'Permanent',
        govService: true,
      },
      ...Array.from({ length: 29 }, (_v, i) => ({
        from: `20${String(10 + (i % 10)).padStart(2, '0')}-01-01`,
        to: i % 3 === 0 ? '' : `20${String(10 + (i % 10)).padStart(2, '0')}-12-31`,
        positionTitle: `Role ${i + 2}`,
        departmentAgency: `Agency ${i + 2}`,
        statusOfAppointment: i % 2 === 0 ? 'Permanent' : 'Contractual',
        govService: i % 2 === 0,
      })),
    ],
    voluntaryWork: [
      {
        orgName: 'NSC Alumni Association',
        orgAddress: 'Catarman',
        from: '2020-01-01',
        to: '2022-12-31',
        hours: '120',
        positionNature: 'Volunteer IT Support',
      },
      ...Array.from({ length: 8 }, (_v, i) => ({
        orgName: `Volunteer Org ${i + 2}`,
        orgAddress: `Town ${i + 2}`,
        from: `202${i % 4}-02-01`,
        to: `202${i % 4}-03-15`,
        hours: String(24 + i),
        positionNature: `Role ${i + 2}`,
      })),
    ],
    learningDevelopment: [
      {
        title: 'Cybersecurity Awareness',
        from: '2023-08-10',
        to: '2023-08-11',
        hours: '16',
        type: 'Technical',
        conductedBy: 'DICT Region VIII',
      },
      ...Array.from({ length: 22 }, (_v, i) => ({
        title: `Training ${i + 2}`,
        from: `202${i % 4}-04-01`,
        to: `202${i % 4}-04-02`,
        hours: String(8 + (i % 5) * 8),
        type: i % 2 === 0 ? 'Technical' : 'Supervisory',
        conductedBy: `Provider ${i + 2}`,
      })),
    ],
    otherInfo: {
      skills: ['Network administration'],
      recognitions: ['Outstanding Employee 2022'],
      memberships: ['PSITE'],
      q34: {
        a: { answer: 'No' },
        b: { answer: 'No' },
        details: '',
      },
      q35: {
        a: { answer: 'No', details: '' },
        b: { answer: 'No', details: '', dateFiled: '', status: '' },
      },
      q36: { answer: 'No', details: '' },
      q37: { answer: 'No', details: '' },
      q38: {
        a: { answer: 'No', details: '' },
        b: { answer: 'No', details: '' },
      },
      q39: { answer: 'No', details: '' },
      q40: {
        a: { answer: 'No', details: '' },
        b: { answer: 'No', details: '' },
        c: { answer: 'No', details: '' },
      },
      references: [
        { name: 'Dr. Elena Ramos', address: 'NSC', telephoneNo: '09190001111' },
      ],
      declaration: {
        governmentIssuedId: 'Passport',
        idNumber: 'P1234567',
        datePlaceOfIssuance: '01/01/2020, Manila',
        dateAccomplished: '2026-07-27',
      },
    },
  });

  const employee = {
    firstName: pds.personal.firstName,
    lastName: pds.personal.surname,
    middleName: pds.personal.middleName,
    nameExtension: pds.personal.nameExtension,
    employeeNo: 'DEMO-PDS-001',
    email: pds.personal.email,
    contactNumber: pds.personal.mobileNo,
    sex: pds.personal.sex,
    birthDate: pds.personal.birthDate,
    pds,
  };

  const buf = await buildFilledPdsWorkbook(employee);
  const bufCells = await buildFilledPdsWorkbook(employee, { skipFormCheckboxes: true });
  const outDir = path.join(projectRoot, 'tmp');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, 'DEMO-PDS-001-verify.xlsx');
  await fs.writeFile(outFile, buf);
  console.log('Wrote', outFile);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bufCells);
  const c1 = wb.getWorksheet('C1');
  const c2 = wb.getWorksheet('C2');
  const c3 = wb.getWorksheet('C3');
  const c4 = wb.getWorksheet('C4');
  const c1ChildCont = wb.getWorksheet('C1 Children Cont.');
  const c2EligCont = wb.getWorksheet('C2 Eligibility Cont.');
  const c2WorkCont = wb.getWorksheet('C2 Work Experience Cont.');
  const c3VolCont = wb.getWorksheet('C3 Voluntary Work Cont.');
  const c3LdCont = wb.getWorksheet('C3 Learning & Development Cont.');

  /** @type {{ sheet: string, addr: string, expect: string, actual: string, ok: boolean }[]} */
  const checks = [];
  function expect(sheet, ws, addr, expected) {
    const actual = cellText(ws, addr);
    const ok = actual === expected || actual.includes(expected);
    checks.push({ sheet, addr, expect: expected, actual, ok });
  }

  expect('C1', c1, 'D10', 'Dela Cruz');
  expect('C1', c1, 'D11', 'Juan');
  expect('C1', c1, 'D12', 'Santos');
  expect('C1', c1, 'L12', 'Jr.');
  expect('C1', c1, 'D13', '15/05/1990');
  expect('C1', c1, 'D15', 'Catarman, Northern Samar');
  expect('C1', c1, 'D22', '1.70');
  expect('C1', c1, 'D24', '68');
  expect('C1', c1, 'D25', 'O+');
  expect('C1', c1, 'D27', '11-1111111-1');
  expect('C1', c1, 'D34', 'DEMO-PDS-001');
  expect('C1', c1, 'I19', '123');
  expect('C1', c1, 'L19', 'Rizal St');
  expect('C1', c1, 'I33', '09171234567');
  expect('C1', c1, 'I34', 'juan.delacruz.demo@nsc.edu.ph');
  expect('C1', c1, 'D36', 'Dela Cruz');
  expect('C1', c1, 'D37', 'Maria');
  expect('C1', c1, 'D43', 'Dela Cruz');
  expect('C1', c1, 'D47', 'Santos');
  expect('C1', c1, 'I37', 'Ana Marie Dela Cruz');
  expect('C1', c1, 'M37', '10/03/2015');
  expect('C1', c1, 'D54', 'Catarman Central Elementary School');
  expect('C1', c1, 'D57', 'Northern Samar Colleges');

  expect('C1 Children Cont.', c1ChildCont, 'I2', 'Child 13');
  expect('C1 Children Cont.', c1ChildCont, 'I3', 'Child 14');

  expect('C2', c2, 'B5', 'Professional (Second Level)');
  expect('C2', c2, 'F5', '85.50');
  expect('C2', c2, 'G5', '15/06/2012');
  expect('C2', c2, 'D18', 'IT Staff');
  expect('C2', c2, 'G18', 'Northern Samar Colleges');
  expect('C2', c2, 'K18', 'Y');

  expect('C3', c3, 'B6', 'NSC Alumni Association — Catarman');
  expect('C3', c3, 'B18', 'Cybersecurity Awareness');
  expect('C3', c3, 'B42', 'Network administration');
  expect('C3', c3, 'D42', 'Outstanding Employee 2022');
  expect('C3', c3, 'J42', 'PSITE');
  expect('C2 Eligibility Cont.', c2EligCont, 'B5', 'Eligibility 8');
  expect('C2 Eligibility Cont.', c2EligCont, 'B6', 'Eligibility 9');
  expect('C2 Work Experience Cont.', c2WorkCont, 'D6', 'Role 29');
  expect('C2 Work Experience Cont.', c2WorkCont, 'D7', 'Role 30');
  expect('C3 Voluntary Work Cont.', c3VolCont, 'B5', 'Volunteer Org 8');
  expect('C3 Voluntary Work Cont.', c3VolCont, 'B6', 'Volunteer Org 9');
  expect('C3 Learning & Development Cont.', c3LdCont, 'B5', 'Training 22');
  expect('C3 Learning & Development Cont.', c3LdCont, 'B6', 'Training 23');

  expect('C4', c4, 'A52', 'Dr. Elena Ramos');
  expect('C4', c4, 'D61', 'Passport');
  expect('C4', c4, 'D62', 'P1234567');
  expect('C4', c4, 'D64', '01/01/2020, Manila');
  expect('C4', c4, 'J65', '27/07/2026');

  const zip = await JSZip.loadAsync(buf);
  checks.push({
    sheet: 'Workbook',
    addr: 'continuation.sheet6',
    expect: 'present',
    actual: zip.file('xl/worksheets/sheet6.xml') ? 'present' : 'missing',
    ok: Boolean(zip.file('xl/worksheets/sheet6.xml')),
  });
  checks.push({
    sheet: 'Workbook',
    addr: 'continuation.sheet9',
    expect: 'present',
    actual: zip.file('xl/worksheets/sheet9.xml') ? 'present' : 'missing',
    ok: Boolean(zip.file('xl/worksheets/sheet9.xml')),
  });
  const workbookXml = await zip.file('xl/workbook.xml').async('string');
  checks.push({
    sheet: 'Workbook',
    addr: 'continuation.name.c1children',
    expect: 'C1 Children Cont.',
    actual: workbookXml.includes('C1 Children Cont.') ? 'C1 Children Cont.' : 'missing',
    ok: workbookXml.includes('C1 Children Cont.'),
  });
  checks.push({
    sheet: 'Workbook',
    addr: 'continuation.name.c2elig',
    expect: 'C2 Eligibility Cont.',
    actual: workbookXml.includes('C2 Eligibility Cont.') ? 'C2 Eligibility Cont.' : 'missing',
    ok: workbookXml.includes('C2 Eligibility Cont.'),
  });
  checks.push({
    sheet: 'Workbook',
    addr: 'continuation.name.c2work',
    expect: 'C2 Work Experience Cont.',
    actual: workbookXml.includes('C2 Work Experience Cont.') ? 'C2 Work Experience Cont.' : 'missing',
    ok: workbookXml.includes('C2 Work Experience Cont.'),
  });
  checks.push({
    sheet: 'Workbook',
    addr: 'continuation.name.c3vol',
    expect: 'C3 Voluntary Work Cont.',
    actual: workbookXml.includes('C3 Voluntary Work Cont.') ? 'C3 Voluntary Work Cont.' : 'missing',
    ok: workbookXml.includes('C3 Voluntary Work Cont.'),
  });
  checks.push({
    sheet: 'Workbook',
    addr: 'continuation.name.c3ld',
    expect: 'C3 Learning & Development Cont.',
    actual: workbookXml.includes('C3 Learning &amp; Development Cont.')
      ? 'C3 Learning & Development Cont.'
      : 'missing',
    ok: workbookXml.includes('C3 Learning &amp; Development Cont.'),
  });
  const vml1 = await zip.file('xl/drawings/vmlDrawing1.vml').async('string');
  const vml2 = await zip.file('xl/drawings/vmlDrawing2.vml').async('string');
  // C1 form checkboxes (demo: Male, Married, Filipino)
  const c1Expected = {
    male: true,
    female: false,
    married: true,
    single: false,
    widowed: false,
    separated: false,
    other: false,
    filipino: true,
    dual: false,
    byBirth: false,
    byNaturalization: false,
  };
  for (const [key, on] of Object.entries(c1Expected)) {
    const meta = C1_CTRL[key];
    const xml = await zip.file(`xl/ctrlProps/ctrlProp${meta.prop}.xml`).async('string');
    const checked = isCtrlChecked(xml);
    checks.push({
      sheet: 'C1',
      addr: `cb.${key}`,
      expect: on ? 'Checked' : 'off',
      actual: checked ? 'Checked' : 'off',
      ok: checked === on,
    });
  }
  // Spot-check VML Checked nodes for a few C1 boxes
  for (const key of ['male', 'married', 'filipino', 'female']) {
    const on = c1Expected[key];
    const vmlOn = isVmlChecked(vml1, C1_CTRL[key]);
    checks.push({
      sheet: 'C1',
      addr: `vml.${key}`,
      expect: on ? 'Checked' : 'off',
      actual: vmlOn ? 'Checked' : 'off',
      ok: vmlOn === on,
    });
  }

  const sheet4Xml = await zip.file('xl/worksheets/sheet4.xml').async('string');
  checks.push({
    sheet: 'C4',
    addr: 'controls',
    expect: 'present',
    actual: sheet4Xml.includes('<controls') ? 'present' : 'missing',
    ok: sheet4Xml.includes('<controls'),
  });
  for (const [key, map] of Object.entries(C4_YN)) {
    const yesXml = await zip.file(`xl/ctrlProps/ctrlProp${map.yes}.xml`).async('string');
    const noXml = await zip.file(`xl/ctrlProps/ctrlProp${map.no}.xml`).async('string');
    const yesChecked = isCtrlChecked(yesXml);
    const noChecked = isCtrlChecked(noXml);
    checks.push({
      sheet: 'C4',
      addr: `${key}.yes`,
      expect: 'off',
      actual: yesChecked ? 'Checked' : 'off',
      ok: !yesChecked,
    });
    checks.push({
      sheet: 'C4',
      addr: `${key}.no`,
      expect: 'Checked',
      actual: noChecked ? 'Checked' : 'off',
      ok: noChecked,
    });
  }
  // VML spot-check: first and last No boxes should be checked
  checks.push({
    sheet: 'C4',
    addr: 'vml.q34a.no',
    expect: 'Checked',
    actual: isVmlChecked(vml2, { box: C4_YN['q34.a'].boxNo }) ? 'Checked' : 'off',
    ok: isVmlChecked(vml2, { box: C4_YN['q34.a'].boxNo }),
  });
  checks.push({
    sheet: 'C4',
    addr: 'vml.q40c.no',
    expect: 'Checked',
    actual: isVmlChecked(vml2, { box: C4_YN['q40.c'].boxNo }) ? 'Checked' : 'off',
    ok: isVmlChecked(vml2, { box: C4_YN['q40.c'].boxNo }),
  });

  const iconPath = path.join(projectRoot, 'electron/assets/icon.png');
  const iconBuf = await fs.readFile(iconPath);
  const withPhoto = await embedC4Photo(buf, iconBuf, 'icon.png');
  const zipPhoto = await JSZip.loadAsync(withPhoto);
  const hasMedia = Boolean(zipPhoto.file('xl/media/image1.png'));
  const drawing2 = await zipPhoto.file('xl/drawings/drawing2.xml').async('string');
  checks.push({
    sheet: 'C4',
    addr: 'photo.media',
    expect: 'image1.png',
    actual: hasMedia ? 'image1.png' : 'missing',
    ok: hasMedia,
  });
  checks.push({
    sheet: 'C4',
    addr: 'photo.anchor',
    expect: 'Employee Photo',
    actual: drawing2.includes('Employee Photo') ? 'Employee Photo' : 'missing',
    ok: drawing2.includes('Employee Photo'),
  });
  checks.push({
    sheet: 'C4',
    addr: 'photo.controls',
    expect: 'present',
    actual: (await zipPhoto.file('xl/drawings/vmlDrawing2.vml').async('string')).includes('Checkbox')
      ? 'present'
      : 'missing',
    ok: Boolean(await zipPhoto.file('xl/drawings/vmlDrawing2.vml')),
  });

  const withSignature = await embedC4Signature(withPhoto, iconBuf, 'icon.png');
  const zipSig = await JSZip.loadAsync(withSignature);
  const hasSigMedia = Boolean(zipSig.file('xl/media/image2.png'));
  const drawingSig = await zipSig.file('xl/drawings/drawing2.xml').async('string');
  checks.push({
    sheet: 'C4',
    addr: 'signature.media',
    expect: 'image2.png',
    actual: hasSigMedia ? 'image2.png' : 'missing',
    ok: hasSigMedia,
  });
  checks.push({
    sheet: 'C4',
    addr: 'signature.anchor',
    expect: 'Employee Signature',
    actual: drawingSig.includes('Employee Signature') ? 'Employee Signature' : 'missing',
    ok: drawingSig.includes('Employee Signature'),
  });
  checks.push({
    sheet: 'C4',
    addr: 'signature.photoKept',
    expect: 'Employee Photo',
    actual: drawingSig.includes('Employee Photo') ? 'Employee Photo' : 'missing',
    ok: drawingSig.includes('Employee Photo'),
  });

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    const mark = c.ok ? 'OK ' : 'FAIL';
    console.log(`${mark} ${c.sheet}!${c.addr}: expected="${c.expect}" actual="${c.actual}"`);
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) {
    process.exitCode = 1;
    console.error('\nMapping mismatches — review server/src/services/pdsExcel.js');
  } else {
    console.log('\nExcel mapping check passed.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
