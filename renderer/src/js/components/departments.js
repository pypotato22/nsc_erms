import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listPositions,
  createPosition,
  updatePosition,
} from '../api/departments.js';
import { ApiError } from '../api/client.js';
import { getEl, setHTML, escapeHtml } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { refreshFilterDropdowns } from './employeeTable.js';
import { canWrite } from '../utils/authz.js';

const CHIP_LIMIT = 4;

let _editingDeptId = null;
/** @type {Array<object>} */
let _departmentsCache = [];
/** @type {{ id: string, name: string }[]} */
let _allPositions = [];
/** @type {Set<string>} */
let _selectedPositionIds = new Set();
/** @type {string|null} */
let _renamingPositionId = null;

export function initDepartments() {
  getEl('add-dept-btn').addEventListener('click', () => {
    openDeptModal(null).catch(showErr);
  });
  getEl('dept-modal-cancel').addEventListener('click', closeDeptModal);
  getEl('close-dept-modal').addEventListener('click', closeDeptModal);
  getEl('dept-modal-save').addEventListener('click', () => {
    saveDept().catch(showErr);
  });
  getEl('d-pos-add-btn')?.addEventListener('click', () => {
    addNewPosition().catch(showErr);
  });
  getEl('d-pos-new')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addNewPosition().catch(showErr);
    }
  });

  let filterTimer = null;
  getEl('dept-filter')?.addEventListener('input', () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => paintDepartmentTable(), 150);
  });
}

export async function renderDepartmentPage() {
  try {
    const { departments } = await listDepartments();
    _departmentsCache = departments || [];
    paintDepartmentTable();
  } catch (err) {
    showErr(err);
  }
}

function paintDepartmentTable() {
  const q = (getEl('dept-filter')?.value || '').trim().toLowerCase();
  const departments = q
    ? _departmentsCache.filter((d) => {
        const hay = `${d.name || ''} ${d.description || ''}`.toLowerCase();
        return hay.includes(q);
      })
    : _departmentsCache;

  const emptyEl = getEl('dept-empty');
  const tbody = getEl('dept-tbody');
  if (!tbody || !emptyEl) return;

  const writable = canWrite();

  if (!_departmentsCache.length) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    emptyEl.textContent = 'No departments yet.';
    return;
  }
  if (!departments.length) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    emptyEl.textContent = 'No departments match your search.';
    return;
  }

  emptyEl.style.display = 'none';
  tbody.innerHTML = departments
    .map((dept, i) => buildDeptRow(dept, i + 1, writable))
    .join('');

  tbody.querySelectorAll('[data-open-dept]').forEach((el) => {
    el.addEventListener('click', () => {
      openDeptModal(el.dataset.openDept).catch(showErr);
    });
  });
  tbody.querySelectorAll('[data-edit-dept]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openDeptModal(btn.dataset.editDept).catch(showErr);
    });
  });
  tbody.querySelectorAll('[data-delete-dept]').forEach((btn) => {
    btn.addEventListener('click', () => {
      handleDeleteDept(btn.dataset.deleteDept);
    });
  });
}

function buildDeptRow(dept, rowNumber, writable) {
  const positions = dept.positions || [];
  const count = dept.employeeCount ?? dept.employee_count ?? 0;
  const desc = (dept.description || '').trim();
  const shown = positions.slice(0, CHIP_LIMIT);
  const extra = positions.length - shown.length;

  let positionsCell;
  if (!positions.length) {
    positionsCell = writable
      ? `<button type="button" class="dept-link-pos" data-edit-dept="${dept.id}">Link positions</button>`
      : `<span class="dept-pos-empty">None</span>`;
  } else {
    const chips = shown
      .map((p) => `<span class="dept-pos-chip">${escapeHtml(p.name)}</span>`)
      .join('');
    const more =
      extra > 0
        ? `<span class="dept-pos-more" title="${escapeHtml(
            positions
              .slice(CHIP_LIMIT)
              .map((p) => p.name)
              .join(', '),
          )}">+${extra}</span>`
        : '';
    positionsCell = `<div class="dept-pos-list">${chips}${more}</div>`;
  }

  const nameCell = writable
    ? `<button type="button" class="dept-name-btn" data-open-dept="${dept.id}">
         <span class="dept-name">${escapeHtml(dept.name)}</span>
         ${desc ? `<span class="dept-desc">${escapeHtml(desc)}</span>` : ''}
       </button>`
    : `<div>
         <div class="dept-name">${escapeHtml(dept.name)}</div>
         ${desc ? `<div class="dept-desc">${escapeHtml(desc)}</div>` : ''}
       </div>`;

  const actions = writable
    ? `<td class="dept-actions">
         <button type="button" class="btn btn-sm btn-edit" data-edit-dept="${dept.id}">Edit</button>
         <button type="button" class="btn btn-sm btn-del" data-delete-dept="${dept.id}">Delete</button>
       </td>`
    : '<td></td>';

  return `
    <tr>
      <td class="dept-row-num">${String(rowNumber).padStart(2, '0')}</td>
      <td>${nameCell}</td>
      <td class="dept-count-cell">${count}</td>
      <td>${positionsCell}</td>
      ${actions}
    </tr>`;
}

async function openDeptModal(deptId = null) {
  _editingDeptId = deptId;
  _renamingPositionId = null;
  getEl('dept-modal-title').textContent = deptId ? 'Edit Department' : 'Add Department';
  getEl('d-pos-new').value = '';

  const [{ positions }, { departments }] = await Promise.all([
    listPositions(),
    listDepartments(),
  ]);
  _allPositions = positions.map((p) => ({ id: p.id, name: p.name }));
  _departmentsCache = departments || [];

  if (deptId) {
    const d = departments.find((x) => x.id === deptId);
    getEl('d-name').value = d?.name ?? '';
    getEl('d-desc').value = d?.description ?? '';
    _selectedPositionIds = new Set((d?.positions || []).map((p) => p.positionId));
  } else {
    getEl('d-name').value = '';
    getEl('d-desc').value = '';
    _selectedPositionIds = new Set();
  }

  renderPositionChecklist();
  getEl('dept-overlay').classList.add('open');
}

function closeDeptModal() {
  getEl('dept-overlay').classList.remove('open');
  _editingDeptId = null;
  _renamingPositionId = null;
  _selectedPositionIds = new Set();
}

function renderPositionChecklist() {
  const host = getEl('d-pos-list');
  if (!host) return;

  if (!_allPositions.length) {
    setHTML(
      'd-pos-list',
      `<div class="dept-pos-empty" style="padding:8px 0;">No positions in catalog yet. Add one below.</div>`,
    );
    return;
  }

  setHTML(
    'd-pos-list',
    _allPositions
      .map((p) => {
        const checked = _selectedPositionIds.has(p.id);
        const renaming = _renamingPositionId === p.id;
        if (renaming) {
          return `
          <div class="dept-pos-row" data-pos-id="${p.id}">
            <input type="checkbox" checked disabled aria-hidden="true" />
            <input type="text" class="dept-pos-rename-input" id="d-pos-rename-${p.id}" value="${escapeHtml(p.name)}" />
            <button type="button" class="btn btn-sm btn-primary" data-save-rename="${p.id}">Save</button>
            <button type="button" class="btn btn-sm btn-cancel" data-cancel-rename="${p.id}">Cancel</button>
          </div>`;
        }
        return `
        <label class="dept-pos-row">
          <input type="checkbox" data-pos-check="${p.id}" ${checked ? 'checked' : ''} />
          <span class="dept-pos-name">${escapeHtml(p.name)}</span>
          ${canWrite()
            ? `<button type="button" class="btn btn-sm btn-edit dept-pos-rename-btn" data-rename-pos="${p.id}">Rename</button>`
            : ''}
        </label>`;
      })
      .join(''),
  );

  host.querySelectorAll('[data-pos-check]').forEach((el) => {
    el.addEventListener('change', () => {
      const id = el.dataset.posCheck;
      if (el.checked) _selectedPositionIds.add(id);
      else _selectedPositionIds.delete(id);
    });
  });

  host.querySelectorAll('[data-rename-pos]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      _renamingPositionId = btn.dataset.renamePos;
      renderPositionChecklist();
      getEl(`d-pos-rename-${_renamingPositionId}`)?.focus();
    });
  });

  host.querySelectorAll('[data-cancel-rename]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      _renamingPositionId = null;
      renderPositionChecklist();
    });
  });

  host.querySelectorAll('[data-save-rename]').forEach((btn) => {
    btn.addEventListener('click', () => {
      saveRename(btn.dataset.saveRename).catch(showErr);
    });
  });
}

async function saveRename(positionId) {
  const input = getEl(`d-pos-rename-${positionId}`);
  const name = input?.value.trim();
  if (!name) {
    showToast('Position name is required.', 'error');
    return;
  }
  const { position } = await updatePosition(positionId, { name });
  const idx = _allPositions.findIndex((p) => p.id === positionId);
  if (idx >= 0) _allPositions[idx] = { id: position.id, name: position.name };
  _allPositions.sort((a, b) => a.name.localeCompare(b.name));
  _renamingPositionId = null;
  renderPositionChecklist();
  showToast('Position renamed.', 'success');
}

async function addNewPosition() {
  const input = getEl('d-pos-new');
  const name = input.value.trim();
  if (!name) {
    showToast('Enter a position name to add.', 'error');
    return;
  }
  const { position } = await createPosition({ name });
  if (!_allPositions.some((p) => p.id === position.id)) {
    _allPositions.push({ id: position.id, name: position.name });
    _allPositions.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const idx = _allPositions.findIndex((p) => p.id === position.id);
    if (idx >= 0) _allPositions[idx].name = position.name;
  }
  _selectedPositionIds.add(position.id);
  input.value = '';
  renderPositionChecklist();
  showToast(`Position “${position.name}” added and selected.`, 'success');
}

async function saveDept() {
  const name = getEl('d-name').value.trim();
  if (!name) {
    showToast('Department name is required.', 'error');
    return;
  }
  const data = {
    name,
    description: getEl('d-desc').value.trim(),
    positionIds: [..._selectedPositionIds],
  };
  if (_editingDeptId) {
    await updateDepartment(_editingDeptId, data);
    showToast('Department updated.', 'success');
  } else {
    await createDepartment(data);
    showToast('Department added.', 'success');
  }
  closeDeptModal();
  await renderDepartmentPage();
  await refreshFilterDropdowns();
}

async function handleDeleteDept(deptId) {
  if (!confirm('Delete this department?')) return;
  try {
    await deleteDepartment(deptId);
    await renderDepartmentPage();
    await refreshFilterDropdowns();
    showToast('Department deleted.', 'success');
  } catch (err) {
    showErr(err);
  }
}

function showErr(err) {
  showToast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error');
}
