import { getEmployee, deleteEmployee, restoreEmployee, listEmployeeAssignments } from '../api/employees.js';
import { ApiError } from '../api/client.js';
import { getEl, setHTML, getInitials, getStatusBadge, getYearsOfService, escapeHtml } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { renderEmployeeTable } from './employeeTable.js';
import { openEmployeeModal } from './employeeModal.js';
import { openPdsViewer, downloadOfficialPdsExcel } from './pdsViewer.js';
import { renderTabDocs } from './documents.js';
import { renderArchivedEmployeesPage } from './archivedEmployees.js';
import { canWrite } from '../utils/authz.js';

let _panelEmpId = null;
let _getSearchQuery = () => '';

export function initProfilePanel(getSearchQuery) {
  _getSearchQuery = getSearchQuery;
  getEl('panel-backdrop').addEventListener('click', closeProfilePanel);

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab, btn));
  });
}

export async function openProfilePanel(empId) {
  try {
    const { employee } = await getEmployee(empId);
    _panelEmpId = empId;
    renderPanelHeader(employee);
    activateTab('info');
    renderTabInfo(employee);
    getEl('panel').classList.add('open');
    getEl('panel-backdrop').classList.add('open');
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : 'Could not open profile.', 'error');
  }
}

export function closeProfilePanel() {
  getEl('panel').classList.remove('open');
  getEl('panel-backdrop').classList.remove('open');
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
    renderPanelHeader(employee);
    const activeTab = document.querySelector('.tab-btn.active')?.dataset?.tab;
    if (activeTab === 'info') renderTabInfo(employee);
    if (activeTab === 'employment') await renderTabEmployment(employee);
    if (activeTab === 'docs') await renderTabDocs(employee);
  } catch {
    closeProfilePanel();
  }
}

export async function refreshPanelHeader() {
  if (_panelEmpId === null) return;
  try {
    const { employee } = await getEmployee(_panelEmpId);
    renderPanelHeader(employee);
  } catch { /* ignore */ }
}

async function switchTab(tabName, buttonEl) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  buttonEl.classList.add('active');
  document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
  getEl('tab-' + tabName).classList.add('active');
  if (_panelEmpId === null) return;
  try {
    const { employee } = await getEmployee(_panelEmpId);
    if (tabName === 'info') renderTabInfo(employee);
    if (tabName === 'employment') await renderTabEmployment(employee);
    if (tabName === 'docs') renderTabDocs(employee);
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : 'Failed to load tab.', 'error');
  }
}

function formatDisplayName(emp) {
  const mid = emp.middleName ? ` ${emp.middleName}` : '';
  const ext = emp.nameExtension ? ` ${emp.nameExtension}` : '';
  return `${emp.firstName || ''}${mid} ${emp.lastName || ''}${ext}`.replace(/\s+/g, ' ').trim();
}

function pdsSummary(emp) {
  const p = emp.pds?.personal;
  if (!p) {
    return `<p class="pds-profile-note">Full Personal Data Sheet (CS Form 212) — use <strong>View PDS</strong> or <strong>Edit</strong>.</p>`;
  }
  const bits = [];
  if (p.civilStatus) bits.push(`Civil status: ${p.civilStatus}`);
  if (p.birthDate) bits.push(`Born: ${p.birthDate}`);
  if (p.citizenship) bits.push(`Citizenship: ${p.citizenship}`);
  const edu = emp.pds?.education?.filter((r) => r.schoolName || r.level)?.length || 0;
  const work = emp.pds?.workExperience?.length || 0;
  const elig = emp.pds?.eligibility?.length || 0;
  bits.push(`Education rows: ${edu}`);
  bits.push(`Work entries: ${work}`);
  bits.push(`Eligibilities: ${elig}`);
  return `
    <div class="info-section" style="margin-top:16px;">
      <h4>Personal Data Sheet</h4>
      <div class="info-row"><span class="ir-label">Form</span><span class="ir-val">CS Form No. 212 (Rev. 2025)</span></div>
      ${bits.map((b) => `<div class="info-row"><span class="ir-label">Detail</span><span class="ir-val">${escapeHtml(b)}</span></div>`).join('')}
      <p class="pds-profile-note">Use <strong>View PDS</strong> for an on-screen preview, <strong>Download Excel</strong> for the official CS Form 212 file, or <strong>Edit</strong> to update sections.</p>
    </div>`;
}

function renderTabInfo(emp) {
  const sexLabel = emp.sex
    ? emp.sex.charAt(0).toUpperCase() + emp.sex.slice(1)
    : '—';
  setHTML(
    'tab-info',
    `
    <div class="info-section">
      <h4>Personal Information</h4>
      <div class="info-row"><span class="ir-label">Full Name</span><span class="ir-val">${escapeHtml(formatDisplayName(emp))}</span></div>
      <div class="info-row"><span class="ir-label">Sex</span><span class="ir-val">${escapeHtml(sexLabel)}</span></div>
      <div class="info-row"><span class="ir-label">Date of Birth</span><span class="ir-val">${escapeHtml(emp.birthDate || emp.pds?.personal?.birthDate || '—')}</span></div>
      <div class="info-row"><span class="ir-label">Email</span><span class="ir-val">${escapeHtml(emp.email || '—')}</span></div>
      <div class="info-row"><span class="ir-label">Contact</span><span class="ir-val">${escapeHtml(emp.contactNumber || '—')}</span></div>
      <div class="info-row"><span class="ir-label">Address</span><span class="ir-val">${escapeHtml(emp.address || '—')}</span></div>
    </div>
    ${pdsSummary(emp)}`,
  );
}

async function renderTabEmployment(emp) {
  const a = emp.assignment;
  setHTML(
    'tab-employment',
    `<div class="empty" style="padding:20px 0">Loading assignment history…</div>`,
  );

  try {
    const { assignments } = await listEmployeeAssignments(emp.id);
    const showHistory =
      assignments.length > 1 || assignments.some((row) => row.endDate);
    const historyHtml = showHistory
        ? `<div class="info-section" style="margin-top:18px;">
            <h4>Assignment history</h4>
            <div class="assign-history">
              ${assignments
                .map((row) => {
                  const start = row.startDate ? String(row.startDate).slice(0, 10) : '—';
                  const end = row.endDate ? String(row.endDate).slice(0, 10) : row.isActive ? 'Present' : '—';
                  const tags = [
                    row.isPrimary && row.isActive ? '<span class="ph-badge">Primary</span>' : '',
                    !row.isActive ? '<span class="ph-badge" style="opacity:.7">Ended</span>' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return `
                <div class="assign-history-row">
                  <div class="assign-history-main">
                    <strong>${escapeHtml(row.positionName || '—')}</strong>
                    <span style="color:var(--text-2);"> · ${escapeHtml(row.departmentName || '—')}</span>
                    ${tags ? `<div style="margin-top:4px;">${tags}</div>` : ''}
                  </div>
                  <div class="assign-history-meta">
                    ${escapeHtml(start)} → ${escapeHtml(end)}
                    · ${escapeHtml(row.employmentStatusName || '—')}
                  </div>
                </div>`;
                })
                .join('')}
            </div>
          </div>`
        : '';

    setHTML(
      'tab-employment',
      `
    <div class="info-section">
      <h4>Current employment</h4>
      <div class="info-row"><span class="ir-label">Employee No</span><span class="ir-val" style="font-family:'DM Mono',monospace;">${escapeHtml(emp.employeeNo || '—')}</span></div>
      <div class="info-row"><span class="ir-label">Position</span><span class="ir-val">${escapeHtml(a?.positionName || '—')}</span></div>
      <div class="info-row"><span class="ir-label">Department</span><span class="ir-val">${escapeHtml(a?.departmentName || '—')}</span></div>
      <div class="info-row"><span class="ir-label">Employment type</span><span class="ir-val">${escapeHtml(a?.employmentTypeName || '—')}</span></div>
      <div class="info-row"><span class="ir-label">Status</span><span class="ir-val">${getStatusBadge(a?.employmentStatusName || '—')}</span></div>
      <div class="info-row"><span class="ir-label">Start Date</span><span class="ir-val">${escapeHtml(a?.startDate ? String(a.startDate).slice(0, 10) : '—')}</span></div>
      <div class="info-row"><span class="ir-label">Years of Service</span><span class="ir-val">${getYearsOfService(a?.startDate)}</span></div>
    </div>
    ${historyHtml}`,
    );
  } catch (err) {
    setHTML(
      'tab-employment',
      `<div class="empty" style="padding:20px 0;color:var(--error)">${escapeHtml(err.message || 'Failed to load assignments')}</div>`,
    );
  }
}

function renderPanelHeader(emp) {
  const a = emp.assignment;
  const initials = escapeHtml(getInitials(emp.firstName, emp.lastName));
  const hasPhoto = Boolean(emp.photoUrl || emp.profilePicturePath);
  const photoSrc = emp.photoUrl || (hasPhoto ? `/api/v1/employees/${emp.id}/photo` : '');
  const pic = hasPhoto
    ? `<img src="${escapeHtml(photoSrc)}" class="ph-avatar-lg" alt="" data-ph-photo />`
    : `<div class="ph-ini-lg">${initials}</div>`;

  const displayName = [emp.firstName, emp.middleName, emp.lastName, emp.nameExtension]
    .filter(Boolean)
    .join(' ');

  setHTML(
    'panel-header',
    `
    <button class="ph-close" id="panel-close-btn">×</button>
    ${pic}
    <h2>${escapeHtml(displayName || `${emp.firstName} ${emp.lastName}`)}</h2>
    <div class="ph-pos">${escapeHtml(a?.positionName || 'No position')} &middot; ${escapeHtml(a?.departmentName || 'No Department')}</div>
    <div class="ph-badges">
      <span class="ph-badge">${escapeHtml(a?.employmentStatusName || '—')}</span>
      <span class="ph-badge">${escapeHtml(emp.employeeNo || '—')}</span>
      ${a?.startDate ? `<span class="ph-badge">Since ${escapeHtml(String(a.startDate).slice(0, 10))}</span>` : ''}
    </div>
    <div class="ph-actions">
      <button class="phbtn phbtn-view" id="panel-view-pds-btn" type="button">View PDS</button>
      <button class="phbtn phbtn-view" id="panel-download-pds-btn" type="button">Download Excel</button>
      ${canWrite() ? `<button class="phbtn phbtn-edit" id="panel-edit-btn" type="button">Edit</button>
      <button class="phbtn phbtn-del" id="panel-delete-btn" type="button">Archive</button>` : ''}
    </div>`,
  );

  const photoEl = document.querySelector('#panel-header [data-ph-photo]');
  if (photoEl) {
    photoEl.addEventListener('error', () => {
      photoEl.replaceWith(
        Object.assign(document.createElement('div'), {
          className: 'ph-ini-lg',
          textContent: getInitials(emp.firstName, emp.lastName),
        }),
      );
    });
  }

  document.getElementById('panel-close-btn').addEventListener('click', closeProfilePanel);
  document.getElementById('panel-view-pds-btn')?.addEventListener('click', () => {
    openPdsViewer(emp);
  });
  document.getElementById('panel-download-pds-btn')?.addEventListener('click', () => {
    downloadOfficialPdsExcel(emp.id);
  });
  document.getElementById('panel-edit-btn')?.addEventListener('click', () => {
    openEmployeeModal(emp.id);
    closeProfilePanel();
  });
  document.getElementById('panel-delete-btn')?.addEventListener('click', () => {
    handleDeleteEmployee(emp.id);
  });
}

function activateTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.querySelectorAll('.tab-pane').forEach((p, i) => p.classList.toggle('active', i === 0));
  void name;
}

async function handleDeleteEmployee(empId) {
  if (!confirm('Move this employee to Archived Employees?')) return;
  try {
    await deleteEmployee(empId);
    closeProfilePanel();
    await renderEmployeeTable(_getSearchQuery());
    renderArchivedEmployeesPage().catch(() => {});
    showToast('Moved to Archived Employees.', 'info', {
      actionLabel: 'Undo',
      duration: 8000,
      onAction: async () => {
        try {
          await restoreEmployee(empId);
          showToast('Employee restored as Inactive.', 'success');
          await renderEmployeeTable(_getSearchQuery());
          renderArchivedEmployeesPage().catch(() => {});
        } catch (err) {
          showToast(err instanceof ApiError ? err.message : 'Restore failed.', 'error');
        }
      },
    });
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : 'Archive failed.', 'error');
  }
}
