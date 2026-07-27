/** Client-side empty CS Form 212 (Revised 2025) PDS structure. */

export function emptyAddress() {
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

export function emptyPersonName() {
  return {
    surname: '',
    firstName: '',
    middleName: '',
    nameExtension: '',
  };
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
      q34: {
        a: { answer: '' },
        b: { answer: '' },
        details: '',
      },
      q35: {
        a: { answer: '', details: '' },
        b: { answer: '', details: '', dateFiled: '', status: '' },
      },
      q36: { answer: '', details: '' },
      q37: { answer: '', details: '' },
      q38: {
        a: { answer: '', details: '' },
        b: { answer: '', details: '' },
      },
      q39: { answer: '', details: '' },
      q40: {
        a: { answer: '', details: '' },
        b: { answer: '', details: '' },
        c: { answer: '', details: '' },
      },
      references: [
        { name: '', address: '', telephoneNo: '' },
        { name: '', address: '', telephoneNo: '' },
        { name: '', address: '', telephoneNo: '' },
      ],
      declaration: {
        governmentIssuedId: '',
        idNumber: '',
        datePlaceOfIssuance: '',
        dateAccomplished: '',
      },
    },
  };
}

export function clonePds(pds) {
  return upgradeLegacyQuestions(JSON.parse(JSON.stringify(pds || emptyPds())));
}

/** Convert flat q34–q40 (pre-alignment) into Rev. 2025 lettered shape. */
export function upgradeLegacyQuestions(pds) {
  const out = pds && typeof pds === 'object' ? pds : emptyPds();
  if (!out.otherInfo || typeof out.otherInfo !== 'object') {
    out.otherInfo = emptyPds().otherInfo;
    return out;
  }
  const o = out.otherInfo;
  const isLegacy = (q) => q && typeof q === 'object' && 'answer' in q && !('a' in q);
  if (!isLegacy(o.q34) && !isLegacy(o.q35)) {
    // Ensure nested defaults exist
    const blank = emptyPds().otherInfo;
    out.otherInfo = {
      ...blank,
      ...o,
      q34: { ...blank.q34, ...(o.q34 || {}), a: { ...blank.q34.a, ...(o.q34?.a || {}) }, b: { ...blank.q34.b, ...(o.q34?.b || {}) } },
      q35: {
        ...blank.q35,
        ...(o.q35 || {}),
        a: { ...blank.q35.a, ...(o.q35?.a || {}) },
        b: { ...blank.q35.b, ...(o.q35?.b || {}) },
      },
      q36: { ...blank.q36, ...(o.q36 || {}) },
      q37: { ...blank.q37, ...(o.q37 || {}) },
      q38: {
        ...blank.q38,
        ...(o.q38 || {}),
        a: { ...blank.q38.a, ...(o.q38?.a || {}) },
        b: { ...blank.q38.b, ...(o.q38?.b || {}) },
      },
      q39: { ...blank.q39, ...(o.q39 || {}) },
      q40: {
        ...blank.q40,
        ...(o.q40 || {}),
        a: { ...blank.q40.a, ...(o.q40?.a || {}) },
        b: { ...blank.q40.b, ...(o.q40?.b || {}) },
        c: { ...blank.q40.c, ...(o.q40?.c || {}) },
      },
      references: Array.isArray(o.references) ? o.references : blank.references,
      declaration: { ...blank.declaration, ...(o.declaration || {}) },
    };
    return out;
  }

  out.otherInfo = {
    ...o,
    q34: {
      a: { answer: o.q34?.answer || '' },
      b: { answer: '' },
      details: o.q34?.details || '',
    },
    q35: {
      a: { answer: o.q35?.answer || '', details: o.q35?.details || '' },
      b: {
        answer: o.q36?.answer || '',
        details: o.q36?.details || '',
        dateFiled: o.q39?.dateFiled || o.q36?.dateFiled || '',
        status: o.q39?.status || o.q36?.status || '',
      },
    },
    q36: { answer: o.q37?.answer || '', details: o.q37?.details || '' },
    q37: { answer: o.q38?.answer || '', details: o.q38?.details || '' },
    q38: {
      a: { answer: o.q39?.answer || '', details: o.q39?.details || '' },
      b: { answer: '', details: '' },
    },
    q39: { answer: o.q40?.answer || '', details: o.q40?.details || '' },
    q40: emptyPds().otherInfo.q40,
  };
  return out;
}

export const EDUCATION_LEVELS = [
  'Elementary',
  'Secondary',
  'Vocational / Trade Course',
  'College',
  'Graduate Studies',
];

export const WIZARD_STEPS = [
  { id: 1, key: 'personal', title: 'I. Personal Information', short: 'Personal' },
  { id: 2, key: 'family', title: 'II. Family Background', short: 'Family' },
  { id: 3, key: 'education', title: 'III. Educational Background', short: 'Education' },
  { id: 4, key: 'eligibility', title: 'IV. Civil Service Eligibility', short: 'Eligibility' },
  { id: 5, key: 'work', title: 'V. Work Experience', short: 'Work' },
  { id: 6, key: 'voluntary', title: 'VI. Voluntary Work', short: 'Voluntary' },
  { id: 7, key: 'learning', title: 'VII. Learning & Development', short: 'L&D' },
  { id: 8, key: 'other', title: 'VIII. Other Information', short: 'Other' },
  { id: 9, key: 'assignment', title: 'NSC Assignment', short: 'Assignment' },
];
