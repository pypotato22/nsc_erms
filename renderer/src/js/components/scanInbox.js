import {
  listScanInbox,
  assignScanInboxFile,
  rejectScanInboxFile,
} from '../api/scanInbox.js';
import { listEmployees } from '../api/employees.js';
import { listDocumentTypes } from '../api/documents.js';
import { ApiError } from '../api/client.js';
import { getEl, setHTML, escapeHtml, formatFileSize } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { canWrite } from '../utils/authz.js';

let _pendingFileName = '';
let _documentTypes = [];

export function initScanInbox() {
  getEl('scan-inbox-refresh')?.addEventListener('click', () => {
    renderScanInboxPage().catch(showErr);
  });
  getEl('close-scan-assign-modal')?.addEventListener('click', closeAssignModal);
  getEl('scan-assign-cancel')?.addEventListener('click', closeAssignModal);
  getEl('scan-assign-save')?.addEventListener('click', () => {
    submitAssign().catch((err) => {
      getEl('scan-assign-err').textContent = err.message || 'Assign failed.';
    });
  });
}

export async function renderScanInboxPage() {
  setHTML('scan-inbox-list', '<div class="empty">Loading inbox…</div>');
  try {
    const { inboxPath, files } = await listScanInbox();
    const pathEl = document.getElementById('scan-inbox-path');
    if (pathEl) pathEl.textContent = inboxPath;

    const badge = document.getElementById('scan-inbox-badge');
    if (badge) badge.textContent = String(files.length);

    if (!files.length) {
      setHTML(
        'scan-inbox-list',
        `<div class="empty" style="padding:28px 0;text-align:center;">
          <p style="font-weight:600;margin-bottom:8px;">Inbox is empty</p>
          <p style="font-size:12px;color:var(--text-3);max-width:420px;margin:0 auto;">
            Drop scanned PDFs/images into the inbox folder (or use Epson scan-to-folder when available).
            Then refresh and assign each file to an employee 201 File.
          </p>
        </div>`,
      );
      return;
    }

    setHTML(
      'scan-inbox-list',
      files
        .map(
          (f) => `
        <div class="bk-item" style="align-items:center;">
          <div style="flex:1;min-width:0;">
            <div class="bk-name">${escapeHtml(f.name)}</div>
            <div class="bk-meta">
              ${formatFileSize(f.size)} · ${new Date(f.modifiedAt).toLocaleString('en-PH')}
              ${f.tooLarge ? ' · <span style="color:var(--error)">too large</span>' : ''}
            </div>
          </div>
          <div class="bk-acts">
            ${canWrite()
              ? `<button class="btn btn-sm btn-edit" data-assign-scan="${encodeURIComponent(f.name)}" ${f.tooLarge ? 'disabled' : ''}>Assign</button>
            <button class="btn btn-sm btn-del" data-reject-scan="${encodeURIComponent(f.name)}">Reject</button>`
              : '<span style="font-size:11px;color:var(--text-3);">View only</span>'}
          </div>
        </div>`,
        )
        .join(''),
    );

    document.querySelectorAll('[data-assign-scan]').forEach((btn) => {
      btn.addEventListener('click', () => openAssignModal(decodeURIComponent(btn.dataset.assignScan)));
    });
    document.querySelectorAll('[data-reject-scan]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const name = decodeURIComponent(btn.dataset.rejectScan);
        if (!confirm(`Reject "${name}"? File moves to inbox/failed.`)) return;
        try {
          await rejectScanInboxFile(name, 'Rejected from Scan Inbox UI');
          showToast('File rejected.', 'success');
          await renderScanInboxPage();
        } catch (err) {
          showErr(err);
        }
      });
    });
  } catch (err) {
    setHTML(
      'scan-inbox-list',
      `<div class="empty" style="color:var(--error)">${escapeHtml(err.message || 'Failed to load inbox')}</div>`,
    );
  }
}

async function openAssignModal(fileName) {
  _pendingFileName = fileName;
  getEl('scan-assign-err').textContent = '';
  getEl('scan-assign-file').textContent = fileName;
  getEl('scan-assign-display').value = fileName.includes('.')
    ? fileName.slice(0, fileName.lastIndexOf('.'))
    : fileName;
  getEl('scan-assign-issued').value = '';
  getEl('scan-assign-expiry').value = '';
  getEl('scan-assign-remarks').value = '';

  const [{ employees }, { documentTypes }] = await Promise.all([
    listEmployees({ all: true }),
    listDocumentTypes(),
  ]);
  _documentTypes = documentTypes;

  const empEl = getEl('scan-assign-employee');
  empEl.innerHTML =
    '<option value="">Select employee</option>' +
    employees
      .map(
        (e) =>
          `<option value="${e.id}">${escapeHtml(e.lastName)}, ${escapeHtml(e.firstName)} (${escapeHtml(e.employeeNo)})</option>`,
      )
      .join('');

  const typeEl = getEl('scan-assign-type');
  typeEl.innerHTML =
    '<option value="">Select type</option>' +
    documentTypes
      .map(
        (t) =>
          `<option value="${t.id}">${escapeHtml(t.name)}${t.isRequired ? ' (recommended)' : ''}</option>`,
      )
      .join('');

  getEl('scan-assign-overlay').classList.add('open');
}

function closeAssignModal() {
  getEl('scan-assign-overlay').classList.remove('open');
  _pendingFileName = '';
}

async function submitAssign() {
  const errEl = getEl('scan-assign-err');
  const btn = getEl('scan-assign-save');
  errEl.textContent = '';

  const employeeId = getEl('scan-assign-employee').value;
  const documentTypeId = getEl('scan-assign-type').value;
  const displayName = getEl('scan-assign-display').value.trim();
  const issuedDate = getEl('scan-assign-issued').value;
  const expiryDate = getEl('scan-assign-expiry').value;
  const remarks = getEl('scan-assign-remarks').value.trim();

  if (!employeeId || !documentTypeId || !displayName) {
    errEl.textContent = 'Employee, document type, and display name are required.';
    return;
  }
  if (issuedDate && expiryDate && expiryDate < issuedDate) {
    errEl.textContent = 'Expiry date must be on or after issued date.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Assigning…';
  try {
    const result = await assignScanInboxFile(_pendingFileName, {
      employeeId,
      documentTypeId,
      displayName,
      issuedDate,
      expiryDate,
      remarks,
    });
    closeAssignModal();
    showToast(`Assigned as v${result.versionNumber}.`, 'success');
    await renderScanInboxPage();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Assign to 201 File';
  }
}

function showErr(err) {
  showToast(err instanceof ApiError ? err.message : err.message || 'Error', 'error');
}
