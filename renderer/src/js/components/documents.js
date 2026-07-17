import {
  listEmployeeDocuments,
  listDocumentTypes,
  uploadEmployeeDocument,
  deleteDocument,
  restoreDocument,
  downloadDocumentUrl,
} from '../api/documents.js';
import { getEl, setHTML, escapeHtml, formatFileSize } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { refreshPanelHeader } from './profilePanel.js';

let _emp = null;
let _documentTypes = [];
let _preselectTypeId = '';

export function initDocuments() {
  getEl('close-doc-modal').addEventListener('click', closeUploadModal);
  getEl('doc-modal-cancel').addEventListener('click', closeUploadModal);
  getEl('doc-modal-save').addEventListener('click', () => {
    submitUpload().catch((err) => {
      getEl('doc-err').textContent = err.message || 'Upload failed.';
    });
  });
  getEl('doc-file').addEventListener('change', onFilePicked);
}

export async function renderTabDocs(emp) {
  _emp = emp;
  setHTML(
    'tab-docs',
    `<div class="empty" style="padding:20px 0">Loading 201 File…</div>`,
  );

  try {
    const [{ documents, checklist }, { documentTypes }] = await Promise.all([
      listEmployeeDocuments(emp.id),
      listDocumentTypes(),
    ]);
    _documentTypes = documentTypes;

    const recommended = checklist.filter((c) => c.isRequired);
    const onFile = recommended.filter((c) => c.satisfied).length;
    const stillRecommended = recommended.length - onFile;

    const checklistHtml = recommended.length
      ? `<div class="doc-checklist" style="margin-bottom:14px;">
          <div style="font-size:12px;color:var(--text-2);margin-bottom:8px;">
            Recommended docs: ${onFile}/${recommended.length} on file
            ${stillRecommended
              ? `<span style="color:var(--blue-700);"> · ${stillRecommended} recommended</span>`
              : '<span style="color:var(--success);"> · complete</span>'}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${recommended
              .map((c) =>
                c.satisfied
                  ? `<span class="ph-badge" style="background:rgba(13,147,115,.12);color:var(--success)">${escapeHtml(c.name)} ✓</span>`
                  : `<button type="button" class="ph-badge doc-rec-chip" data-rec-type="${c.id}" style="background:rgba(46,111,255,.1);color:var(--blue-700);border:none;cursor:pointer;">${escapeHtml(c.name)} · recommended</button>`,
              )
              .join('')}
          </div>
        </div>`
      : '';

    const docsHtml = documents.length
      ? documents.map((doc) => buildDocRow(doc)).join('')
      : '<div class="empty" style="padding:20px 0">No documents on file yet.</div>';

    setHTML(
      'tab-docs',
      `
      ${checklistHtml}
      <div class="file-toolbar" style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
        <button type="button" class="fab fab-upload" id="doc-open-upload">Upload document</button>
      </div>
      <p style="font-size:12px;color:var(--text-3);margin-bottom:12px;">
        ${documents.length} file(s) · sorted by most recent · multiple versions allowed per type
      </p>
      <div class="doc-list">${docsHtml}</div>`,
    );

    getEl('doc-open-upload').addEventListener('click', () => openUploadModal());

    document.querySelectorAll('[data-rec-type]').forEach((btn) => {
      btn.addEventListener('click', () => openUploadModal(btn.dataset.recType));
    });

    document.querySelectorAll('[data-download-doc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.open(downloadDocumentUrl(btn.dataset.downloadDoc), '_blank');
      });
    });

    document.querySelectorAll('[data-delete-doc]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Move this document to Trash?')) return;
        const docId = btn.dataset.deleteDoc;
        try {
          const result = await deleteDocument(docId);
          await renderTabDocs(emp);
          refreshPanelHeader();
          showToast('Moved to Trash.', 'info', {
            actionLabel: 'Undo',
            duration: 8000,
            onAction: async () => {
              try {
                await restoreDocument(docId);
                showToast('Document restored.', 'success');
                await renderTabDocs(emp);
                refreshPanelHeader();
              } catch (err) {
                showToast(err.message || 'Restore failed.', 'error');
              }
            },
          });
          void result;
        } catch (err) {
          showToast(err.message || 'Delete failed.', 'error');
        }
      });
    });
  } catch (err) {
    setHTML(
      'tab-docs',
      `<div class="empty" style="padding:20px 0;color:var(--error)">${escapeHtml(err.message || 'Failed to load documents')}</div>`,
    );
  }
}

function openUploadModal(preselectTypeId = '') {
  if (!_emp) return;
  _preselectTypeId = preselectTypeId || '';
  getEl('doc-err').textContent = '';
  getEl('doc-file').value = '';
  getEl('doc-file-meta').textContent = '';
  getEl('doc-display-name').value = '';
  getEl('doc-issued').value = '';
  getEl('doc-expiry').value = '';
  getEl('doc-remarks').value = '';

  const typeEl = getEl('doc-type');
  typeEl.innerHTML =
    '<option value="">Select type</option>' +
    _documentTypes
      .map(
        (t) =>
          `<option value="${t.id}">${escapeHtml(t.name)}${t.isRequired ? ' (recommended)' : ''}</option>`,
      )
      .join('');
  if (_preselectTypeId) typeEl.value = _preselectTypeId;

  getEl('doc-overlay').classList.add('open');
}

function closeUploadModal() {
  getEl('doc-overlay').classList.remove('open');
}

function onFilePicked() {
  const file = getEl('doc-file').files?.[0];
  if (!file) {
    getEl('doc-file-meta').textContent = '';
    return;
  }
  getEl('doc-file-meta').textContent = `${file.name} · ${formatFileSize(file.size)}`;
  const nameInput = getEl('doc-display-name');
  if (!nameInput.value.trim()) {
    // Default display name without extension (user can rename)
    const base = file.name.includes('.')
      ? file.name.slice(0, file.name.lastIndexOf('.'))
      : file.name;
    nameInput.value = base;
  }
}

async function submitUpload() {
  const errEl = getEl('doc-err');
  const btn = getEl('doc-modal-save');
  errEl.textContent = '';

  const file = getEl('doc-file').files?.[0];
  const displayName = getEl('doc-display-name').value.trim();
  const documentTypeId = getEl('doc-type').value;
  const issuedDate = getEl('doc-issued').value;
  const expiryDate = getEl('doc-expiry').value;
  const remarks = getEl('doc-remarks').value.trim();

  if (!file) {
    errEl.textContent = 'Choose a file to upload.';
    return;
  }
  if (!displayName) {
    errEl.textContent = 'Display name is required.';
    return;
  }
  if (!documentTypeId) {
    errEl.textContent = 'Document type is required.';
    return;
  }
  if (issuedDate && expiryDate && expiryDate < issuedDate) {
    errEl.textContent = 'Expiry date must be on or after issued date.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Uploading…';
  try {
    await uploadEmployeeDocument(_emp.id, {
      file,
      displayName,
      documentTypeId,
      issuedDate,
      expiryDate,
      remarks,
    });
    closeUploadModal();
    showToast('Document uploaded.', 'success');
    await renderTabDocs(_emp);
    refreshPanelHeader();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload';
  }
}

function buildDocRow(doc) {
  const when = doc.uploadedAt
    ? new Date(doc.uploadedAt).toLocaleString('en-PH')
    : '—';
  const size =
    typeof doc.fileSize === 'number' ? formatFileSize(doc.fileSize) : doc.fileSize;
  const dates = [
    doc.issuedDate ? `Issued ${String(doc.issuedDate).slice(0, 10)}` : null,
    doc.expiryDate ? `Expires ${String(doc.expiryDate).slice(0, 10)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return `
    <div class="doc-item">
      <div class="doc-icon di-pdf"></div>
      <div class="doc-info">
        <div class="doc-name">
          ${escapeHtml(doc.fileName)}
          <span style="font-size:10px;background:var(--bg-subtle);color:var(--blue-700);padding:1px 7px;border-radius:99px;font-weight:700;margin-left:5px;">v${doc.versionNumber}</span>
          <span style="font-size:10px;background:#eef2ff;color:#3730a3;padding:1px 7px;border-radius:99px;font-weight:700;margin-left:4px;">${escapeHtml(doc.documentTypeName)}</span>
        </div>
        <div class="doc-meta">${escapeHtml(size)} · ${escapeHtml(when)}${dates ? ` · ${escapeHtml(dates)}` : ''}${doc.remarks ? ` · ${escapeHtml(doc.remarks)}` : ''}</div>
      </div>
      <div class="doc-acts">
        <button class="dbtn dbtn-print" data-download-doc="${doc.id}">Download</button>
        <button class="dbtn dbtn-del" data-delete-doc="${doc.id}">Remove</button>
      </div>
    </div>`;
}
