import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { EmployeeWizardModal } from '../../features/employee-wizard/EmployeeWizardModal.jsx';

let mounted = false;
let open = false;
/** @type {string | number | null} */
let empId = null;
let _getSearchQuery = () => '';

function remount() {
  const host = document.getElementById('emp-overlay');
  if (!host) return;
  if (!mounted) {
    host.innerHTML = '';
    mounted = true;
  }
  host.classList.toggle('open', open);
  mountIsland(
    host,
    createElement(EmployeeWizardModal, {
      open,
      empId,
      getSearchQuery: () => _getSearchQuery(),
      onClose: closeEmployeeModal,
    }),
  );
}

export function initEmployeeModal(getSearchQuery) {
  if (typeof getSearchQuery === 'function') _getSearchQuery = getSearchQuery;
  remount();
}

export function openEmployeeModal(nextEmpId = null) {
  empId = nextEmpId;
  open = true;
  remount();
}

export function closeEmployeeModal() {
  open = false;
  empId = null;
  remount();
}
