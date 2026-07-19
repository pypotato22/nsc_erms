import {
  listArchivedEmployees,
  restoreEmployee,
  permanentDeleteEmployee,
} from '../api/employees.js';
import { ApiError } from '../api/client.js';
import { getEl, setHTML, escapeHtml, getAvatarHTML } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { canWrite } from '../utils/authz.js';
import { renderEmployeeTable } from './employeeTable.js';

const PAGE_SIZE = 25;
let _page = 1;
let _getSearchQuery = () => '';

export function initArchivedEmployees(getSearchQuery) {
  if (typeof getSearchQuery === 'function') {
    _getSearchQuery = getSearchQuery;
  }
  getEl('archived-employees-refresh')?.addEventListener('click', () => {
    _page = 1;
    renderArchivedEmployeesPage().catch(showErr);
  });
  getEl('archived-employees-prev')?.addEventListener('click', () => {
    if (_page <= 1) return;
    _page -= 1;
    renderArchivedEmployeesPage().catch(showErr);
  });
  getEl('archived-employees-next')?.addEventListener('click', () => {
    _page += 1;
    renderArchivedEmployeesPage().catch(showErr);
  });
}

export async function renderArchivedEmployeesPage() {
  setHTML('archived-employees-list', '<div class="empty">Loading archived employees…</div>');
  try {
    const { employees, page, total, totalPages } = await listArchivedEmployees({
      page: _page,
      limit: PAGE_SIZE,
    });
    _page = page || 1;

    const badge = document.getElementById('archived-employees-badge');
    if (badge) badge.textContent = String(total ?? employees.length);

    const info = getEl('archived-employees-page-info');
    if (info) {
      info.textContent =
        total === 0
          ? 'No archived employees'
          : `Page ${page} of ${totalPages} · ${total} employee(s)`;
    }
    const prev = getEl('archived-employees-prev');
    const next = getEl('archived-employees-next');
    if (prev) prev.disabled = !total || page <= 1;
    if (next) next.disabled = !total || page >= totalPages;

    if (!employees.length) {
      setHTML(
        'archived-employees-list',
        `<div class="empty" style="padding:28px 0;text-align:center;">
          <p style="font-weight:600;margin-bottom:6px;">No archived employees</p>
          <p style="font-size:0.8571rem;color:var(--text-3);">Soft-deleted employees appear here. Restore returns them to the Employees list as Inactive, or delete forever.</p>
        </div>`,
      );
      return;
    }

    setHTML(
      'archived-employees-list',
      employees
        .map((emp) => {
          const when = emp.deletedAt
            ? new Date(emp.deletedAt).toLocaleString('en-PH')
            : '—';
          const docs = Number(emp.documentCount) || 0;
          const empNo = emp.employeeNo
            ? `<span style="font-size:0.7143rem;background:var(--bg-subtle);color:var(--blue-700);padding:1px 7px;border-radius:99px;font-weight:700;margin-left:5px;">${escapeHtml(emp.employeeNo)}</span>`
            : '';
          return `
        <div class="bk-item" style="align-items:flex-start;">
          <div style="display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0;">
            ${getAvatarHTML(emp, 36, 12)}
            <div style="min-width:0;flex:1;">
              <div class="bk-name">${escapeHtml(emp.lastName || '')}, ${escapeHtml(emp.firstName || '')}${empNo}
              </div>
              <div class="bk-meta">
                ${escapeHtml(emp.email || '—')}
                · ${docs} document(s)
                · archived ${escapeHtml(when)}
              </div>
            </div>
          </div>
          <div class="bk-acts">
            ${canWrite()
              ? `<button class="btn btn-sm btn-edit" data-archive-restore="${emp.id}">Restore</button>
            <button class="btn btn-sm btn-del" data-archive-purge="${emp.id}">Delete forever</button>`
              : '<span style="font-size:0.7857rem;color:var(--text-3);">View only</span>'}
          </div>
        </div>`;
        })
        .join(''),
    );

    document.querySelectorAll('[data-archive-restore]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await restoreEmployee(btn.dataset.archiveRestore);
          showToast('Employee restored as Inactive.', 'success');
          await renderArchivedEmployeesPage();
          renderEmployeeTable(_getSearchQuery()).catch(() => {});
        } catch (err) {
          showErr(err);
        }
      });
    });

    document.querySelectorAll('[data-archive-purge]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (
          !confirm(
            'Permanently delete this employee, all 201 File documents, and photo files from disk? This cannot be undone.',
          )
        ) {
          return;
        }
        try {
          await permanentDeleteEmployee(btn.dataset.archivePurge);
          showToast('Employee permanently deleted.', 'success');
          await renderArchivedEmployeesPage();
        } catch (err) {
          showErr(err);
        }
      });
    });
  } catch (err) {
    setHTML(
      'archived-employees-list',
      `<div class="empty" style="color:var(--error)">${escapeHtml(err.message || 'Failed to load archived employees')}</div>`,
    );
  }
}

function showErr(err) {
  showToast(err instanceof ApiError ? err.message : err.message || 'Error', 'error');
}
