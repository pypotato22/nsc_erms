import { HttpError } from '../middleware/errors.js';

function str(value) {
  if (value == null) return '';
  return String(value).trim();
}

function strOrNull(value) {
  const s = str(value);
  return s || null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function emptyPersonName() {
  return {
    surname: '',
    firstName: '',
    middleName: '',
    nameExtension: '',
  };
}

function emptyAddress() {
  return {
    houseBlockLot: '',
    street: '',
    subdivision: '',
    barangay: '',
    cityMunicipality: '',
    province: '',
    zipCode: '',
  };
}

function normalizeAddress(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  return {
    houseBlockLot: str(a.houseBlockLot),
    street: str(a.street),
    subdivision: str(a.subdivision),
    barangay: str(a.barangay),
    cityMunicipality: str(a.cityMunicipality),
    province: str(a.province),
    zipCode: str(a.zipCode),
  };
}

function normalizePersonName(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  return {
    surname: str(p.surname),
    firstName: str(p.firstName),
    middleName: str(p.middleName),
    nameExtension: str(p.nameExtension),
  };
}

function rowHasContent(obj) {
  return Object.values(obj).some((v) => {
    if (typeof v === 'boolean') return v;
    return str(v) !== '';
  });
}

function formatAddress(addr) {
  const a = normalizeAddress(addr);
  return [
    a.houseBlockLot,
    a.street,
    a.subdivision,
    a.barangay,
    a.cityMunicipality,
    a.province,
    a.zipCode,
  ]
    .filter(Boolean)
    .join(', ');
}

export function emptyPds() {
  return {
    version: 2025,
    personal: {
      surname: '',
      firstName: '',
      middleName: '',
      nameExtension: '',
      birthDate: '',
      placeOfBirth: '',
      sex: '',
      civilStatus: '',
      civilStatusOther: '',
      heightM: '',
      weightKg: '',
      bloodType: '',
      gsisUmidNo: '',
      pagibigNo: '',
      philhealthNo: '',
      philsysNo: '',
      tinNo: '',
      agencyEmployeeNo: '',
      citizenship: 'Filipino',
      dualCitizenship: false,
      dualCitizenshipType: '',
      dualCitizenshipCountry: '',
      residentialAddress: emptyAddress(),
      permanentAddress: emptyAddress(),
      sameAsResidential: false,
      telephoneNo: '',
      mobileNo: '',
      email: '',
    },
    family: {
      spouse: {
        ...emptyPersonName(),
        occupation: '',
        employer: '',
        businessAddress: '',
        telephoneNo: '',
      },
      father: emptyPersonName(),
      mother: emptyPersonName(),
      children: [],
    },
    education: [],
    eligibility: [],
    workExperience: [],
    voluntaryWork: [],
    learningDevelopment: [],
    otherInfo: {
      skills: [],
      recognitions: [],
      memberships: [],
      q34: { answer: '', details: '' },
      q35: { answer: '', details: '' },
      q36: { answer: '', details: '' },
      q37: { answer: '', details: '' },
      q38: { answer: '', details: '' },
      q39: { answer: '', details: '', dateFiled: '', status: '' },
      q40: { answer: '', details: '' },
      references: [
        { name: '', address: '', telephoneNo: '' },
        { name: '', address: '', telephoneNo: '' },
        { name: '', address: '', telephoneNo: '' },
      ],
    },
  };
}

/**
 * Normalize client PDS payload into the canonical shape and strip empty rows.
 * @param {unknown} raw
 */
export function normalizePds(raw) {
  const base = emptyPds();
  const src = raw && typeof raw === 'object' ? raw : {};
  const personalIn = src.personal && typeof src.personal === 'object' ? src.personal : {};
  const familyIn = src.family && typeof src.family === 'object' ? src.family : {};
  const otherIn = src.otherInfo && typeof src.otherInfo === 'object' ? src.otherInfo : {};

  const personal = {
    surname: str(personalIn.surname),
    firstName: str(personalIn.firstName),
    middleName: str(personalIn.middleName),
    nameExtension: str(personalIn.nameExtension),
    birthDate: str(personalIn.birthDate),
    placeOfBirth: str(personalIn.placeOfBirth),
    sex: str(personalIn.sex),
    civilStatus: str(personalIn.civilStatus),
    civilStatusOther: str(personalIn.civilStatusOther),
    heightM: str(personalIn.heightM),
    weightKg: str(personalIn.weightKg),
    bloodType: str(personalIn.bloodType),
    gsisUmidNo: str(personalIn.gsisUmidNo),
    pagibigNo: str(personalIn.pagibigNo),
    philhealthNo: str(personalIn.philhealthNo),
    philsysNo: str(personalIn.philsysNo),
    tinNo: str(personalIn.tinNo),
    agencyEmployeeNo: str(personalIn.agencyEmployeeNo),
    citizenship: str(personalIn.citizenship) || 'Filipino',
    dualCitizenship: Boolean(personalIn.dualCitizenship),
    dualCitizenshipType: str(personalIn.dualCitizenshipType),
    dualCitizenshipCountry: str(personalIn.dualCitizenshipCountry),
    residentialAddress: normalizeAddress(personalIn.residentialAddress),
    permanentAddress: normalizeAddress(personalIn.permanentAddress),
    sameAsResidential: Boolean(personalIn.sameAsResidential),
    telephoneNo: str(personalIn.telephoneNo),
    mobileNo: str(personalIn.mobileNo),
    email: str(personalIn.email),
  };

  if (personal.sameAsResidential) {
    personal.permanentAddress = { ...personal.residentialAddress };
  }

  const spouseIn = familyIn.spouse && typeof familyIn.spouse === 'object' ? familyIn.spouse : {};
  const family = {
    spouse: {
      ...normalizePersonName(spouseIn),
      occupation: str(spouseIn.occupation),
      employer: str(spouseIn.employer),
      businessAddress: str(spouseIn.businessAddress),
      telephoneNo: str(spouseIn.telephoneNo),
    },
    father: normalizePersonName(familyIn.father),
    mother: normalizePersonName(familyIn.mother),
    children: asArray(familyIn.children)
      .map((c) => ({
        name: str(c?.name),
        dateOfBirth: str(c?.dateOfBirth),
      }))
      .filter(rowHasContent),
  };

  const education = asArray(src.education)
    .map((r) => ({
      level: str(r?.level),
      schoolName: str(r?.schoolName),
      degreeCourse: str(r?.degreeCourse),
      periodFrom: str(r?.periodFrom),
      periodTo: str(r?.periodTo),
      highestLevel: str(r?.highestLevel),
      yearGraduated: str(r?.yearGraduated),
      honors: str(r?.honors),
    }))
    .filter(rowHasContent);

  const eligibility = asArray(src.eligibility)
    .map((r) => ({
      careerService: str(r?.careerService),
      rating: str(r?.rating),
      examDate: str(r?.examDate),
      examPlace: str(r?.examPlace),
      licenseNumber: str(r?.licenseNumber),
      licenseValidity: str(r?.licenseValidity),
    }))
    .filter(rowHasContent);

  const workExperience = asArray(src.workExperience)
    .map((r) => ({
      from: str(r?.from),
      to: str(r?.to),
      positionTitle: str(r?.positionTitle),
      departmentAgency: str(r?.departmentAgency),
      monthlySalary: str(r?.monthlySalary),
      salaryGrade: str(r?.salaryGrade),
      statusOfAppointment: str(r?.statusOfAppointment),
      govService: Boolean(r?.govService),
    }))
    .filter(rowHasContent);

  const voluntaryWork = asArray(src.voluntaryWork)
    .map((r) => ({
      orgName: str(r?.orgName),
      orgAddress: str(r?.orgAddress),
      from: str(r?.from),
      to: str(r?.to),
      hours: str(r?.hours),
      positionNature: str(r?.positionNature),
    }))
    .filter(rowHasContent);

  const learningDevelopment = asArray(src.learningDevelopment)
    .map((r) => ({
      title: str(r?.title),
      from: str(r?.from),
      to: str(r?.to),
      hours: str(r?.hours),
      type: str(r?.type),
      conductedBy: str(r?.conductedBy),
    }))
    .filter(rowHasContent);

  const q = (key) => {
    const item = otherIn[key] && typeof otherIn[key] === 'object' ? otherIn[key] : {};
    return {
      answer: str(item.answer),
      details: str(item.details),
      ...(key === 'q39'
        ? { dateFiled: str(item.dateFiled), status: str(item.status) }
        : {}),
    };
  };

  const listStrings = (value) =>
    asArray(value)
      .map((v) => str(v))
      .filter(Boolean);

  const references = asArray(otherIn.references)
    .map((r) => ({
      name: str(r?.name),
      address: str(r?.address),
      telephoneNo: str(r?.telephoneNo),
    }))
    .filter(rowHasContent);

  while (references.length < 3) {
    references.push({ name: '', address: '', telephoneNo: '' });
  }

  return {
    version: 2025,
    personal,
    family,
    education,
    eligibility,
    workExperience,
    voluntaryWork,
    learningDevelopment,
    otherInfo: {
      skills: listStrings(otherIn.skills),
      recognitions: listStrings(otherIn.recognitions),
      memberships: listStrings(otherIn.memberships),
      q34: q('q34'),
      q35: q('q35'),
      q36: q('q36'),
      q37: q('q37'),
      q38: q('q38'),
      q39: q('q39'),
      q40: q('q40'),
      references: references.slice(0, 3),
    },
  };
}

/**
 * Validate PDS names required for create/update.
 * @param {ReturnType<typeof normalizePds>} pds
 */
export function assertPdsIdentity(pds) {
  if (!pds.personal.firstName || !pds.personal.surname) {
    throw new HttpError(400, 'Surname and first name are required', 'VALIDATION');
  }
  const sex = pds.personal.sex;
  if (sex && !['male', 'female', 'other'].includes(sex)) {
    throw new HttpError(400, 'Invalid sex value', 'VALIDATION');
  }
}

/**
 * Map PDS personal section onto employees table columns.
 * @param {ReturnType<typeof normalizePds>} pds
 * @param {{ employeeNo?: string|null }} [overrides]
 */
export function syncEmployeeColumnsFromPds(pds, overrides = {}) {
  const p = pds.personal;
  const employeeNoFromPds = strOrNull(p.agencyEmployeeNo);
  const employeeNoOverride =
    overrides.employeeNo === undefined
      ? undefined
      : overrides.employeeNo == null || String(overrides.employeeNo).trim() === ''
        ? null
        : String(overrides.employeeNo).trim();

  let sex = strOrNull(p.sex);
  if (sex && !['male', 'female', 'other'].includes(sex)) sex = null;

  return {
    firstName: p.firstName,
    lastName: p.surname,
    middleName: p.middleName,
    nameExtension: p.nameExtension,
    birthDate: strOrNull(p.birthDate),
    sex,
    email: p.email,
    contactNumber: p.mobileNo || p.telephoneNo,
    address: formatAddress(p.residentialAddress),
    employeeNo: employeeNoOverride !== undefined ? employeeNoOverride : employeeNoFromPds,
  };
}

/**
 * Merge legacy employee row fields into empty PDS when pds is missing/empty.
 * @param {object|null} pds
 * @param {object} row
 */
export function coercePdsFromRow(pds, row) {
  const hasPersonal =
    pds &&
    typeof pds === 'object' &&
    pds.personal &&
    (pds.personal.firstName || pds.personal.surname);
  if (hasPersonal) return normalizePds(pds);

  const empty = emptyPds();
  empty.personal.surname = str(row?.last_name);
  empty.personal.firstName = str(row?.first_name);
  empty.personal.middleName = str(row?.middle_name);
  empty.personal.nameExtension = str(row?.name_extension);
  empty.personal.email = str(row?.email);
  empty.personal.mobileNo = str(row?.contact_number);
  empty.personal.agencyEmployeeNo = str(row?.employee_no);
  empty.personal.birthDate = row?.birth_date ? String(row.birth_date).slice(0, 10) : '';
  empty.personal.sex = str(row?.sex);
  if (row?.address) {
    empty.personal.residentialAddress.street = str(row.address);
  }
  return empty;
}
