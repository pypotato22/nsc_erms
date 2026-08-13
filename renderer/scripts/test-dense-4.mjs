/**
 * Dense slice 4 — PDS employee wizard.
 * Run: node renderer/scripts/test-dense-4.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

const featureDir = path.join(root, 'src/features/employee-wizard');
const featurePath = path.join(featureDir, 'EmployeeWizardModal.jsx');
const stepsDir = path.join(featureDir, 'steps');
const bridgePath = path.join(root, 'src/js/components/employeeModal.js');

test('EmployeeWizardModal feature exists', () => {
  assert(fs.existsSync(featurePath), 'EmployeeWizardModal.jsx missing');
  const src = fs.readFileSync(featurePath, 'utf8');
  assert(src.includes('export function EmployeeWizardModal'), 'EmployeeWizardModal export missing');
  assert(src.includes('WIZARD_STEPS') && src.includes('pds-stepper'), 'stepper missing');
  assert(src.includes('emptyPds') && src.includes('clonePds'), 'PDS helpers not reused');
  assert(src.includes('prefillFromEmployee'), 'edit prefill missing');
  assert(src.includes('validateForSave'), 'save validation missing');
  assert(
    src.includes('createEmployee') && src.includes('updateEmployee'),
    'create/update calls missing',
  );
  assert(
    src.includes('uploadEmployeePhoto') && src.includes('uploadEmployeeSignature'),
    'photo/signature upload missing',
  );
  assert(
    src.includes("emitAppEvent('employees.refresh'") &&
      src.includes("emitAppEvent('employees.refreshFilters')"),
    'table refresh after save missing',
  );
  assert(!src.includes('profilePanel'), 'wizard must not import profilePanel');
});

test('wizard renders all nine steps', () => {
  const src = fs.readFileSync(featurePath, 'utf8');
  for (const step of [
    'PersonalStep',
    'FamilyStep',
    'EducationStep',
    'EligibilityStep',
    'WorkStep',
    'VoluntaryStep',
    'LearningStep',
    'OtherStep',
    'AssignmentStep',
  ]) {
    assert(src.includes(`<${step}`), `${step} not rendered`);
    assert(src.includes(`./steps/${step}.jsx`), `${step} not imported from steps/`);
  }
  for (const caseLabel of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    assert(src.includes(`case ${caseLabel}:`), `switch case ${caseLabel} missing`);
  }
});

test('steps folder holds the step components', () => {
  assert(fs.existsSync(stepsDir), 'steps folder missing');
  const files = fs.readdirSync(stepsDir).filter((f) => f.endsWith('.jsx'));
  assert(files.length >= 9, `expected at least 9 step files, found ${files.length}`);
  for (const file of [
    'PersonalStep.jsx',
    'FamilyStep.jsx',
    'EducationStep.jsx',
    'EligibilityStep.jsx',
    'WorkStep.jsx',
    'VoluntaryStep.jsx',
    'LearningStep.jsx',
    'OtherStep.jsx',
    'AssignmentStep.jsx',
  ]) {
    assert(files.includes(file), `${file} missing`);
  }
});

test('steps reuse existing PDS CSS classes and dynamic rows', () => {
  const read = (file) => fs.readFileSync(path.join(stepsDir, file), 'utf8');
  const personal = read('PersonalStep.jsx');
  assert(personal.includes('pic-input') && personal.includes('pic-lbl'), 'photo picker missing');
  assert(personal.includes('sameAsResidential'), 'same-as-residential missing');
  assert(personal.includes('AddressBlock'), 'address blocks missing');

  const other = read('OtherStep.jsx');
  assert(other.includes('sig-input') && other.includes('sig-wrap'), 'signature picker missing');
  for (const q of ['q34', 'q35', 'q36', 'q37', 'q38', 'q39', 'q40']) {
    assert(other.includes(q), `${q} missing from OtherStep`);
  }
  assert(other.includes('references'), 'references missing');

  const assignmentStep = read('AssignmentStep.jsx');
  assert(assignmentStep.includes('getDepartmentPositions'), 'department cascade missing');

  for (const [file, marker] of [
    ['EducationStep.jsx', 'EDUCATION_LEVELS'],
    ['EligibilityStep.jsx', 'emptyEligibilityRow'],
    ['WorkStep.jsx', 'emptyWorkRow'],
    ['VoluntaryStep.jsx', 'emptyVoluntaryRow'],
    ['LearningStep.jsx', 'emptyLearningRow'],
    ['FamilyStep.jsx', 'emptyChild'],
  ]) {
    const src = read(file);
    assert(src.includes(marker), `${marker} missing in ${file}`);
    assert(src.includes('setRows') || src.includes('setChildren'), `${file} rows not editable`);
  }

  for (const file of [
    'EducationStep.jsx',
    'EligibilityStep.jsx',
    'WorkStep.jsx',
    'VoluntaryStep.jsx',
    'LearningStep.jsx',
  ]) {
    const src = read(file);
    assert(src.includes('pds-card-row'), `pds-card-row missing in ${file}`);
    assert(src.includes('AddRowButton') && src.includes('RemoveRowButton'), `add/remove missing in ${file}`);
  }
});

test('bridge mounts React and exports only the three entry points', () => {
  const bridge = fs.readFileSync(bridgePath, 'utf8');
  assert(bridge.includes('mountIsland'), 'mountIsland missing');
  assert(bridge.includes('EmployeeWizardModal'), 'EmployeeWizardModal import missing');
  for (const sig of [
    'export function initEmployeeModal',
    'export function openEmployeeModal',
    'export function closeEmployeeModal',
  ]) {
    assert(bridge.includes(sig), `${sig} missing`);
  }
  const exportCount = (bridge.match(/^export /gm) || []).length;
  assert(exportCount === 3, `bridge should export exactly 3 symbols, found ${exportCount}`);
  assert(
    /classList\.toggle\('open', open\)/.test(bridge),
    'bridge must toggle .open on the host',
  );
  assert(!bridge.includes('setHTML') && !bridge.includes('escapeHtml'), 'bridge still builds HTML');
  assert(!bridge.includes('profilePanel'), 'bridge must not import profilePanel');
});

test('emp-overlay is an empty host rendered by RootApp', () => {
  const rootApp = fs.readFileSync(path.join(root, 'src/app/RootApp.jsx'), 'utf8').replace(/\s+/g, ' ');
  assert(/<div id="emp-overlay" className="overlay" \/>/.test(rootApp), 'emp-overlay host missing');
  assert(!rootApp.includes('id="pds-wizard-body"'), 'stale wizard body markup');
  assert(!rootApp.includes('id="pds-stepper"'), 'stale stepper markup');
  assert(!rootApp.includes('id="emp-modal-save"'), 'stale save button markup');
});

test('RootApp still wires initEmployeeModal', () => {
  const rootApp = fs.readFileSync(path.join(root, 'src/app/RootApp.jsx'), 'utf8');
  assert(rootApp.includes('initEmployeeModal(getSearchQuery)'), 'initEmployeeModal not wired');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('ALL PASS — Dense 4 PDS employee wizard');
