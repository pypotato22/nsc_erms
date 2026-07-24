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
import { buildFilledPdsWorkbook } from '../services/pdsExcel.js';
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
    ],
    otherInfo: {
      skills: ['Network administration'],
      recognitions: ['Outstanding Employee 2022'],
      memberships: ['PSITE'],
      q34: { answer: 'No' },
      q35: { answer: 'No' },
      q36: { answer: 'No' },
      q37: { answer: 'No' },
      q38: { answer: 'No' },
      q39: { answer: 'No' },
      q40: { answer: 'No' },
      references: [
        { name: 'Dr. Elena Ramos', address: 'NSC', telephoneNo: '09190001111' },
      ],
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
  const outDir = path.join(projectRoot, 'tmp');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, 'DEMO-PDS-001-verify.xlsx');
  await fs.writeFile(outFile, buf);
  console.log('Wrote', outFile);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const c1 = wb.getWorksheet('C1');
  const c2 = wb.getWorksheet('C2');
  const c3 = wb.getWorksheet('C3');
  const c4 = wb.getWorksheet('C4');

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
  expect('C1', c1, 'D16', 'Male');
  expect('C1', c1, 'D17', 'Married');
  expect('C1', c1, 'J13', 'Filipino');
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

  expect('C4', c4, 'G6', 'No');
  expect('C4', c4, 'G13', 'No');
  expect('C4', c4, 'A52', 'Dr. Elena Ramos');

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
