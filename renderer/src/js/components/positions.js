import {
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
} from '../api/positions.js';
import { ApiError } from '../api/client.js';
import { getEl, setHTML, escapeHtml } from '../utils/helpers.js';
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
    t = setTimeout(() => paintGrid(), 150);
  });
}

export async function renderPositionsPage() {
  try {
    const { positions } = await listPositions();
    _cache = positions || [];
    paintGrid();
  } catch (err) {
    showErr(err);
  }
}

function paintGrid() {
  const q = (getEl('pos-filter')?.value || '').trim().toLowerCase();
  const rows = q
    ? _cache.filter((p) => String(p.name || '').toLowerCase().includes(q))
    : _cache;

  if (!_cache.length) {
    setHTML(
      'pos-grid',
      '<div class="empty">No positions in the catalog yet. Add one to use when linking departments.</div>',
    );
    return;
  }
  if (!rows.length) {
    setHTML('pos-grid', '<div class="empty">No positions match your search.</div>');
    return;
  }

  const writable = canWrite();
  setHTML(
    'pos-grid',
    rows
      .map((p) => {
        const depts = p.departmentCount ?? 0;
        const emps = p.employeeCount ?? 0;
        const initial = (p.name || '?').trim().charAt(0).toUpperCase() || '?';
        const actions = writable
          ? `<div class="dept-card-actions">
              <button type="button" class="btn btn-sm btn-edit" data-edit-pos="${p.id}">Rename</button>
              <button type="button" class="btn btn-sm btn-del" data-del-pos="${p.id}">Remove</button>
            </div>`
          : '';
        return `
      <div class="dept-card${writable ? ' dept-card--interactive' : ''}"
           ${writable ? `data-open-pos="${p.id}" role="button" tabindex="0"` : ''}>
        <div class="dept-card-top">
          <div class="dept-card-initial" aria-hidden="true">${escapeHtml(initial)}</div>
          <div class="dept-card-heading">
            <h4>${escapeHtml(p.name)}</h4>
            <div class="dept-meta">
              <span class="dept-emp-count">${emps} employee${emps === 1 ? '' : 's'}</span>
              <span class="dept-meta-sep">·</span>
              <span class="dept-pos-count">in ${depts} department${depts === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>
        ${actions}
      </div>`;
      })
      .join(''),
  );

  document.querySelectorAll('[data-open-pos]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openPositionModal(card.dataset.openPos);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPositionModal(card.dataset.openPos);
      }
    });
  });
  document.querySelectorAll('[data-edit-pos]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPositionModal(btn.dataset.editPos);
    });
  });
  document.querySelectorAll('[data-del-pos]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removePosition(btn.dataset.delPos).catch(showErr);
    });
  });
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
