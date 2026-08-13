import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { ProfilePanel } from '../../features/profile/ProfilePanel.jsx';
import { getEmployee } from '../api/employees.js';
import { ApiError } from '../api/client.js';
import { showToast } from '../utils/toast.js';

let mounted = false;
let _panelEmpId = null;
let _employee = null;
let _syncKey = 0;
let _getSearchQuery = () => '';

function remount() {
  const host = document.getElementById('panel');
  if (!host) return;
  if (!mounted) {
    host.innerHTML = '';
    mounted = true;
  }
  mountIsland(
    host,
    createElement(ProfilePanel, {
      employee: _employee,
      syncKey: _syncKey,
      onClose: closeProfilePanel,
      getSearchQuery: () => _getSearchQuery(),
    }),
  );
}

export function initProfilePanel(getSearchQuery) {
  if (typeof getSearchQuery === 'function') _getSearchQuery = getSearchQuery;
  document.getElementById('panel-backdrop')?.addEventListener('click', closeProfilePanel);
}

export async function openProfilePanel(empId) {
  try {
    const { employee } = await getEmployee(empId);
    _panelEmpId = empId;
    _employee = employee;
    remount();
    document.getElementById('panel')?.classList.add('open');
    document.getElementById('panel-backdrop')?.classList.add('open');
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : 'Could not open profile.', 'error');
  }
}

export function closeProfilePanel() {
  document.getElementById('panel')?.classList.remove('open');
  document.getElementById('panel-backdrop')?.classList.remove('open');
  _panelEmpId = null;
}

export function getOpenProfileEmployeeId() {
  return _panelEmpId;
}

/** Live-sync: refresh open profile when the viewed employee changes. */
export async function refreshOpenProfileForLiveSync(payload = {}) {
  if (_panelEmpId == null) return;
  const empId = payload.employeeId;
  if (empId && String(empId) !== String(_panelEmpId)) return;

  const action = payload.action;
  if (action === 'deleted' || action === 'purged') {
    closeProfilePanel();
    return;
  }

  try {
    const { employee } = await getEmployee(_panelEmpId);
    _employee = employee;
    _syncKey += 1;
    remount();
  } catch {
    closeProfilePanel();
  }
}

/** Refetch the employee and refresh the rendered header (tabs keep their state). */
export async function refreshPanelHeader() {
  if (_panelEmpId === null) return;
  try {
    const { employee } = await getEmployee(_panelEmpId);
    _employee = employee;
    remount();
  } catch { /* ignore */ }
}
