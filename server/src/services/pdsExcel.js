import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { coercePdsFromRow, normalizePds } from './pds.js';
import { applyPdsFormCheckboxes } from './pdsExcelCheckboxes.js';
import { embedC4PhotoFromEmployee } from './pdsExcelPhoto.js';
import { addContinuationSheets } from './pdsExcelContinuation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');
export const PDS_TEMPLATE_PATH = path.join(
  projectRoot,
  'assets/forms/CS-Form-212-Revised-2025.xlsx',
);

const C2_ELIGIBILITY_CONT = {
  baseName: 'C2 Eligibility',
  sourceSheetName: 'C2',
  cloneFromRow: 2,
  cloneToRow: 12,
  dataStartRow: 5,
  pageSize: 7,
  fillRow(ws, row, e) {
    set(ws, `B${row}`, raw(e.careerService));
    set(ws, `F${row}`, raw(e.rating));
    set(ws, `G${row}`, dmy(e.examDate));
    set(ws, `I${row}`, raw(e.examPlace));
    set(ws, `J${row}`, raw(e.licenseNumber));
    set(ws, `K${row}`, dmy(e.licenseValidity));
  },
};

const C2_WORK_CONT = {
  baseName: 'C2 Work Experience',
  sourceSheetName: 'C2',
  cloneFromRow: 13,
  cloneToRow: 46,
  dataStartRow: 6,
  pageSize: 28,
  fillRow(ws, row, w) {
    set(ws, `A${row}`, dmy(w.from));
    set(ws, `C${row}`, dmy(w.to));
    set(ws, `D${row}`, raw(w.positionTitle));
    set(ws, `G${row}`, raw(w.departmentAgency));
    set(ws, `J${row}`, raw(w.statusOfAppointment));
    set(ws, `K${row}`, w.govService ? 'Y' : raw(w.govService) === '' ? '' : 'N');
  },
};

const C3_VOLUNTARY_CONT = {
  baseName: 'C3 Voluntary Work',
  sourceSheetName: 'C3',
  cloneFromRow: 2,
  cloneToRow: 13,
  dataStartRow: 5,
  pageSize: 7,
  fillRow(ws, row, v) {
    const org = [v.orgName, v.orgAddress].filter(Boolean).join(' — ');
    set(ws, `B${row}`, raw(org));
    set(ws, `E${row}`, dmy(v.from));
    set(ws, `F${row}`, dmy(v.to));
    set(ws, `G${row}`, raw(v.hours));
    set(ws, `H${row}`, raw(v.positionNature));
  },
};

const C3_LD_CONT = {
  baseName: 'C3 Learning & Development',
  sourceSheetName: 'C3',
  cloneFromRow: 14,
  cloneToRow: 39,
  dataStartRow: 5,
  pageSize: 21,
  fillRow(ws, row, item) {
    set(ws, `B${row}`, raw(item.title));
    set(ws, `E${row}`, dmy(item.from));
    set(ws, `F${row}`, dmy(item.to));
    set(ws, `G${row}`, raw(item.hours));
    set(ws, `H${row}`, raw(item.type));
    set(ws, `I${row}`, raw(item.conductedBy));
  },
};

function na(value) {
  const s = value == null ? '' : String(value).trim();
  return s || 'N/A';
}

function raw(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Convert YYYY-MM-DD (or Date) to dd/mm/yyyy for CSC forms. */
function dmy(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const dd = String(value.getDate()).padStart(2, '0');
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const yyyy = value.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`; // dd/mm/yyyy
  return s;
}

function set(ws, addr, value) {
  if (value === undefined || value === null) return;
  ws.getCell(addr).value = value;
}

function findEducation(list, levelNeedle) {
  const needle = levelNeedle.toLowerCase();
  return (list || []).find((r) => String(r.level || '').toLowerCase().includes(needle)) || null;
}

/**
 * Fill official CS Form 212 (Revised 2025) Excel from employee + pds.
 * @param {{ pds?: object, employeeNo?: string, firstName?: string, lastName?: string, email?: string, contactNumber?: string }} employee
 * @param {{ skipFormCheckboxes?: boolean }} [options] skipFormCheckboxes skips OOXML restore (for ExcelJS cell reads in tests)
 * @returns {Promise<Buffer>}
 */
export async function buildFilledPdsWorkbook(employee, options = {}) {
  const pds = normalizePds(
    coercePdsFromRow(employee?.pds, {
      first_name: employee?.firstName,
      last_name: employee?.lastName,
      middle_name: employee?.middleName,
      name_extension: employee?.nameExtension,
      email: employee?.email,
      contact_number: employee?.contactNumber,
      employee_no: employee?.employeeNo,
      sex: employee?.sex,
      birth_date: employee?.birthDate,
      address: employee?.address,
    }),
  );

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(PDS_TEMPLATE_PATH);

  fillC1(wb.getWorksheet('C1'), pds, employee);
  fillC2(wb, wb.getWorksheet('C2'), pds);
  fillC3(wb, wb.getWorksheet('C3'), pds);
  fillC4(wb.getWorksheet('C4'), pds);

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  if (options.skipFormCheckboxes) return buf;
  // ExcelJS strips form controls; graft values into template and tick checkboxes.
  let out = await applyPdsFormCheckboxes(buf, pds);
  if (!options.skipPhoto && employee?.profilePicturePath) {
    out = await embedC4PhotoFromEmployee(out, employee);
  }
  return out;
}

function fillC1(ws, pds, employee) {
  if (!ws) return;
  const p = pds.personal;
  const f = pds.family;
  const ra = p.residentialAddress || {};
  const pa = p.permanentAddress || {};

  set(ws, 'D10', na(p.surname));
  set(ws, 'D11', na(p.firstName));
  set(ws, 'L12', raw(p.nameExtension) || 'N/A');
  set(ws, 'D12', na(p.middleName));
  set(ws, 'D13', na(dmy(p.birthDate)));
  // Sex / civil status / citizenship use form checkboxes (post-process), not cell text.
  set(ws, 'D15', na(p.placeOfBirth));
  if (p.dualCitizenship) {
    set(ws, 'L16', na(p.dualCitizenshipCountry));
  } else {
    set(ws, 'L16', 'N/A');
  }
  if (String(p.civilStatus || '').toLowerCase() === 'other' && raw(p.civilStatusOther)) {
    set(ws, 'F19', raw(p.civilStatusOther));
  }

  set(ws, 'D22', na(p.heightM));
  set(ws, 'D24', na(p.weightKg));
  set(ws, 'D25', na(p.bloodType));
  set(ws, 'D27', na(p.gsisUmidNo));
  set(ws, 'D29', na(p.pagibigNo));
  set(ws, 'D31', na(p.philhealthNo));
  set(ws, 'D32', na(p.philsysNo));
  set(ws, 'D33', na(p.tinNo));
  set(ws, 'D34', na(p.agencyEmployeeNo || employee?.employeeNo));

  set(ws, 'I19', na(ra.houseBlockLot));
  set(ws, 'L19', na(ra.street));
  set(ws, 'I22', na(ra.subdivision));
  set(ws, 'L22', na(ra.barangay));
  set(ws, 'I23', na(ra.cityMunicipality));
  set(ws, 'L23', na(ra.province));
  set(ws, 'I24', na(ra.zipCode));

  set(ws, 'I27', na(pa.houseBlockLot));
  set(ws, 'L27', na(pa.street));
  set(ws, 'I28', na(pa.subdivision));
  set(ws, 'L28', na(pa.barangay));
  set(ws, 'I30', na(pa.cityMunicipality));
  set(ws, 'L30', na(pa.province));
  set(ws, 'I31', na(pa.zipCode));

  set(ws, 'I32', na(p.telephoneNo));
  set(ws, 'I33', na(p.mobileNo));
  set(ws, 'I34', na(p.email));

  // Spouse
  set(ws, 'D36', na(f.spouse?.surname));
  set(ws, 'D37', na(f.spouse?.firstName));
  set(ws, 'D38', na(f.spouse?.middleName));
  set(ws, 'D39', na(f.spouse?.occupation));
  set(ws, 'D40', na(f.spouse?.employer));
  set(ws, 'D41', na(f.spouse?.businessAddress));
  set(ws, 'D42', na(f.spouse?.telephoneNo));

  // Father
  set(ws, 'D43', na(f.father?.surname));
  set(ws, 'D44', na(f.father?.firstName));
  set(ws, 'D45', na(f.father?.middleName));

  // Mother maiden
  set(ws, 'D47', na(f.mother?.surname));
  set(ws, 'D48', na(f.mother?.firstName));
  set(ws, 'D49', na(f.mother?.middleName));

  // Children rows 37–48
  const children = Array.isArray(f.children) ? f.children : [];
  for (let i = 0; i < 12; i++) {
    const row = 37 + i;
    const child = children[i];
    if (!child) continue;
    set(ws, `I${row}`, raw(child.name));
    set(ws, `M${row}`, dmy(child.dateOfBirth));
  }

  // Education fixed levels 54–58
  const levels = [
    { row: 54, key: 'elementary' },
    { row: 55, key: 'secondary' },
    { row: 56, key: 'vocational' },
    { row: 57, key: 'college' },
    { row: 58, key: 'graduate' },
  ];
  for (const { row, key } of levels) {
    const edu = findEducation(pds.education, key);
    if (!edu) {
      set(ws, `D${row}`, 'N/A');
      set(ws, `G${row}`, 'N/A');
      set(ws, `J${row}`, 'N/A');
      set(ws, `K${row}`, 'N/A');
      set(ws, `L${row}`, 'N/A');
      set(ws, `M${row}`, 'N/A');
      set(ws, `N${row}`, 'N/A');
      continue;
    }
    set(ws, `D${row}`, na(edu.schoolName));
    set(ws, `G${row}`, na(edu.degreeCourse));
    set(ws, `J${row}`, na(edu.periodFrom));
    set(ws, `K${row}`, na(edu.periodTo));
    set(ws, `L${row}`, na(edu.highestLevel));
    set(ws, `M${row}`, na(edu.yearGraduated));
    set(ws, `N${row}`, na(edu.honors));
  }
}

function fillC2(wb, ws, pds) {
  if (!ws) return;
  const elig = Array.isArray(pds.eligibility) ? pds.eligibility : [];
  for (let i = 0; i < Math.min(elig.length, 7); i++) {
    const r = 5 + i;
    const e = elig[i];
    C2_ELIGIBILITY_CONT.fillRow(ws, r, e);
  }
  if (!elig.length) {
    set(ws, 'B5', 'N/A');
    set(ws, 'F5', 'N/A');
    set(ws, 'G5', 'N/A');
    set(ws, 'I5', 'N/A');
    set(ws, 'J5', 'N/A');
    set(ws, 'K5', 'N/A');
  }
  addContinuationSheets(wb, C2_ELIGIBILITY_CONT, elig.slice(7));

  const work = Array.isArray(pds.workExperience) ? pds.workExperience : [];
  // CS Form 212 (Revised 2025) C2 work block has no Monthly Salary / Salary Grade columns
  // (only dates, position, agency, appointment status, gov't Y/N). PDS monthlySalary /
  // salaryGrade are kept for the app UI / HTML preview only.
  for (let i = 0; i < Math.min(work.length, 28); i++) {
    const r = 18 + i;
    const w = work[i];
    C2_WORK_CONT.fillRow(ws, r, w);
  }
  if (!work.length) {
    set(ws, 'A18', 'N/A');
    set(ws, 'C18', 'N/A');
    set(ws, 'D18', 'N/A');
    set(ws, 'G18', 'N/A');
    set(ws, 'J18', 'N/A');
    set(ws, 'K18', 'N/A');
  }
  addContinuationSheets(wb, C2_WORK_CONT, work.slice(28));
}

function fillC3(wb, ws, pds) {
  if (!ws) return;
  const vol = Array.isArray(pds.voluntaryWork) ? pds.voluntaryWork : [];
  for (let i = 0; i < Math.min(vol.length, 7); i++) {
    const r = 6 + i;
    C3_VOLUNTARY_CONT.fillRow(ws, r, vol[i]);
  }
  if (!vol.length) {
    set(ws, 'B6', 'N/A');
    set(ws, 'E6', 'N/A');
    set(ws, 'F6', 'N/A');
    set(ws, 'G6', 'N/A');
    set(ws, 'H6', 'N/A');
  }
  addContinuationSheets(wb, C3_VOLUNTARY_CONT, vol.slice(7));

  const ld = Array.isArray(pds.learningDevelopment) ? pds.learningDevelopment : [];
  for (let i = 0; i < Math.min(ld.length, 21); i++) {
    const r = 18 + i;
    C3_LD_CONT.fillRow(ws, r, ld[i]);
  }
  if (!ld.length) {
    set(ws, 'B18', 'N/A');
    set(ws, 'E18', 'N/A');
    set(ws, 'F18', 'N/A');
    set(ws, 'G18', 'N/A');
    set(ws, 'H18', 'N/A');
    set(ws, 'I18', 'N/A');
  }
  addContinuationSheets(wb, C3_LD_CONT, ld.slice(21));

  const o = pds.otherInfo || {};
  const skills = (o.skills || []).join('\n') || 'N/A';
  const recognitions = (o.recognitions || []).join('\n') || 'N/A';
  const memberships = (o.memberships || []).join('\n') || 'N/A';
  set(ws, 'B42', skills);
  set(ws, 'D42', recognitions);
  set(ws, 'J42', memberships);
}

function fillC4(ws, pds) {
  if (!ws) return;
  const o = pds.otherInfo || {};

  /** Keep printed label, append user details. Yes/No use form checkboxes (post-process). */
  function setDetails(addr, labelPrefix, details) {
    const d = raw(details);
    if (!d) return;
    set(ws, addr, `${labelPrefix} ${d}`);
  }

  const q34 = o.q34 || {};
  setDetails('G10', 'If YES, give details:', q34.details);

  const q35 = o.q35 || {};
  setDetails('G14', 'If YES, give details:', q35.a?.details);
  setDetails('G19', 'If YES, give details:', q35.b?.details);
  if (q35.b?.dateFiled) set(ws, 'J20', dmy(q35.b.dateFiled));
  if (q35.b?.status) set(ws, 'J21', raw(q35.b.status));

  const q36 = o.q36 || {};
  setDetails('G24', 'If YES, give details:', q36.details);

  const q37 = o.q37 || {};
  setDetails('G28', 'If YES, give details:', q37.details);

  const q38 = o.q38 || {};
  setDetails('G32', 'If YES, give details:', q38.a?.details);
  setDetails('G35', 'If YES, give details:', q38.b?.details);

  const q39 = o.q39 || {};
  setDetails('G38', 'If YES, give details (country):', q39.details);

  const q40 = o.q40 || {};
  setDetails('G44', 'If YES, please specify:', q40.a?.details);
  setDetails('G46', 'If YES, please specify ID No:', q40.b?.details);
  setDetails('G48', 'If YES, please specify ID No:', q40.c?.details);

  const refs = Array.isArray(o.references) ? o.references : [];
  for (let i = 0; i < Math.min(refs.length, 3); i++) {
    const r = 52 + i;
    const ref = refs[i] || {};
    set(ws, `A${r}`, raw(ref.name));
    set(ws, `F${r}`, raw(ref.address));
    set(ws, `G${r}`, raw(ref.telephoneNo));
  }

  const decl = o.declaration || {};
  set(ws, 'D61', raw(decl.governmentIssuedId));
  set(ws, 'D62', raw(decl.idNumber));
  set(ws, 'D64', raw(decl.datePlaceOfIssuance));
  if (decl.dateAccomplished) set(ws, 'J65', dmy(decl.dateAccomplished));
}

export function pdsDownloadFilename(employee) {
  const surname = String(employee?.lastName || employee?.pds?.personal?.surname || 'Employee')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 40);
  const first = String(employee?.firstName || employee?.pds?.personal?.firstName || '')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 20);
  return `PDS_${surname}_${first || 'X'}_CS212.xlsx`;
}
