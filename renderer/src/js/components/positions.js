import {
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
} from '../api/positions.js';
import { ApiError } from '../api/client.js';
import { getEl, escapeHtml } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { canWrite } from '../utils/authz.js';

/** @type {Array<object>} */
let _cache = [];
let _editingId = null;

export function initPositions() {
  getEl('add-position-btn')?.addEventListener('click', () => openPositionModal(null));
  getEl('close-pos-modal')?.addEventListener('click', closePositionModal);
  getEl('pos-modal-cancel')?.addEventListener('click', closePositionModal);
  getEl('pos-modal-save')?.addEventListener('click', () => {
    savePosition().catch(showErr);
  });
  let t = null;
  getEl('pos-filter')?.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => paintPositionTable(), 150);
  });
}

export async function renderPositionsPage() {
  try {
    const { positions } = await listPositions();
    _cache = positions || [];
    paintPositionTable();
  } catch (err) {
    showErr(err);
  }
}

function paintPositionTable() {
  const q = (getEl('pos-filter')?.value || '').trim().toLowerCase();
  const rows = q
    ? _cache.filter((p) => String(p.name || '').toLowerCase().includes(q))
    : _cache;

  const emptyEl = getEl('pos-empty');
  const tbody = getEl('pos-tbody');
  if (!tbody || !emptyEl) return;

  const writable = canWrite();

  if (!_cache.length) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    emptyEl.textContent = 'No positions in the catalog yet. Add one to use when linking departments.';
    return;
  }
  if (!rows.length) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    emptyEl.textContent = 'No positions match your search.';
    return;
  }

  emptyEl.style.display = 'none';
  tbody.innerHTML = rows
    .map((p, i) => buildPositionRow(p, i + 1, writable))
    .join('');

  tbody.querySelectorAll('[data-open-pos]').forEach((el) => {
    el.addEventListener('click', () => openPositionModal(el.dataset.openPos));
  });
  tbody.querySelectorAll('[data-edit-pos]').forEach((btn) => {
    btn.addEventListener('click', () => openPositionModal(btn.dataset.editPos));
  });
  tbody.querySelectorAll('[data-del-pos]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removePosition(btn.dataset.delPos).catch(showErr);
    });
  });
}

function buildPositionRow(p, rowNumber, writable) {
  const depts = p.departmentCount ?? 0;
  const emps = p.employeeCount ?? 0;

  const nameCell = writable
    ? `<button type="button" class="dept-name-btn" data-open-pos="${p.id}">
         <span class="dept-name">${escapeHtml(p.name)}</span>
       </button>`
    : `<div class="dept-name">${escapeHtml(p.name)}</div>`;

  const actions = writable
    ? `<td class="dept-actions">
         <button type="button" class="btn btn-sm btn-edit" data-edit-pos="${p.id}">Rename</button>
         <button type="button" class="btn btn-sm btn-del" data-del-pos="${p.id}">Remove</button>
       </td>`
    : '<td></td>';

  return `
    <tr>
      <td class="dept-row-num">${String(rowNumber).padStart(2, '0')}</td>
      <td>${nameCell}</td>
      <td class="dept-count-cell">${emps}</td>
      <td class="dept-count-cell">${depts}</td>
      ${actions}
    </tr>`;
}

function openPositionModal(id) {
  _editingId = id;
  const p = id ? _cache.find((x) => x.id === id) : null;
  getEl('pos-modal-title').textContent = id ? 'Rename Position' : 'Add Position';
  getEl('p-name').value = p?.name || '';
  getEl('pos-overlay').classList.add('open');
  getEl('p-name')?.focus();
}

function closePositionModal() {
  getEl('pos-overlay').classList.remove('open');
  _editingId = null;
}

async function savePosition() {
  const name = getEl('p-name').value.trim();
  if (!name) {
    showToast('Position name is required.', 'error');
    return;
  }
  if (_editingId) {
    await updatePosition(_editingId, { name });
    showToast('Position renamed.', 'success');
  } else {
    await createPosition({ name });
    showToast('Position added.', 'success');
  }
  closePositionModal();
  await renderPositionsPage();
}

async function removePosition(id) {
  const p = _cache.find((x) => x.id === id);
  if (
    !confirm(
      `Remove “${p?.name || 'this position'}” from the catalog?\n\nIt will also unlink from departments. Blocked if employees still hold it.`,
    )
  ) {
    return;
  }
  await deletePosition(id);
  showToast('Position removed.', 'success');
  await renderPositionsPage();
}

function showErr(err) {
  showToast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error');
}
