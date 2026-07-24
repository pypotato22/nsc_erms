import {
  getEmployee,
  createEmployee,
  updateEmployee,
} from '../api/employees.js';
import {
  listDepartments,
  getDepartmentPositions,
  listEmploymentTypes,
  listEmploymentStatuses,
} from '../api/departments.js';
import { uploadEmployeePhoto, employeePhotoUrl } from '../api/documents.js';
import { ApiError } from '../api/client.js';
import { getEl, getInitials, getToday, escapeHtml } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { renderEmployeeTable, refreshFilterDropdowns } from './employeeTable.js';
import {
  emptyPds,
  clonePds,
  emptyAddress,
  emptyPersonName,
  EDUCATION_LEVELS,
  WIZARD_STEPS,
} from '../utils/pds.js';

let _editingEmpId = null;
let _getSearchQuery = () => '';
let _employmentTypes = [];
let _employmentStatuses = [];
let _pendingPhotoFile = null;
let _previewObjectUrl = null;
let _step = 1;
let _pds = emptyPds();
let _assignment = {
  employeeNo: '',
  departmentId: '',
  departmentPositionId: '',
  employmentTypeId: '',
  employmentStatusId: '',
  startDate: '',
};

export function initEmployeeModal(getSearchQuery) {
  _getSearchQuery = getSearchQuery;

  getEl('emp-modal-cancel').addEventListener('click', closeEmployeeModal);
  getEl('close-emp-modal').addEventListener('click', closeEmployeeModal);
  getEl('pds-back').addEventListener('click', () => {
    collectCurrentStep();
    goToStep(_step - 1);
  });
  getEl('pds-next').addEventListener('click', () => {
    collectCurrentStep();
    goToStep(_step + 1);
  });
  getEl('emp-modal-save').addEventListener('click', () => {
    saveEmployee().catch((err) => {
      showToast(err instanceof ApiError ? err.message : 'Save failed.', 'error');
    });
  });
  getEl('add-emp-btn').addEventListener('click', () => openEmployeeModal(null));

  getEl('pds-wizard-body').addEventListener('click', onWizardClick);
  getEl('pds-wizard-body').addEventListener('change', onWizardChange);
  getEl('pds-stepper').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-goto-step]');
    if (!btn) return;
    const target = Number(btn.dataset.gotoStep);
    if (!Number.isFinite(target) || target === _step) return;
    collectCurrentStep();
    goToStep(target);
  });
}

export async function openEmployeeModal(empId = null) {
  _editingEmpId = empId;
  _pendingPhotoFile = null;
  if (_previewObjectUrl) {
    URL.revokeObjectURL(_previewObjectUrl);
    _previewObjectUrl = null;
  }
  _step = 1;
  getEl('emp-modal-title').textContent = empId ? 'Edit Employee' : 'Add Employee';
  getEl('emp-overlay').classList.add('open');

  try {
    await Promise.all([loadDeptOptions(), loadTypeAndStatusOptions()]);
    if (empId) {
      const { employee } = await getEmployee(empId);
      prefillFromEmployee(employee);
    } else {
      _photoEmp = null;
      _pds = emptyPds();
      _assignment = {
        employeeNo: '',
        departmentId: '',
        departmentPositionId: '',
        employmentTypeId: _employmentTypes[0]?.id || '',
        employmentStatusId:
          _employmentStatuses.find((s) => s.name === 'Active')?.id ||
          _employmentStatuses[0]?.id ||
          '',
        startDate: getToday(),
      };
    }
    renderStepper();
    renderStep();
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : 'Could not open form.', 'error');
    closeEmployeeModal();
  }
}

export function closeEmployeeModal() {
  getEl('emp-overlay').classList.remove('open');
  _editingEmpId = null;
  _pendingPhotoFile = null;
  if (_previewObjectUrl) {
    URL.revokeObjectURL(_previewObjectUrl);
    _previewObjectUrl = null;
  }
  _step = 1;
  _pds = emptyPds();
}

function goToStep(step) {
  if (step < 1 || step > WIZARD_STEPS.length) return;
  _step = step;
  renderStepper();
  renderStep();
  getEl('pds-wizard-body').scrollTop = 0;
}

function renderStepper() {
  const nav = getEl('pds-stepper');
  nav.innerHTML = WIZARD_STEPS.map((s) => {
    const active = s.id === _step ? 'active' : '';
    const done = s.id < _step ? 'done' : '';
    return `<button type="button" class="pds-step ${active} ${done}" data-goto-step="${s.id}" title="${escapeAttr(s.title)}">
      <span class="pds-step-num">${s.id}</span>
      <span class="pds-step-label">${escapeHtml(s.short)}</span>
    </button>`;
  }).join('');

  getEl('pds-back').hidden = _step === 1;
  getEl('pds-next').hidden = _step === WIZARD_STEPS.length;
  getEl('emp-modal-save').hidden = _step !== WIZARD_STEPS.length;
}

function renderStep() {
  const body = getEl('pds-wizard-body');
  const meta = WIZARD_STEPS[_step - 1];
  let html = `<div class="pds-section-head"><h4>${escapeHtml(meta.title)}</h4></div>`;
  switch (_step) {
    case 1:
      html += renderPersonalStep();
      break;
    case 2:
      html += renderFamilyStep();
      break;
    case 3:
      html += renderEducationStep();
      break;
    case 4:
      html += renderEligibilityStep();
      break;
    case 5:
      html += renderWorkStep();
      break;
    case 6:
      html += renderVoluntaryStep();
      break;
    case 7:
      html += renderLearningStep();
      break;
    case 8:
      html += renderOtherStep();
      break;
    case 9:
      html += renderAssignmentStep();
      break;
    default:
      break;
  }
  body.innerHTML = html;
  if (_step === 9) {
    loadPositionsForDepartment(_assignment.departmentId, _assignment.departmentPositionId).catch(
      () => resetPositionSelect(),
    );
  }
  const photoImg = body.querySelector('[data-emp-photo]');
  if (photoImg) {
    photoImg.addEventListener('error', () => {
      const initials =
        _photoEmp
          ? getInitials(_photoEmp.firstName, _photoEmp.lastName)
          : getInitials(_pds.personal.firstName, _pds.personal.surname) || '?';
      photoImg.replaceWith(
        Object.assign(document.createElement('div'), {
          id: 'pic-preview',
          className: 'pic-ini',
          textContent: initials,
        }),
      );
    });
  }
}

/* ── Step renderers ───────────────────────────────────────────── */

function renderPersonalStep() {
  const p = _pds.personal;
  return `
    <div class="pic-wrap">
      ${photoPreviewHtml()}
      <label class="pic-lbl needs-write" for="pic-input">Upload Photo</label>
      <input type="file" id="pic-input" accept="image/*" style="display:none" />
    </div>
    <div class="form-grid pds-grid-3">
      <div class="fg"><label>1. Surname *</label><input data-p="surname" type="text" value="${escapeAttr(p.surname)}" /></div>
      <div class="fg"><label>2. First Name *</label><input data-p="firstName" type="text" value="${escapeAttr(p.firstName)}" /></div>
      <div class="fg"><label>Name Extension</label><input data-p="nameExtension" type="text" placeholder="Jr., Sr." value="${escapeAttr(p.nameExtension)}" /></div>
      <div class="fg"><label>Middle Name</label><input data-p="middleName" type="text" value="${escapeAttr(p.middleName)}" /></div>
      <div class="fg"><label>3. Date of Birth</label><input data-p="birthDate" type="date" value="${escapeAttr(p.birthDate)}" /></div>
      <div class="fg"><label>4. Place of Birth</label><input data-p="placeOfBirth" type="text" value="${escapeAttr(p.placeOfBirth)}" /></div>
      <div class="fg"><label>5. Sex at Birth</label>
        <select data-p="sex">
          <option value="">—</option>
          ${opt('male', p.sex, 'Male')}${opt('female', p.sex, 'Female')}${opt('other', p.sex, 'Other')}
        </select>
      </div>
      <div class="fg"><label>6. Civil Status</label>
        <select data-p="civilStatus">
          <option value="">—</option>
          ${['Single', 'Married', 'Widowed', 'Separated', 'Other'].map((c) => opt(c, p.civilStatus, c)).join('')}
        </select>
      </div>
      <div class="fg"><label>Civil Status (if Other)</label><input data-p="civilStatusOther" type="text" value="${escapeAttr(p.civilStatusOther)}" /></div>
      <div class="fg"><label>7. Height (m)</label><input data-p="heightM" type="text" value="${escapeAttr(p.heightM)}" /></div>
      <div class="fg"><label>8. Weight (kg)</label><input data-p="weightKg" type="text" value="${escapeAttr(p.weightKg)}" /></div>
      <div class="fg"><label>9. Blood Type</label><input data-p="bloodType" type="text" value="${escapeAttr(p.bloodType)}" /></div>
      <div class="fg"><label>10. GSIS / UMID ID No.</label><input data-p="gsisUmidNo" type="text" value="${escapeAttr(p.gsisUmidNo)}" /></div>
      <div class="fg"><label>11. Pag-IBIG ID No.</label><input data-p="pagibigNo" type="text" value="${escapeAttr(p.pagibigNo)}" /></div>
      <div class="fg"><label>12. PhilHealth No.</label><input data-p="philhealthNo" type="text" value="${escapeAttr(p.philhealthNo)}" /></div>
      <div class="fg"><label>13. PhilSys Number (PSN)</label><input data-p="philsysNo" type="text" value="${escapeAttr(p.philsysNo)}" /></div>
      <div class="fg"><label>14. TIN No.</label><input data-p="tinNo" type="text" value="${escapeAttr(p.tinNo)}" /></div>
      <div class="fg"><label>15. Agency Employee No.</label><input data-p="agencyEmployeeNo" type="text" value="${escapeAttr(p.agencyEmployeeNo)}" /></div>
    </div>
    <div class="pds-block">
      <h5>16. Citizenship</h5>
      <div class="form-grid pds-grid-3">
        <div class="fg"><label>Citizenship</label><input data-p="citizenship" type="text" value="${escapeAttr(p.citizenship)}" /></div>
        <div class="fg"><label>Dual citizenship?</label>
          <select data-p="dualCitizenship">
            ${opt('false', String(p.dualCitizenship), 'No')}${opt('true', String(p.dualCitizenship), 'Yes')}
          </select>
        </div>
        <div class="fg"><label>If dual — by birth / naturalization</label>
          <select data-p="dualCitizenshipType">
            <option value="">—</option>
            ${opt('by birth', p.dualCitizenshipType, 'By birth')}${opt('by naturalization', p.dualCitizenshipType, 'By naturalization')}
          </select>
        </div>
        <div class="fg"><label>Indicate country</label><input data-p="dualCitizenshipCountry" type="text" value="${escapeAttr(p.dualCitizenshipCountry)}" /></div>
      </div>
    </div>
    ${renderAddressBlock('17. Residential Address', 'residentialAddress', p.residentialAddress)}
    <div class="fg" style="margin:10px 0;">
      <label class="pds-check-label"><input type="checkbox" data-p="sameAsResidential" ${p.sameAsResidential ? 'checked' : ''} /> Permanent address same as residential</label>
    </div>
    ${renderAddressBlock('18. Permanent Address', 'permanentAddress', p.permanentAddress)}
    <div class="form-grid pds-grid-3" style="margin-top:12px;">
      <div class="fg"><label>19. Telephone No.</label><input data-p="telephoneNo" type="text" value="${escapeAttr(p.telephoneNo)}" /></div>
      <div class="fg"><label>20. Mobile No.</label><input data-p="mobileNo" type="text" value="${escapeAttr(p.mobileNo)}" /></div>
      <div class="fg"><label>21. E-mail Address</label><input data-p="email" type="email" value="${escapeAttr(p.email)}" /></div>
    </div>
  `;
}

function renderAddressBlock(title, key, addr) {
  const a = addr || emptyAddress();
  return `
    <div class="pds-block">
      <h5>${escapeHtml(title)}</h5>
      <div class="form-grid pds-grid-3">
        <div class="fg"><label>House/Block/Lot No.</label><input data-addr="${key}" data-af="houseBlockLot" type="text" value="${escapeAttr(a.houseBlockLot)}" /></div>
        <div class="fg"><label>Street</label><input data-addr="${key}" data-af="street" type="text" value="${escapeAttr(a.street)}" /></div>
        <div class="fg"><label>Subdivision/Village</label><input data-addr="${key}" data-af="subdivision" type="text" value="${escapeAttr(a.subdivision)}" /></div>
        <div class="fg"><label>Barangay</label><input data-addr="${key}" data-af="barangay" type="text" value="${escapeAttr(a.barangay)}" /></div>
        <div class="fg"><label>City/Municipality</label><input data-addr="${key}" data-af="cityMunicipality" type="text" value="${escapeAttr(a.cityMunicipality)}" /></div>
        <div class="fg"><label>Province</label><input data-addr="${key}" data-af="province" type="text" value="${escapeAttr(a.province)}" /></div>
        <div class="fg"><label>ZIP Code</label><input data-addr="${key}" data-af="zipCode" type="text" value="${escapeAttr(a.zipCode)}" /></div>
      </div>
    </div>
  `;
}

function renderFamilyStep() {
  const f = _pds.family;
  return `
    <div class="pds-two-col">
      <div>
        <div class="pds-block">
          <h5>22. Spouse's Information</h5>
          ${personNameFields('spouse', f.spouse)}
          <div class="form-grid">
            <div class="fg"><label>Occupation</label><input data-spouse="occupation" type="text" value="${escapeAttr(f.spouse.occupation)}" /></div>
            <div class="fg"><label>Employer/Business Name</label><input data-spouse="employer" type="text" value="${escapeAttr(f.spouse.employer)}" /></div>
            <div class="fg full"><label>Business Address</label><input data-spouse="businessAddress" type="text" value="${escapeAttr(f.spouse.businessAddress)}" /></div>
            <div class="fg"><label>Telephone No.</label><input data-spouse="telephoneNo" type="text" value="${escapeAttr(f.spouse.telephoneNo)}" /></div>
          </div>
        </div>
        <div class="pds-block">
          <h5>24. Father's Name</h5>
          ${personNameFields('father', f.father)}
        </div>
        <div class="pds-block">
          <h5>25. Mother's Maiden Name</h5>
          ${personNameFields('mother', f.mother)}
        </div>
      </div>
      <div class="pds-block">
        <div class="pds-block-head">
          <h5>23. Name of Children</h5>
          <button type="button" class="btn btn-sm needs-write" data-add-child>Add child</button>
        </div>
        <div id="pds-children-list" class="pds-rows">
          ${f.children.map((c, i) => childRow(c, i)).join('') || '<p class="pds-empty">No children listed.</p>'}
        </div>
      </div>
    </div>
  `;
}

function personNameFields(prefix, person) {
  const p = person || emptyPersonName();
  return `
    <div class="form-grid pds-grid-3">
      <div class="fg"><label>Surname</label><input data-${prefix}="surname" type="text" value="${escapeAttr(p.surname)}" /></div>
      <div class="fg"><label>First Name</label><input data-${prefix}="firstName" type="text" value="${escapeAttr(p.firstName)}" /></div>
      <div class="fg"><label>Name Extension</label><input data-${prefix}="nameExtension" type="text" value="${escapeAttr(p.nameExtension)}" /></div>
      <div class="fg"><label>Middle Name</label><input data-${prefix}="middleName" type="text" value="${escapeAttr(p.middleName)}" /></div>
    </div>
  `;
}

function childRow(c, i) {
  return `
    <div class="pds-row" data-child-row="${i}">
      <div class="fg"><label>Full name</label><input data-child="name" data-ci="${i}" type="text" value="${escapeAttr(c.name)}" /></div>
      <div class="fg"><label>Date of birth</label><input data-child="dateOfBirth" data-ci="${i}" type="date" value="${escapeAttr(c.dateOfBirth)}" /></div>
      <button type="button" class="btn btn-sm btn-danger-ghost" data-remove-child="${i}" title="Remove">×</button>
    </div>
  `;
}

function renderEducationStep() {
  const rows = _pds.education.length
    ? _pds.education
    : EDUCATION_LEVELS.map((level) => ({
        level,
        schoolName: '',
        degreeCourse: '',
        periodFrom: '',
        periodTo: '',
        highestLevel: '',
        yearGraduated: '',
        honors: '',
      }));
  if (!_pds.education.length) _pds.education = rows;

  return `
    <div class="pds-block-head">
      <p class="pds-hint">List educational background. Empty rows are ignored on save.</p>
      <button type="button" class="btn btn-sm needs-write" data-add-edu>Add row</button>
    </div>
    <div class="pds-rows" id="pds-edu-list">
      ${_pds.education.map((r, i) => educationRow(r, i)).join('')}
    </div>
  `;
}

function educationRow(r, i) {
  return `
    <div class="pds-card-row" data-edu-row="${i}">
      <div class="form-grid pds-grid-3">
        <div class="fg"><label>Level</label>
          <select data-edu="level" data-ei="${i}">
            <option value="">—</option>
            ${EDUCATION_LEVELS.map((l) => opt(l, r.level, l)).join('')}
          </select>
        </div>
        <div class="fg"><label>Name of School</label><input data-edu="schoolName" data-ei="${i}" type="text" value="${escapeAttr(r.schoolName)}" /></div>
        <div class="fg"><label>Basic Ed. / Degree / Course</label><input data-edu="degreeCourse" data-ei="${i}" type="text" value="${escapeAttr(r.degreeCourse)}" /></div>
        <div class="fg"><label>Period From</label><input data-edu="periodFrom" data-ei="${i}" type="text" placeholder="YYYY" value="${escapeAttr(r.periodFrom)}" /></div>
        <div class="fg"><label>Period To</label><input data-edu="periodTo" data-ei="${i}" type="text" placeholder="YYYY" value="${escapeAttr(r.periodTo)}" /></div>
        <div class="fg"><label>Highest Level / Units Earned</label><input data-edu="highestLevel" data-ei="${i}" type="text" value="${escapeAttr(r.highestLevel)}" /></div>
        <div class="fg"><label>Year Graduated</label><input data-edu="yearGraduated" data-ei="${i}" type="text" value="${escapeAttr(r.yearGraduated)}" /></div>
        <div class="fg"><label>Scholarship / Academic Honors</label><input data-edu="honors" data-ei="${i}" type="text" value="${escapeAttr(r.honors)}" /></div>
      </div>
      <button type="button" class="btn btn-sm btn-danger-ghost" data-remove-edu="${i}">Remove</button>
    </div>
  `;
}

function renderEligibilityStep() {
  return `
    <div class="pds-block-head">
      <p class="pds-hint">Civil service eligibility, board exams, licenses.</p>
      <button type="button" class="btn btn-sm needs-write" data-add-elig>Add row</button>
    </div>
    <div class="pds-rows" id="pds-elig-list">
      ${_pds.eligibility.map((r, i) => eligibilityRow(r, i)).join('') || '<p class="pds-empty">No eligibility entries.</p>'}
    </div>
  `;
}

function eligibilityRow(r, i) {
  return `
    <div class="pds-card-row" data-elig-row="${i}">
      <div class="form-grid pds-grid-3">
        <div class="fg"><label>Career Service / RA / Board</label><input data-elig="careerService" data-li="${i}" type="text" value="${escapeAttr(r.careerService)}" /></div>
        <div class="fg"><label>Rating</label><input data-elig="rating" data-li="${i}" type="text" value="${escapeAttr(r.rating)}" /></div>
        <div class="fg"><label>Date of Examination</label><input data-elig="examDate" data-li="${i}" type="date" value="${escapeAttr(r.examDate)}" /></div>
        <div class="fg"><label>Place of Examination</label><input data-elig="examPlace" data-li="${i}" type="text" value="${escapeAttr(r.examPlace)}" /></div>
        <div class="fg"><label>License Number</label><input data-elig="licenseNumber" data-li="${i}" type="text" value="${escapeAttr(r.licenseNumber)}" /></div>
        <div class="fg"><label>Date of Validity</label><input data-elig="licenseValidity" data-li="${i}" type="date" value="${escapeAttr(r.licenseValidity)}" /></div>
      </div>
      <button type="button" class="btn btn-sm btn-danger-ghost" data-remove-elig="${i}">Remove</button>
    </div>
  `;
}

function renderWorkStep() {
  return `
    <div class="pds-block-head">
      <p class="pds-hint">Include all experience. Start with the most recent.</p>
      <button type="button" class="btn btn-sm needs-write" data-add-work>Add row</button>
    </div>
    <div class="pds-rows" id="pds-work-list">
      ${_pds.workExperience.map((r, i) => workRow(r, i)).join('') || '<p class="pds-empty">No work experience entries.</p>'}
    </div>
  `;
}

function workRow(r, i) {
  return `
    <div class="pds-card-row" data-work-row="${i}">
      <div class="form-grid pds-grid-3">
        <div class="fg"><label>Inclusive dates — From</label><input data-work="from" data-wi="${i}" type="date" value="${escapeAttr(r.from)}" /></div>
        <div class="fg"><label>To</label><input data-work="to" data-wi="${i}" type="date" value="${escapeAttr(r.to)}" /></div>
        <div class="fg"><label>Position Title</label><input data-work="positionTitle" data-wi="${i}" type="text" value="${escapeAttr(r.positionTitle)}" /></div>
        <div class="fg full"><label>Department / Agency / Office / Company</label><input data-work="departmentAgency" data-wi="${i}" type="text" value="${escapeAttr(r.departmentAgency)}" /></div>
        <div class="fg"><label>Monthly Salary</label><input data-work="monthlySalary" data-wi="${i}" type="text" value="${escapeAttr(r.monthlySalary)}" /></div>
        <div class="fg"><label>Salary / Job / Pay Grade</label><input data-work="salaryGrade" data-wi="${i}" type="text" value="${escapeAttr(r.salaryGrade)}" /></div>
        <div class="fg"><label>Status of Appointment</label><input data-work="statusOfAppointment" data-wi="${i}" type="text" value="${escapeAttr(r.statusOfAppointment)}" /></div>
        <div class="fg"><label>Gov't service?</label>
          <select data-work="govService" data-wi="${i}">
            ${opt('false', String(Boolean(r.govService)), 'No')}${opt('true', String(Boolean(r.govService)), 'Yes')}
          </select>
        </div>
      </div>
      <button type="button" class="btn btn-sm btn-danger-ghost" data-remove-work="${i}">Remove</button>
    </div>
  `;
}

function renderVoluntaryStep() {
  return `
    <div class="pds-block-head">
      <p class="pds-hint">Voluntary work or involvement in civic / NGO / people organizations.</p>
      <button type="button" class="btn btn-sm needs-write" data-add-vol>Add row</button>
    </div>
    <div class="pds-rows">
      ${_pds.voluntaryWork.map((r, i) => voluntaryRow(r, i)).join('') || '<p class="pds-empty">No voluntary work entries.</p>'}
    </div>
  `;
}

function voluntaryRow(r, i) {
  return `
    <div class="pds-card-row" data-vol-row="${i}">
      <div class="form-grid pds-grid-3">
        <div class="fg full"><label>Name & address of organization</label><input data-vol="orgName" data-vi="${i}" type="text" value="${escapeAttr(r.orgName)}" /></div>
        <div class="fg full"><label>Address</label><input data-vol="orgAddress" data-vi="${i}" type="text" value="${escapeAttr(r.orgAddress)}" /></div>
        <div class="fg"><label>From</label><input data-vol="from" data-vi="${i}" type="date" value="${escapeAttr(r.from)}" /></div>
        <div class="fg"><label>To</label><input data-vol="to" data-vi="${i}" type="date" value="${escapeAttr(r.to)}" /></div>
        <div class="fg"><label>Number of Hours</label><input data-vol="hours" data-vi="${i}" type="text" value="${escapeAttr(r.hours)}" /></div>
        <div class="fg"><label>Position / Nature of Work</label><input data-vol="positionNature" data-vi="${i}" type="text" value="${escapeAttr(r.positionNature)}" /></div>
      </div>
      <button type="button" class="btn btn-sm btn-danger-ghost" data-remove-vol="${i}">Remove</button>
    </div>
  `;
}

function renderLearningStep() {
  return `
    <div class="pds-block-head">
      <p class="pds-hint">Learning and development interventions / training programs.</p>
      <button type="button" class="btn btn-sm needs-write" data-add-ld>Add row</button>
    </div>
    <div class="pds-rows">
      ${_pds.learningDevelopment.map((r, i) => learningRow(r, i)).join('') || '<p class="pds-empty">No L&amp;D entries.</p>'}
    </div>
  `;
}

function learningRow(r, i) {
  return `
    <div class="pds-card-row" data-ld-row="${i}">
      <div class="form-grid pds-grid-3">
        <div class="fg full"><label>Title of Learning and Development Interventions / Training Programs</label><input data-ld="title" data-ldi="${i}" type="text" value="${escapeAttr(r.title)}" /></div>
        <div class="fg"><label>From</label><input data-ld="from" data-ldi="${i}" type="date" value="${escapeAttr(r.from)}" /></div>
        <div class="fg"><label>To</label><input data-ld="to" data-ldi="${i}" type="date" value="${escapeAttr(r.to)}" /></div>
        <div class="fg"><label>Number of Hours</label><input data-ld="hours" data-ldi="${i}" type="text" value="${escapeAttr(r.hours)}" /></div>
        <div class="fg"><label>Type of L&D</label><input data-ld="type" data-ldi="${i}" type="text" placeholder="Managerial / Supervisory / Technical / etc." value="${escapeAttr(r.type)}" /></div>
        <div class="fg full"><label>Conducted / Sponsored By</label><input data-ld="conductedBy" data-ldi="${i}" type="text" value="${escapeAttr(r.conductedBy)}" /></div>
      </div>
      <button type="button" class="btn btn-sm btn-danger-ghost" data-remove-ld="${i}">Remove</button>
    </div>
  `;
}

function renderOtherStep() {
  const o = _pds.otherInfo;
  return `
    <div class="pds-block">
      <h5>29–31. Skills, Recognitions, Memberships</h5>
      <div class="form-grid">
        <div class="fg full"><label>29. Special Skills and Hobbies (one per line)</label><textarea data-other-list="skills" rows="3">${escapeHtml((o.skills || []).join('\n'))}</textarea></div>
        <div class="fg full"><label>30. Non-Academic Distinctions / Recognition (one per line)</label><textarea data-other-list="recognitions" rows="3">${escapeHtml((o.recognitions || []).join('\n'))}</textarea></div>
        <div class="fg full"><label>31. Membership in Association / Organization (one per line)</label><textarea data-other-list="memberships" rows="3">${escapeHtml((o.memberships || []).join('\n'))}</textarea></div>
      </div>
    </div>
    <div class="pds-block">
      <h5>34–40. Additional Questions</h5>
      ${qBlock('q34', '34. Are you related by consanguinity or affinity to any appointing/recommending authority, or chief of bureau/office, or person who has authority to influence in the office?', o.q34)}
      ${qBlock('q35', '35. Have you ever been found guilty of any administrative offense?', o.q35)}
      ${qBlock('q36', '36. Have you been criminally charged before any court?', o.q36)}
      ${qBlock('q37', '37. Have you ever been convicted of any crime or violation of any law?', o.q37)}
      ${qBlock('q38', '38. Have you ever been separated from the service for cause?', o.q38)}
      ${qBlock('q39', '39. Have you ever been a candidate in a national or local election (except Barangay)?', o.q39, true)}
      ${qBlock('q40', '40. Have you acquired the status of an immigrant or permanent resident of another country?', o.q40)}
    </div>
    <div class="pds-block">
      <h5>References</h5>
      ${(o.references || []).map((r, i) => `
        <div class="form-grid pds-grid-3" style="margin-bottom:10px;">
          <div class="fg"><label>Name</label><input data-ref="name" data-ri="${i}" type="text" value="${escapeAttr(r.name)}" /></div>
          <div class="fg"><label>Address</label><input data-ref="address" data-ri="${i}" type="text" value="${escapeAttr(r.address)}" /></div>
          <div class="fg"><label>Telephone No.</label><input data-ref="telephoneNo" data-ri="${i}" type="text" value="${escapeAttr(r.telephoneNo)}" /></div>
        </div>
      `).join('')}
    </div>
  `;
}

function qBlock(key, label, q, withExtra = false) {
  const item = q || { answer: '', details: '' };
  return `
    <div class="pds-q">
      <p class="pds-q-label">${escapeHtml(label)}</p>
      <div class="form-grid pds-grid-3">
        <div class="fg"><label>Answer</label>
          <select data-q="${key}" data-qf="answer">
            <option value="">—</option>
            ${opt('Yes', item.answer, 'Yes')}${opt('No', item.answer, 'No')}
          </select>
        </div>
        ${
          withExtra
            ? `<div class="fg"><label>Date filed</label><input data-q="${key}" data-qf="dateFiled" type="date" value="${escapeAttr(item.dateFiled || '')}" /></div>
               <div class="fg"><label>Status</label><input data-q="${key}" data-qf="status" type="text" value="${escapeAttr(item.status || '')}" /></div>`
            : ''
        }
        <div class="fg full"><label>If Yes, give details</label><textarea data-q="${key}" data-qf="details" rows="2">${escapeHtml(item.details || '')}</textarea></div>
      </div>
    </div>
  `;
}

function renderAssignmentStep() {
  const a = _assignment;
  return `
    <p class="pds-hint">NSC employment placement for this record (required to save).</p>
    <div class="form-grid">
      <div class="fg"><label>Employee No</label><input id="f-emp-no" type="text" value="${escapeAttr(a.employeeNo || _pds.personal.agencyEmployeeNo)}" /></div>
      <div class="fg"><label>Department *</label><select id="f-dept"><option value="">Select department</option></select></div>
      <div class="fg"><label>Position *</label><select id="f-position" disabled><option value="">Select department first</option></select></div>
      <div class="fg"><label>Employment type *</label><select id="f-emp-type"></select></div>
      <div class="fg"><label>Status *</label><select id="f-status"></select></div>
      <div class="fg"><label>Start Date *</label><input id="f-start" type="date" value="${escapeAttr(a.startDate)}" /></div>
    </div>
  `;
}

/* ── Collect / validate ───────────────────────────────────────── */

function collectCurrentStep() {
  const body = getEl('pds-wizard-body');
  if (_step === 1) {
    body.querySelectorAll('[data-p]').forEach((el) => {
      const key = el.dataset.p;
      if (el.type === 'checkbox') {
        _pds.personal[key] = el.checked;
      } else if (key === 'dualCitizenship') {
        _pds.personal[key] = el.value === 'true';
      } else {
        _pds.personal[key] = el.value.trim();
      }
    });
    body.querySelectorAll('[data-addr]').forEach((el) => {
      const addrKey = el.dataset.addr;
      const field = el.dataset.af;
      if (!_pds.personal[addrKey]) _pds.personal[addrKey] = emptyAddress();
      _pds.personal[addrKey][field] = el.value.trim();
    });
    if (_pds.personal.sameAsResidential) {
      _pds.personal.permanentAddress = { ..._pds.personal.residentialAddress };
    }
  } else if (_step === 2) {
    collectPerson('spouse');
    collectPerson('father');
    collectPerson('mother');
    body.querySelectorAll('[data-spouse]').forEach((el) => {
      if (['surname', 'firstName', 'middleName', 'nameExtension'].includes(el.dataset.spouse)) return;
      _pds.family.spouse[el.dataset.spouse] = el.value.trim();
    });
    _pds.family.children = [];
    body.querySelectorAll('[data-child-row]').forEach((row) => {
      const i = Number(row.dataset.childRow);
      const name = row.querySelector('[data-child="name"]')?.value.trim() || '';
      const dateOfBirth = row.querySelector('[data-child="dateOfBirth"]')?.value || '';
      _pds.family.children[i] = { name, dateOfBirth };
    });
    _pds.family.children = _pds.family.children.filter((c) => c && (c.name || c.dateOfBirth));
  } else if (_step === 3) {
    collectArrayRows('edu', 'ei', [
      'level',
      'schoolName',
      'degreeCourse',
      'periodFrom',
      'periodTo',
      'highestLevel',
      'yearGraduated',
      'honors',
    ], 'education');
  } else if (_step === 4) {
    collectArrayRows(
      'elig',
      'li',
      ['careerService', 'rating', 'examDate', 'examPlace', 'licenseNumber', 'licenseValidity'],
      'eligibility',
    );
  } else if (_step === 5) {
    const map = {};
    body.querySelectorAll('[data-work]').forEach((el) => {
      const i = Number(el.dataset.wi);
      if (!map[i]) map[i] = {};
      const key = el.dataset.work;
      map[i][key] = key === 'govService' ? el.value === 'true' : el.value.trim();
    });
    _pds.workExperience = Object.keys(map)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => map[k]);
  } else if (_step === 6) {
    collectArrayRows(
      'vol',
      'vi',
      ['orgName', 'orgAddress', 'from', 'to', 'hours', 'positionNature'],
      'voluntaryWork',
    );
  } else if (_step === 7) {
    collectArrayRows(
      'ld',
      'ldi',
      ['title', 'from', 'to', 'hours', 'type', 'conductedBy'],
      'learningDevelopment',
    );
  } else if (_step === 8) {
    body.querySelectorAll('[data-other-list]').forEach((el) => {
      _pds.otherInfo[el.dataset.otherList] = el.value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    });
    body.querySelectorAll('[data-q]').forEach((el) => {
      const key = el.dataset.q;
      const field = el.dataset.qf;
      if (!_pds.otherInfo[key]) _pds.otherInfo[key] = { answer: '', details: '' };
      _pds.otherInfo[key][field] = el.value.trim();
    });
    body.querySelectorAll('[data-ref]').forEach((el) => {
      const i = Number(el.dataset.ri);
      if (!_pds.otherInfo.references[i]) {
        _pds.otherInfo.references[i] = { name: '', address: '', telephoneNo: '' };
      }
      _pds.otherInfo.references[i][el.dataset.ref] = el.value.trim();
    });
  } else if (_step === 9) {
    _assignment.employeeNo = getEl('f-emp-no')?.value.trim() || '';
    _assignment.departmentId = getEl('f-dept')?.value || '';
    _assignment.departmentPositionId = getEl('f-position')?.value || '';
    _assignment.employmentTypeId = getEl('f-emp-type')?.value || '';
    _assignment.employmentStatusId = getEl('f-status')?.value || '';
    _assignment.startDate = getEl('f-start')?.value || '';
  }
}

function collectPerson(prefix) {
  const body = getEl('pds-wizard-body');
  const target =
    prefix === 'spouse'
      ? _pds.family.spouse
      : prefix === 'father'
        ? _pds.family.father
        : _pds.family.mother;
  body.querySelectorAll(`[data-${prefix}]`).forEach((el) => {
    const key = el.getAttribute(`data-${prefix}`);
    if (['surname', 'firstName', 'middleName', 'nameExtension'].includes(key)) {
      target[key] = el.value.trim();
    }
  });
}

function collectArrayRows(dataAttr, indexAttr, fields, pdsKey) {
  const body = getEl('pds-wizard-body');
  const map = {};
  body.querySelectorAll(`[data-${dataAttr}]`).forEach((el) => {
    const i = Number(el.dataset[indexAttr]);
    if (!map[i]) map[i] = {};
    const key = el.getAttribute(`data-${dataAttr}`);
    if (fields.includes(key)) map[i][key] = el.value.trim();
  });
  _pds[pdsKey] = Object.keys(map)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => map[k]);
}

/** Required-field checks only at Save — navigation between steps is free. */
function validateForSave() {
  collectCurrentStep();

  if (!_pds.personal.surname || !_pds.personal.firstName) {
    showToast('Surname and first name are required (Step 1).', 'error');
    goToStep(1);
    return false;
  }

  if (
    !_assignment.departmentId ||
    !_assignment.departmentPositionId ||
    !_assignment.employmentTypeId ||
    !_assignment.employmentStatusId ||
    !_assignment.startDate
  ) {
    showToast('Please fill in all required assignment fields (*).', 'error');
    goToStep(9);
    return false;
  }

  return true;
}

/* ── Dynamic row actions ──────────────────────────────────────── */

function onWizardClick(e) {
  if (e.target.id === 'pic-input' || e.target.closest?.('#pic-input')) return;

  if (e.target.matches('[data-add-child]')) {
    collectCurrentStep();
    _pds.family.children.push({ name: '', dateOfBirth: '' });
    renderStep();
    return;
  }
  if (e.target.matches('[data-remove-child]')) {
    collectCurrentStep();
    const i = Number(e.target.dataset.removeChild);
    _pds.family.children.splice(i, 1);
    renderStep();
    return;
  }
  if (e.target.matches('[data-add-edu]')) {
    collectCurrentStep();
    _pds.education.push({
      level: '',
      schoolName: '',
      degreeCourse: '',
      periodFrom: '',
      periodTo: '',
      highestLevel: '',
      yearGraduated: '',
      honors: '',
    });
    renderStep();
    return;
  }
  if (e.target.matches('[data-remove-edu]')) {
    collectCurrentStep();
    _pds.education.splice(Number(e.target.dataset.removeEdu), 1);
    renderStep();
    return;
  }
  if (e.target.matches('[data-add-elig]')) {
    collectCurrentStep();
    _pds.eligibility.push({
      careerService: '',
      rating: '',
      examDate: '',
      examPlace: '',
      licenseNumber: '',
      licenseValidity: '',
    });
    renderStep();
    return;
  }
  if (e.target.matches('[data-remove-elig]')) {
    collectCurrentStep();
    _pds.eligibility.splice(Number(e.target.dataset.removeElig), 1);
    renderStep();
    return;
  }
  if (e.target.matches('[data-add-work]')) {
    collectCurrentStep();
    _pds.workExperience.push({
      from: '',
      to: '',
      positionTitle: '',
      departmentAgency: '',
      monthlySalary: '',
      salaryGrade: '',
      statusOfAppointment: '',
      govService: false,
    });
    renderStep();
    return;
  }
  if (e.target.matches('[data-remove-work]')) {
    collectCurrentStep();
    _pds.workExperience.splice(Number(e.target.dataset.removeWork), 1);
    renderStep();
    return;
  }
  if (e.target.matches('[data-add-vol]')) {
    collectCurrentStep();
    _pds.voluntaryWork.push({
      orgName: '',
      orgAddress: '',
      from: '',
      to: '',
      hours: '',
      positionNature: '',
    });
    renderStep();
    return;
  }
  if (e.target.matches('[data-remove-vol]')) {
    collectCurrentStep();
    _pds.voluntaryWork.splice(Number(e.target.dataset.removeVol), 1);
    renderStep();
    return;
  }
  if (e.target.matches('[data-add-ld]')) {
    collectCurrentStep();
    _pds.learningDevelopment.push({
      title: '',
      from: '',
      to: '',
      hours: '',
      type: '',
      conductedBy: '',
    });
    renderStep();
    return;
  }
  if (e.target.matches('[data-remove-ld]')) {
    collectCurrentStep();
    _pds.learningDevelopment.splice(Number(e.target.dataset.removeLd), 1);
    renderStep();
    return;
  }
}

function onWizardChange(e) {
  const t = e.target;
  if (t.id === 'pic-input') {
    previewPhoto(t);
    return;
  }
  if (t.id === 'f-dept') {
    loadPositionsForDepartment(t.value).catch(() => resetPositionSelect());
    return;
  }
  if (t.dataset.p === 'sameAsResidential' && t.checked) {
    collectCurrentStep();
    renderStep();
  }
}

/* ── Save / prefill / lookups ─────────────────────────────────── */

async function saveEmployee() {
  if (!validateForSave()) return;

  const payload = {
    firstName: _pds.personal.firstName,
    lastName: _pds.personal.surname,
    middleName: _pds.personal.middleName,
    nameExtension: _pds.personal.nameExtension,
    employeeNo: _assignment.employeeNo || _pds.personal.agencyEmployeeNo || null,
    email: _pds.personal.email,
    contactNumber: _pds.personal.mobileNo || _pds.personal.telephoneNo,
    departmentPositionId: _assignment.departmentPositionId,
    employmentTypeId: _assignment.employmentTypeId,
    employmentStatusId: _assignment.employmentStatusId,
    startDate: _assignment.startDate,
    pds: clonePds(_pds),
  };

  const btn = getEl('emp-modal-save');
  btn.disabled = true;
  try {
    let employeeId = _editingEmpId;
    if (_editingEmpId) {
      await updateEmployee(_editingEmpId, payload);
      showToast('Employee updated.', 'success');
    } else {
      const { employee } = await createEmployee(payload);
      employeeId = employee.id;
      showToast('Employee added.', 'success');
    }
    if (_pendingPhotoFile && employeeId) {
      await uploadEmployeePhoto(employeeId, _pendingPhotoFile);
    }
    closeEmployeeModal();
    await renderEmployeeTable(_getSearchQuery());
    await refreshFilterDropdowns();
  } finally {
    btn.disabled = false;
  }
}

function prefillFromEmployee(emp) {
  _pds = clonePds(emp.pds || emptyPds());
  if (!_pds.personal.firstName && emp.firstName) {
    _pds.personal.firstName = emp.firstName;
    _pds.personal.surname = emp.lastName || '';
    _pds.personal.middleName = emp.middleName || '';
    _pds.personal.nameExtension = emp.nameExtension || '';
    _pds.personal.email = emp.email || '';
    _pds.personal.mobileNo = emp.contactNumber || '';
    _pds.personal.agencyEmployeeNo = emp.employeeNo || '';
  }
  const a = emp.assignment;
  _assignment = {
    employeeNo: emp.employeeNo || _pds.personal.agencyEmployeeNo || '',
    departmentId: a?.departmentId || '',
    departmentPositionId: a?.departmentPositionId || '',
    employmentTypeId: a?.employmentTypeId || _employmentTypes[0]?.id || '',
    employmentStatusId:
      a?.employmentStatusId ||
      _employmentStatuses.find((s) => s.name === 'Active')?.id ||
      _employmentStatuses[0]?.id ||
      '',
    startDate: a?.startDate ? String(a.startDate).slice(0, 10) : getToday(),
  };
  _pendingPhotoFile = null;
  if (_previewObjectUrl) {
    URL.revokeObjectURL(_previewObjectUrl);
    _previewObjectUrl = null;
  }
  // stash photo url for preview via emp
  _photoEmp = emp;
}

let _photoEmp = null;

function photoPreviewHtml() {
  if (_previewObjectUrl) {
    return `<img id="pic-preview" src="${_previewObjectUrl}" class="pds-photo" alt=""/>`;
  }
  if (_photoEmp && (_photoEmp.photoUrl || _photoEmp.profilePicturePath)) {
    const src = escapeAttr(_photoEmp.photoUrl || employeePhotoUrl(_photoEmp.id));
    return `<img id="pic-preview" class="pds-photo" src="${src}" alt="" data-emp-photo />`;
  }
  const initials =
    _pds.personal.firstName || _pds.personal.surname
      ? getInitials(_pds.personal.firstName, _pds.personal.surname)
      : '?';
  return `<div id="pic-preview" class="pic-ini">${escapeHtml(initials)}</div>`;
}

function previewPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  _pendingPhotoFile = file;
  if (_previewObjectUrl) URL.revokeObjectURL(_previewObjectUrl);
  _previewObjectUrl = URL.createObjectURL(file);
  const prev = getEl('pic-preview');
  if (prev) {
    prev.outerHTML = `<img id="pic-preview" class="pds-photo" src="${_previewObjectUrl}" alt=""/>`;
  }
}

async function loadDeptOptions() {
  const { departments } = await listDepartments();
  _deptOptionsHtml =
    '<option value="">Select department</option>' +
    departments
      .map((d) => `<option value="${d.id}">${escapeAttr(d.name)}</option>`)
      .join('');
}

let _deptOptionsHtml = '<option value="">Select department</option>';

async function loadTypeAndStatusOptions() {
  const [typesRes, statusRes] = await Promise.all([
    listEmploymentTypes(),
    listEmploymentStatuses(),
  ]);
  _employmentTypes = typesRes.employmentTypes;
  _employmentStatuses = statusRes.employmentStatuses;
}

async function loadPositionsForDepartment(departmentId, selectedDepartmentPositionId = '') {
  const deptEl = getEl('f-dept');
  const typeEl = getEl('f-emp-type');
  const statusEl = getEl('f-status');
  if (deptEl) {
    deptEl.innerHTML = _deptOptionsHtml;
    deptEl.value = departmentId || _assignment.departmentId || '';
  }
  if (typeEl) {
    typeEl.innerHTML = _employmentTypes
      .map((t) => `<option value="${t.id}">${escapeAttr(t.name)}</option>`)
      .join('');
    typeEl.value = _assignment.employmentTypeId || _employmentTypes[0]?.id || '';
  }
  if (statusEl) {
    statusEl.innerHTML = _employmentStatuses
      .map((s) => `<option value="${s.id}">${escapeAttr(s.name)}</option>`)
      .join('');
    statusEl.value = _assignment.employmentStatusId || '';
  }

  const posEl = getEl('f-position');
  if (!posEl) return;
  if (!departmentId) {
    resetPositionSelect();
    return;
  }
  posEl.disabled = true;
  posEl.innerHTML = '<option value="">Loading…</option>';
  const { positions } = await getDepartmentPositions(departmentId);
  if (!positions.length) {
    posEl.innerHTML = '<option value="">No positions for this department</option>';
    posEl.disabled = true;
    return;
  }
  posEl.innerHTML =
    '<option value="">Select position</option>' +
    positions
      .map(
        (p) =>
          `<option value="${p.department_position_id}">${escapeAttr(p.position_name)}</option>`,
      )
      .join('');
  posEl.disabled = false;
  if (selectedDepartmentPositionId) {
    posEl.value = selectedDepartmentPositionId;
  } else if (_assignment.departmentPositionId) {
    posEl.value = _assignment.departmentPositionId;
  }
}

function resetPositionSelect() {
  const posEl = getEl('f-position');
  if (!posEl) return;
  posEl.innerHTML = '<option value="">Select department first</option>';
  posEl.disabled = true;
}

function opt(value, current, label) {
  const selected = String(current) === String(value) ? ' selected' : '';
  return `<option value="${escapeAttr(value)}"${selected}>${escapeHtml(label)}</option>`;
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
