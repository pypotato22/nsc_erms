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

export function clonePds(pds) {
  return JSON.parse(JSON.stringify(pds || emptyPds()));
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
