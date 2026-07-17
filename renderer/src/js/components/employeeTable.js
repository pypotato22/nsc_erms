import { listEmployees } from '../api/employees.js';
import { listDepartments, listEmploymentStatuses } from '../api/departments.js';
import { ApiError } from '../api/client.js';
import { getAvatarHTML, getStatusBadge, getEl, escapeHtml } from '../utils/helpers.js';
import { openProfilePanel } from './profilePanel.js';
import { showToast } from '../utils/toast.js';

const PAGE_SIZE = 12;
let _page = 1;
let _sort = 'name';
let _dir = 'asc';

export function initEmployeeTable() {
  getEl('filter-dept').addEventListener('change', () => {
    _page = 1;
    renderEmployeeTable(getEl('search-input')?.value || '').catch(showLoadError);
  });
  getEl('filter-status').addEventListener('change', () => {
    _page = 1;
    renderEmployeeTable(getEl('search-input')?.value || '').catch(showLoadError);
  });
  getEl('emp-prev')?.addEventListener('click', () => {
    if (_page <= 1) return;
    _page -= 1;
    renderEmployeeTable(getEl('search-input')?.value || '').catch(showLoadError);
  });
  getEl('emp-next')?.addEventListener('click', () => {
    _page += 1;
    renderEmployeeTable(getEl('search-input')?.value || '').catch(showLoadError);
  });

  document.querySelectorAll('#emp-table thead th[data-sort]').forEach((th) => {
    const activate = () => {
      const key = th.dataset.sort;
      if (!key) return;
      if (_sort === key) {
        _dir = _dir === 'asc' ? 'desc' : 'asc';
      } else {
        _sort = key;
        _dir = 'asc';
      }
      _page = 1;
      paintSortHeaders();
      renderEmployeeTable(getEl('search-input')?.value || '').catch(showLoadError);
    };
    th.addEventListener('click', activate);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });
  paintSortHeaders();
}

function paintSortHeaders() {
  document.querySelectorAll('#emp-table thead th[data-sort]').forEach((th) => {
    const active = th.dataset.sort === _sort;
    th.classList.toggle('is-sorted', active);
    th.setAttribute('aria-sort', active ? (_dir === 'asc' ? 'ascending' : 'descending') : 'none');
    const marker = th.querySelector('.sort-marker');
    if (marker) marker.textContent = active ? (_dir === 'asc' ? '▲' : '▼') : '';
  });
}

function showLoadError(err) {
  showToast(err instanceof ApiError ? err.message : 'Failed to load employees.', 'error');
}

export async function refreshFilterDropdowns() {
  const [{ departments }, { employmentStatuses }] = await Promise.all([
    listDepartments(),
    listEmploymentStatuses(),
  ]);

  const filterDept = getEl('filter-dept');
  const curDept = filterDept.value;
  filterDept.innerHTML =
    '<option value="">All Departments</option>' +
    departments
      .map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`)
      .join('');
  if ([...filterDept.options].some((o) => o.value === curDept)) {
    filterDept.value = curDept;
  }

  const filterStatus = getEl('filter-status');
  const curStatus = filterStatus.value;
  filterStatus.innerHTML =
    '<option value="">All Status</option>' +
    employmentStatuses
      .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
      .join('');
  if ([...filterStatus.options].some((o) => o.value === curStatus)) {
    filterStatus.value = curStatus;
  }
}

export function resetEmployeePage() {
  _page = 1;
}

export async function renderEmployeeTable(searchQuery = '') {
  const departmentId = getEl('filter-dept').value;
  const statusId = getEl('filter-status').value;
  const {
    employees,
    page,
    total,
    totalPages,
    sort,
    dir,
  } = await listEmployees({
    q: searchQuery,
    departmentId,
    statusId,
    page: _page,
    limit: PAGE_SIZE,
    sort: _sort,
    dir: _dir,
  });

  _page = page || 1;
  if (sort) _sort = sort;
  if (dir) _dir = dir;
  paintSortHeaders();

  const emptyEl = getEl('emp-empty');
  const tbody = getEl('emp-tbody');
  emptyEl.style.display = employees.length ? 'none' : 'block';
  const startNum = (page - 1) * PAGE_SIZE;
  tbody.innerHTML = employees
    .map((emp, i) => buildEmployeeRow(emp, startNum + i + 1))
    .join('');

  tbody.querySelectorAll('tr').forEach((row, i) => {
    const emp = employees[i];
    row.querySelector('[data-profile-trigger]')?.addEventListener('click', () => {
      openProfilePanel(emp.id);
    });
  });

  const badge = document.getElementById('emp-count-badge');
  if (badge) badge.textContent = String(total ?? employees.length);

  const info = getEl('emp-page-info');
  if (info) {
    info.textContent =
      total === 0
        ? 'No results'
        : `Page ${page} of ${totalPages} · ${total} employee(s)`;
  }
  const prev = getEl('emp-prev');
  const next = getEl('emp-next');
  if (prev) prev.disabled = page <= 1;
  if (next) next.disabled = page >= totalPages;
}

function buildEmployeeRow(emp, rowNumber) {
  const status = emp.assignment?.employmentStatusName || '—';
  return `
    <tr>
      <td style="color:var(--text-3);font-size:12px;font-family:'DM Mono',monospace;">${String(rowNumber).padStart(2, '0')}</td>
      <td style="cursor:pointer;" data-profile-trigger>
        <div style="display:flex;align-items:center;gap:10px;">
          ${getAvatarHTML(emp, 34, 12)}
          <div>
            <div style="font-weight:700;color:var(--blue-900);letter-spacing:-.2px;">${escapeHtml(emp.firstName)} ${escapeHtml(emp.lastName)}</div>
            <div style="font-size:11px;color:var(--text-3);">${escapeHtml(emp.email)}</div>
          </div>
        </div>
      </td>
      <td style="color:var(--text-2);font-size:12.5px;">${escapeHtml(emp.contactNumber || '—')}</td>
      <td style="font-weight:500;">${escapeHtml(emp.assignment?.positionName || '—')}</td>
      <td style="color:var(--text-2);">${escapeHtml(emp.assignment?.departmentName || '—')}</td>
      <td>${getStatusBadge(status)}</td>
    </tr>`;
}
