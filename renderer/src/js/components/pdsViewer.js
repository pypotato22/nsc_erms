import { getEmployee, downloadPdsExcelUrl } from '../api/employees.js';
import { ApiError } from '../api/client.js';
import { getEl } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { buildCs212Html } from '../utils/pdsFormHtml.js';

let _employee = null;

export function initPdsViewer() {
  getEl('pds-view-close')?.addEventListener('click', closePdsViewer);
  getEl('pds-view-cancel')?.addEventListener('click', closePdsViewer);
  getEl('pds-view-print')?.addEventListener('click', () => {
    if (!_employee) return;
    printPds(_employee);
  });
  getEl('pds-view-download-excel')?.addEventListener('click', () => {
    if (!_employee?.id) return;
    downloadOfficialPdsExcel(_employee.id);
  });
  getEl('pds-view-overlay')?.addEventListener('click', (e) => {
    if (e.target === getEl('pds-view-overlay')) closePdsViewer();
  });
}

export async function openPdsViewer(employeeOrId) {
  try {
    let employee = employeeOrId;
    if (typeof employeeOrId === 'string' || typeof employeeOrId === 'number') {
      const res = await getEmployee(employeeOrId);
      employee = res.employee;
    } else if (employeeOrId?.id && !employeeOrId.pds) {
      const res = await getEmployee(employeeOrId.id);
      employee = res.employee;
    }
    _employee = employee;
    const name = [employee.firstName, employee.middleName, employee.lastName, employee.nameExtension]
      .filter(Boolean)
      .join(' ');
    getEl('pds-view-title').textContent = `PDS — ${name || 'Employee'}`;
    getEl('pds-view-body').innerHTML = buildCs212Html(employee, { forPrint: false });
    getEl('pds-view-overlay').classList.add('open');
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : 'Could not open PDS.', 'error');
  }
}

export function closePdsViewer() {
  getEl('pds-view-overlay')?.classList.remove('open');
  _employee = null;
}

export function printPds(employee) {
  const area = getEl('print-area');
  if (!area) return;
  area.innerHTML = buildCs212Html(employee, { forPrint: true });
  requestAnimationFrame(() => {
    setTimeout(() => {
      window.print();
    }, 150);
  });
}

/** Download filled official CS Form 212 Excel (Annex H-1). */
export function downloadOfficialPdsExcel(employeeId) {
  const a = document.createElement('a');
  a.href = downloadPdsExcelUrl(employeeId);
  a.download = '';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Downloading official PDS Excel…', 'info');
}
