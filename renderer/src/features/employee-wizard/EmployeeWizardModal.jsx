import { useCallback, useEffect, useRef, useState } from 'react';
import { createEmployee, getEmployee, updateEmployee } from '../../js/api/employees.js';
import {
  listDepartments,
  listEmploymentStatuses,
  listEmploymentTypes,
} from '../../js/api/departments.js';
import {
  employeePhotoUrl,
  employeeSignatureUrl,
  employeeThumbmarkUrl,
  uploadEmployeePhoto,
  uploadEmployeeSignature,
  uploadEmployeeThumbmark,
  captureFingerprintImage,
  cancelFingerprintImage,
} from '../../js/api/documents.js';
import { ApiError } from '../../js/api/client.js';
import { getInitials, getToday } from '../../js/utils/helpers.js';
import { showToast } from '../../js/utils/toast.js';
import { emitAppEvent } from '../../shared/lib/appEvents.js';
import { clonePds, emptyAddress, emptyPds, WIZARD_STEPS } from '../../js/utils/pds.js';
import { PersonalStep } from './steps/PersonalStep.jsx';
import { FamilyStep } from './steps/FamilyStep.jsx';
import { EducationStep } from './steps/EducationStep.jsx';
import { EligibilityStep } from './steps/EligibilityStep.jsx';
import { WorkStep } from './steps/WorkStep.jsx';
import { VoluntaryStep } from './steps/VoluntaryStep.jsx';
import { LearningStep } from './steps/LearningStep.jsx';
import { OtherStep } from './steps/OtherStep.jsx';
import { AssignmentStep } from './steps/AssignmentStep.jsx';
import { ThumbCaptureDialog } from './ThumbCaptureDialog.jsx';

const LAST_STEP = WIZARD_STEPS.length;

function emptyAssignment() {
  return {
    employeeNo: '',
    departmentId: '',
    departmentPositionId: '',
    employmentTypeId: '',
    employmentStatusId: '',
    startDate: '',
  };
}

function defaultAssignment(types, statuses) {
  return {
    ...emptyAssignment(),
    employmentTypeId: types[0]?.id || '',
    employmentStatusId:
      statuses.find((s) => s.name === 'Active')?.id || statuses[0]?.id || '',
    startDate: getToday(),
  };
}

function prefillFromEmployee(emp, types, statuses) {
  const pds = clonePds(emp.pds || emptyPds());
  if (!pds.personal.firstName && emp.firstName) {
    pds.personal.firstName = emp.firstName;
    pds.personal.surname = emp.lastName || '';
    pds.personal.middleName = emp.middleName || '';
    pds.personal.nameExtension = emp.nameExtension || '';
    pds.personal.email = emp.email || '';
    pds.personal.mobileNo = emp.contactNumber || '';
    pds.personal.agencyEmployeeNo = emp.employeeNo || '';
  }
  const a = emp.assignment;
  const assignment = {
    employeeNo: emp.employeeNo || pds.personal.agencyEmployeeNo || '',
    departmentId: a?.departmentId || '',
    departmentPositionId: a?.departmentPositionId || '',
    employmentTypeId: a?.employmentTypeId || types[0]?.id || '',
    employmentStatusId:
      a?.employmentStatusId ||
      statuses.find((s) => s.name === 'Active')?.id ||
      statuses[0]?.id ||
      '',
    startDate: a?.startDate ? String(a.startDate).slice(0, 10) : getToday(),
  };
  return { pds, assignment };
}

/** Vanilla trimmed every field while collecting the DOM; do it once on save instead. */
function trimDeep(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(trimDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) out[key] = trimDeep(val);
    return out;
  }
  return value;
}

/**
 * Modal contents for #emp-overlay (host toggles .open).
 */
export function EmployeeWizardModal({ open, empId, getSearchQuery, onClose }) {
  const [step, setStep] = useState(1);
  const [pds, setPds] = useState(() => emptyPds());
  const [assignment, setAssignment] = useState(() => emptyAssignment());
  const [employee, setEmployee] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [employmentTypes, setEmploymentTypes] = useState([]);
  const [employmentStatuses, setEmploymentStatuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [signatureFile, setSignatureFile] = useState(null);
  const [signatureUrl, setSignatureUrl] = useState(null);
  const [thumbmarkFile, setThumbmarkFile] = useState(null);
  const [thumbmarkUrl, setThumbmarkUrl] = useState(null);
  const [capturingThumb, setCapturingThumb] = useState(false);
  const [thumbNote, setThumbNote] = useState('');
  const [thumbDialog, setThumbDialog] = useState(null); // { phase, startedAt, message, preview }

  const bodyRef = useRef(null);
  const openToken = useRef(0);
  const photoUrlRef = useRef(null);
  const signatureUrlRef = useRef(null);
  const thumbmarkUrlRef = useRef(null);
  const thumbmarkFileRef = useRef(null);
  const captureGen = useRef(0);
  const capturingRef = useRef(false);

  const revokePreviews = useCallback(() => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    if (signatureUrlRef.current) URL.revokeObjectURL(signatureUrlRef.current);
    if (thumbmarkUrlRef.current?.startsWith('blob:')) URL.revokeObjectURL(thumbmarkUrlRef.current);
    photoUrlRef.current = null;
    signatureUrlRef.current = null;
    thumbmarkUrlRef.current = null;
    thumbmarkFileRef.current = null;
    setPhotoUrl(null);
    setSignatureUrl(null);
    setThumbmarkUrl(null);
    setPhotoFile(null);
    setSignatureFile(null);
    setThumbmarkFile(null);
    setThumbNote('');
  }, []);

  useEffect(() => {
    if (!open) {
      openToken.current += 1;
      if (capturingRef.current) {
        captureGen.current += 1;
        capturingRef.current = false;
        cancelFingerprintImage().catch(() => {});
        window.nscDesktop?.cancelRightThumb?.();
      }
      setCapturingThumb(false);
      setThumbDialog(null);
      revokePreviews();
      setStep(1);
      setEmployee(null);
      setPds(emptyPds());
      setAssignment(emptyAssignment());
      setSaving(false);
      return;
    }

    const token = ++openToken.current;
    setStep(1);
    revokePreviews();
    setLoading(true);
    (async () => {
      try {
        const [deptRes, typeRes, statusRes] = await Promise.all([
          listDepartments(),
          listEmploymentTypes(),
          listEmploymentStatuses(),
        ]);
        if (token !== openToken.current) return;
        const types = typeRes.employmentTypes || [];
        const statuses = statusRes.employmentStatuses || [];
        setDepartments(deptRes.departments || []);
        setEmploymentTypes(types);
        setEmploymentStatuses(statuses);

        if (empId) {
          const { employee: emp } = await getEmployee(empId);
          if (token !== openToken.current) return;
          const prefilled = prefillFromEmployee(emp, types, statuses);
          setEmployee(emp);
          setPds(prefilled.pds);
          setAssignment(prefilled.assignment);
        } else {
          setEmployee(null);
          setPds(emptyPds());
          setAssignment(defaultAssignment(types, statuses));
        }
        setLoading(false);
      } catch (err) {
        if (token !== openToken.current) return;
        setLoading(false);
        showToast(err instanceof ApiError ? err.message : 'Could not open form.', 'error');
        onClose();
      }
    })();
  }, [open, empId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => revokePreviews(), [revokePreviews]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [step]);

  /* ── PDS setters ────────────────────────────────────────────── */

  const patchPersonal = useCallback((patch) => {
    setPds((prev) => {
      const personal = { ...prev.personal, ...patch };
      if (personal.sameAsResidential) {
        personal.permanentAddress = { ...(personal.residentialAddress || emptyAddress()) };
      }
      return { ...prev, personal };
    });
  }, []);

  const patchAddress = useCallback((key, patch) => {
    setPds((prev) => {
      const personal = {
        ...prev.personal,
        [key]: { ...(prev.personal[key] || emptyAddress()), ...patch },
      };
      if (key === 'residentialAddress' && personal.sameAsResidential) {
        personal.permanentAddress = { ...personal.residentialAddress };
      }
      return { ...prev, personal };
    });
  }, []);

  const patchFamilyMember = useCallback((member, patch) => {
    setPds((prev) => ({
      ...prev,
      family: { ...prev.family, [member]: { ...prev.family[member], ...patch } },
    }));
  }, []);

  const setChildren = useCallback((children) => {
    setPds((prev) => ({ ...prev, family: { ...prev.family, children } }));
  }, []);

  const setList = useCallback((key, rows) => {
    setPds((prev) => ({ ...prev, [key]: rows }));
  }, []);

  const setEducation = useCallback((rows) => setList('education', rows), [setList]);
  const setEligibility = useCallback((rows) => setList('eligibility', rows), [setList]);
  const setWork = useCallback((rows) => setList('workExperience', rows), [setList]);
  const setVoluntary = useCallback((rows) => setList('voluntaryWork', rows), [setList]);
  const setLearning = useCallback((rows) => setList('learningDevelopment', rows), [setList]);

  const patchOther = useCallback((patch) => {
    setPds((prev) => ({ ...prev, otherInfo: { ...prev.otherInfo, ...patch } }));
  }, []);

  const patchQuestion = useCallback((key, patch) => {
    setPds((prev) => ({
      ...prev,
      otherInfo: { ...prev.otherInfo, [key]: { ...(prev.otherInfo[key] || {}), ...patch } },
    }));
  }, []);

  const patchQuestionPart = useCallback((key, part, patch) => {
    setPds((prev) => {
      const question = prev.otherInfo[key] || {};
      const current = typeof question[part] === 'object' && question[part] ? question[part] : {};
      return {
        ...prev,
        otherInfo: {
          ...prev.otherInfo,
          [key]: { ...question, [part]: { ...current, ...patch } },
        },
      };
    });
  }, []);

  const patchReference = useCallback((index, patch) => {
    setPds((prev) => {
      const references = [...(prev.otherInfo.references || [])];
      references[index] = {
        ...(references[index] || { name: '', address: '', telephoneNo: '' }),
        ...patch,
      };
      return { ...prev, otherInfo: { ...prev.otherInfo, references } };
    });
  }, []);

  const patchDeclaration = useCallback((patch) => {
    setPds((prev) => ({
      ...prev,
      otherInfo: {
        ...prev.otherInfo,
        declaration: { ...(prev.otherInfo.declaration || {}), ...patch },
      },
    }));
  }, []);

  const patchAssignment = useCallback((patch) => {
    setAssignment((prev) => ({ ...prev, ...patch }));
  }, []);

  /* ── Photo / signature ──────────────────────────────────────── */

  function pickPhoto(file) {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const url = URL.createObjectURL(file);
    photoUrlRef.current = url;
    setPhotoFile(file);
    setPhotoUrl(url);
  }

  function pickSignature(file) {
    if (signatureUrlRef.current) URL.revokeObjectURL(signatureUrlRef.current);
    const url = URL.createObjectURL(file);
    signatureUrlRef.current = url;
    setSignatureFile(file);
    setSignatureUrl(url);
  }

  function fileFromPngBase64(pngBase64) {
    const clean = String(pngBase64).replace(/^data:image\/png;base64,/, '').replace(/\s/g, '');
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
      throw new Error('The reader did not return a thumb picture.');
    }
    return { file: new File([bytes], 'thumbmark.png', { type: 'image/png' }), dataUrl: `data:image/png;base64,${clean}` };
  }

  function applyThumbPng(pngBase64) {
    const { file, dataUrl } = fileFromPngBase64(pngBase64);
    if (thumbmarkUrlRef.current?.startsWith('blob:')) URL.revokeObjectURL(thumbmarkUrlRef.current);
    thumbmarkUrlRef.current = dataUrl;
    thumbmarkFileRef.current = file;
    setThumbmarkFile(file);
    setThumbmarkUrl(dataUrl);
  }

  async function captureThumb() {
    const gen = captureGen.current;
    capturingRef.current = true;
    setThumbNote('Place your right thumb on the reader. Leave the prompt in front.');
    setCapturingThumb(true);
    setThumbDialog({ phase: 'waiting', startedAt: Date.now() });
    try {
      await window.nscDesktop?.prepareThumbCapture?.();
      const result = await captureFingerprintImage();
      if (gen !== captureGen.current) return;
      if (!result?.ok || !result.pngBase64) {
        const message = result?.message || 'The right thumb was not captured.';
        setThumbNote(message);
        setThumbDialog({ phase: 'error', message });
        return;
      }
      applyThumbPng(result.pngBase64);
      setThumbNote('Right thumb captured. Save the employee to keep it.');
      setThumbDialog({ phase: 'done', preview: `data:image/png;base64,${result.pngBase64}` });
    } catch (err) {
      if (gen !== captureGen.current) return;
      const message = err?.message || 'The right thumb was not captured.';
      setThumbNote(message);
      setThumbDialog({ phase: 'error', message });
    } finally {
      if (gen === captureGen.current) capturingRef.current = false;
      await window.nscDesktop?.restoreThumbCapture?.();
      if (gen === captureGen.current) setCapturingThumb(false);
    }
  }

  function cancelThumb() {
    captureGen.current += 1;
    capturingRef.current = false;
    setCapturingThumb(false);
    setThumbDialog(null);
    setThumbNote('Capture canceled.');
    cancelFingerprintImage().catch(() => {});
    window.nscDesktop?.restoreThumbCapture?.();
  }

  function retryThumb() {
    setThumbDialog(null);
    captureThumb();
  }

  // The form behind the capture dialog must stay open until the capture ends.
  function requestClose() {
    if (capturingRef.current) {
      showToast('Finish or cancel the fingerprint capture first.', 'error');
      return;
    }
    onClose();
  }

  const photoSrc =
    photoUrl ||
    (employee && (employee.photoUrl || employee.profilePicturePath)
      ? employee.photoUrl || employeePhotoUrl(employee.id)
      : null);

  const signatureSrc =
    signatureUrl ||
    (employee && (employee.signatureUrl || employee.signaturePath)
      ? employee.signatureUrl || employeeSignatureUrl(employee.id)
      : null);

  const thumbmarkSrc =
    thumbmarkUrl ||
    (employee && (employee.thumbmarkUrl || employee.thumbmarkPath)
      ? employee.thumbmarkUrl || employeeThumbmarkUrl(employee.id)
      : null);

  const photoInitials =
    (employee
      ? getInitials(employee.firstName, employee.lastName)
      : getInitials(pds.personal.firstName, pds.personal.surname)) || '?';

  /* ── Navigation / save ──────────────────────────────────────── */

  function goToStep(next) {
    if (next < 1 || next > LAST_STEP) return;
    setStep(next);
  }

  function normalizedPds() {
    const next = clonePds(pds);
    if (next.personal.sameAsResidential) {
      next.personal.permanentAddress = { ...(next.personal.residentialAddress || emptyAddress()) };
    }
    next.family.children = (next.family.children || []).filter(
      (c) => c && (c.name || c.dateOfBirth),
    );
    return trimDeep(next);
  }

  function validateForSave(finalPds) {
    if (!finalPds.personal.surname || !finalPds.personal.firstName) {
      showToast('Surname and first name are required (Step 1).', 'error');
      goToStep(1);
      return false;
    }
    if (
      !assignment.departmentId ||
      !assignment.departmentPositionId ||
      !assignment.employmentTypeId ||
      !assignment.employmentStatusId ||
      !assignment.startDate
    ) {
      showToast('Please fill in all required assignment fields (*).', 'error');
      goToStep(LAST_STEP);
      return false;
    }
    return true;
  }

  async function saveEmployee() {
    const finalPds = normalizedPds();
    if (!validateForSave(finalPds)) return;

    const payload = {
      firstName: finalPds.personal.firstName,
      lastName: finalPds.personal.surname,
      middleName: finalPds.personal.middleName,
      nameExtension: finalPds.personal.nameExtension,
      employeeNo:
        (assignment.employeeNo || '').trim() || finalPds.personal.agencyEmployeeNo || null,
      email: finalPds.personal.email,
      contactNumber: finalPds.personal.mobileNo || finalPds.personal.telephoneNo,
      departmentPositionId: assignment.departmentPositionId,
      employmentTypeId: assignment.employmentTypeId,
      employmentStatusId: assignment.employmentStatusId,
      startDate: assignment.startDate,
      pds: finalPds,
    };

    setSaving(true);
    try {
      let employeeId = empId;
      if (empId) {
        await updateEmployee(empId, payload);
        showToast('Employee updated.', 'success');
      } else {
        const { employee: created } = await createEmployee(payload);
        employeeId = created.id;
        showToast('Employee added.', 'success');
      }
      if (photoFile && employeeId) await uploadEmployeePhoto(employeeId, photoFile);
      if (signatureFile && employeeId) await uploadEmployeeSignature(employeeId, signatureFile);
      const thumbFile = thumbmarkFileRef.current;
      if (thumbFile && employeeId) await uploadEmployeeThumbmark(employeeId, thumbFile);
      onClose();
      emitAppEvent('employees.refresh', { q: getSearchQuery?.() || '' });
      emitAppEvent('employees.refreshFilters');
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : (err?.message || 'Save failed.'),
        'error',
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const meta = WIZARD_STEPS[step - 1];

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <PersonalStep
            personal={pds.personal}
            patchPersonal={patchPersonal}
            patchAddress={patchAddress}
            photoSrc={photoSrc}
            photoInitials={photoInitials}
            onPickPhoto={pickPhoto}
          />
        );
      case 2:
        return (
          <FamilyStep
            family={pds.family}
            patchSpouse={(patch) => patchFamilyMember('spouse', patch)}
            patchFather={(patch) => patchFamilyMember('father', patch)}
            patchMother={(patch) => patchFamilyMember('mother', patch)}
            setChildren={setChildren}
          />
        );
      case 3:
        return <EducationStep rows={pds.education} setRows={setEducation} />;
      case 4:
        return <EligibilityStep rows={pds.eligibility} setRows={setEligibility} />;
      case 5:
        return <WorkStep rows={pds.workExperience} setRows={setWork} />;
      case 6:
        return <VoluntaryStep rows={pds.voluntaryWork} setRows={setVoluntary} />;
      case 7:
        return <LearningStep rows={pds.learningDevelopment} setRows={setLearning} />;
      case 8:
        return (
          <OtherStep
            other={pds.otherInfo}
            patchOther={patchOther}
            patchQuestion={patchQuestion}
            patchQuestionPart={patchQuestionPart}
            patchReference={patchReference}
            patchDeclaration={patchDeclaration}
            signatureSrc={signatureSrc}
            onPickSignature={pickSignature}
            thumbmarkSrc={thumbmarkSrc}
            thumbNote={thumbNote}
            capturingThumb={capturingThumb}
            onCaptureThumb={captureThumb}
            onCancelThumb={cancelThumb}
          />
        );
      case 9:
        return (
          <AssignmentStep
            assignment={assignment}
            patchAssignment={patchAssignment}
            departments={departments}
            employmentTypes={employmentTypes}
            employmentStatuses={employmentStatuses}
            defaultEmployeeNo={pds.personal.agencyEmployeeNo}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="modal pds-wizard-modal">
      {thumbDialog && (
        <ThumbCaptureDialog
          phase={thumbDialog.phase}
          startedAt={thumbDialog.startedAt}
          message={thumbDialog.message}
          previewSrc={thumbDialog.preview}
          onCancel={cancelThumb}
          onRetry={retryThumb}
          onDone={() => setThumbDialog(null)}
        />
      )}
      <button
        id="close-emp-modal"
        className="modal-close"
        type="button"
        aria-label="Close"
        onClick={requestClose}
      >
        ×
      </button>
      <div className="pds-wizard-header">
        <div>
          <p className="pds-form-eyebrow">CS Form No. 212 · Revised 2025</p>
          <h3 id="emp-modal-title">{empId ? 'Edit Employee' : 'Add Employee'}</h3>
          <p className="pds-wizard-sub">
            Personal Data Sheet — complete each section, then set NSC assignment.
          </p>
        </div>
      </div>
      <nav id="pds-stepper" className="pds-stepper" aria-label="PDS steps">
        {WIZARD_STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`pds-step${s.id === step ? ' active' : ''}`}
            title={s.title}
            onClick={() => goToStep(s.id)}
          >
            <span className="pds-step-num">{s.id}</span>
            <span className="pds-step-label">{s.short}</span>
          </button>
        ))}
      </nav>
      <div id="pds-wizard-body" className="pds-wizard-body" ref={bodyRef}>
        <div className="pds-section-head">
          <h4>{meta.title}</h4>
        </div>
        {loading ? <p className="pds-hint">Loading…</p> : renderStep()}
      </div>
      <div className="modal-actions pds-wizard-actions">
        <button id="emp-modal-cancel" className="btn btn-cancel" type="button" onClick={requestClose}>
          Cancel
        </button>
        <div className="pds-nav-btns">
          <button
            id="pds-back"
            className="btn btn-cancel"
            type="button"
            hidden={step === 1}
            onClick={() => goToStep(step - 1)}
          >
            Back
          </button>
          <button
            id="pds-next"
            className="btn btn-primary"
            type="button"
            hidden={step === LAST_STEP}
            onClick={() => goToStep(step + 1)}
          >
            Next
          </button>
          <button
            id="emp-modal-save"
            className="btn btn-primary"
            type="button"
            hidden={step !== LAST_STEP}
            disabled={saving}
            onClick={() => void saveEmployee()}
          >
            Save Employee
          </button>
        </div>
      </div>
    </div>
  );
}
