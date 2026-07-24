import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { coercePdsFromRow, normalizePds } from './pds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');
export const PDS_TEMPLATE_PATH = path.join(
  projectRoot,
  'assets/forms/CS-Form-212-Revised-2025.xlsx',
);

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

function sexLabel(sex) {
  const s = String(sex || '').toLowerCase();
  if (s === 'male') return 'Male';
  if (s === 'female') return 'Female';
  return raw(sex);
}

function yesNo(answer) {
  const a = String(answer || '').trim().toLowerCase();
  if (a === 'yes' || a === 'true' || a === 'y') return 'Yes';
  if (a === 'no' || a === 'false' || a === 'n') return 'No';
  return '';
}

function findEducation(list, levelNeedle) {
  const needle = levelNeedle.toLowerCase();
  return (list || []).find((r) => String(r.level || '').toLowerCase().includes(needle)) || null;
}

/**
 * Fill official CS Form 212 (Revised 2025) Excel from employee + pds.
 * @param {{ pds?: object, employeeNo?: string, firstName?: string, lastName?: string, email?: string, contactNumber?: string }} employee
 * @returns {Promise<Buffer>}
 */
export async function buildFilledPdsWorkbook(employee) {
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
  fillC2(wb.getWorksheet('C2'), pds);
  fillC3(wb.getWorksheet('C3'), pds);
  fillC4(wb.getWorksheet('C4'), pds);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
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
  set(ws, 'J13', na(p.citizenship));
  set(ws, 'D15', na(p.placeOfBirth));
  if (p.dualCitizenship) {
    set(ws, 'J15', na(p.dualCitizenshipType || 'Yes'));
    set(ws, 'L16', na(p.dualCitizenshipCountry));
  } else {
    set(ws, 'J15', 'N/A');
    set(ws, 'L16', 'N/A');
  }
  set(ws, 'D16', na(sexLabel(p.sex)));
  set(ws, 'D17', na(p.civilStatus === 'Other' ? p.civilStatusOther || 'Other' : p.civilStatus));

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

function fillC2(ws, pds) {
  if (!ws) return;
  const elig = Array.isArray(pds.eligibility) ? pds.eligibility : [];
  for (let i = 0; i < Math.min(elig.length, 7); i++) {
    const r = 5 + i;
    const e = elig[i];
    set(ws, `B${r}`, raw(e.careerService));
    set(ws, `F${r}`, raw(e.rating));
    set(ws, `G${r}`, dmy(e.examDate));
    set(ws, `I${r}`, raw(e.examPlace));
    set(ws, `J${r}`, raw(e.licenseNumber));
    set(ws, `K${r}`, dmy(e.licenseValidity));
  }
  if (!elig.length) {
    set(ws, 'B5', 'N/A');
    set(ws, 'F5', 'N/A');
    set(ws, 'G5', 'N/A');
    set(ws, 'I5', 'N/A');
    set(ws, 'J5', 'N/A');
    set(ws, 'K5', 'N/A');
  }

  const work = Array.isArray(pds.workExperience) ? pds.workExperience : [];
  for (let i = 0; i < Math.min(work.length, 28); i++) {
    const r = 18 + i;
    const w = work[i];
    set(ws, `A${r}`, dmy(w.from));
    set(ws, `C${r}`, dmy(w.to));
    set(ws, `D${r}`, raw(w.positionTitle));
    set(ws, `G${r}`, raw(w.departmentAgency));
    set(ws, `J${r}`, raw(w.statusOfAppointment));
    set(ws, `K${r}`, w.govService ? 'Y' : raw(w.govService) === '' ? '' : 'N');
  }
  if (!work.length) {
    set(ws, 'A18', 'N/A');
    set(ws, 'C18', 'N/A');
    set(ws, 'D18', 'N/A');
    set(ws, 'G18', 'N/A');
    set(ws, 'J18', 'N/A');
    set(ws, 'K18', 'N/A');
  }
}

function fillC3(ws, pds) {
  if (!ws) return;
  const vol = Array.isArray(pds.voluntaryWork) ? pds.voluntaryWork : [];
  for (let i = 0; i < Math.min(vol.length, 7); i++) {
    const r = 6 + i;
    const v = vol[i];
    const org = [v.orgName, v.orgAddress].filter(Boolean).join(' — ');
    set(ws, `B${r}`, raw(org));
    set(ws, `E${r}`, dmy(v.from));
    set(ws, `F${r}`, dmy(v.to));
    set(ws, `G${r}`, raw(v.hours));
    set(ws, `H${r}`, raw(v.positionNature));
  }
  if (!vol.length) {
    set(ws, 'B6', 'N/A');
    set(ws, 'E6', 'N/A');
    set(ws, 'F6', 'N/A');
    set(ws, 'G6', 'N/A');
    set(ws, 'H6', 'N/A');
  }

  const ld = Array.isArray(pds.learningDevelopment) ? pds.learningDevelopment : [];
  for (let i = 0; i < Math.min(ld.length, 21); i++) {
    const r = 18 + i;
    const row = ld[i];
    set(ws, `B${r}`, raw(row.title));
    set(ws, `E${r}`, dmy(row.from));
    set(ws, `F${r}`, dmy(row.to));
    set(ws, `G${r}`, raw(row.hours));
    set(ws, `H${r}`, raw(row.type));
    set(ws, `I${r}`, raw(row.conductedBy));
  }
  if (!ld.length) {
    set(ws, 'B18', 'N/A');
    set(ws, 'E18', 'N/A');
    set(ws, 'F18', 'N/A');
    set(ws, 'G18', 'N/A');
    set(ws, 'H18', 'N/A');
    set(ws, 'I18', 'N/A');
  }

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

  // Best-effort Yes/No + details against 2025 layout (sub-questions simplified).
  const mapQ = [
    { key: 'q34', yesCell: 'G6', detailsCell: 'G11' },
    { key: 'q35', yesCell: 'G13', detailsCell: 'G14' },
    { key: 'q36', yesCell: 'G18', detailsCell: 'G19', dateCell: 'J20', statusCell: 'J21' },
    { key: 'q37', yesCell: 'G23', detailsCell: 'G24' },
    { key: 'q38', yesCell: 'G27', detailsCell: 'G28' },
    { key: 'q39', yesCell: 'G31', detailsCell: 'G32' },
    { key: 'q40', yesCell: 'G37', detailsCell: 'G38' },
  ];

  for (const m of mapQ) {
    const q = o[m.key] || {};
    const yn = yesNo(q.answer);
    if (yn) set(ws, m.yesCell, yn);
    if (q.details) set(ws, m.detailsCell, raw(q.details));
    if (m.dateCell && q.dateFiled) set(ws, m.dateCell, dmy(q.dateFiled));
    if (m.statusCell && q.status) set(ws, m.statusCell, raw(q.status));
  }

  const refs = Array.isArray(o.references) ? o.references : [];
  for (let i = 0; i < Math.min(refs.length, 3); i++) {
    const r = 52 + i;
    const ref = refs[i] || {};
    set(ws, `A${r}`, raw(ref.name));
    set(ws, `F${r}`, raw(ref.address));
    set(ws, `G${r}`, raw(ref.telephoneNo));
  }
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
