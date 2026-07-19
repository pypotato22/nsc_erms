import {
  listEmployeeDocuments,
  listDocumentTypes,
  uploadEmployeeDocument,
  deleteDocument,
  restoreDocument,
  downloadDocumentUrl,
} from '../api/documents.js';
import { listScanInbox, assignScanInboxFile } from '../api/scanInbox.js';
import { getEl, setHTML, escapeHtml, formatFileSize } from '../utils/helpers.js';
import { printDocument } from '../utils/printDocument.js';
import { showToast } from '../utils/toast.js';
import { refreshPanelHeader } from './profilePanel.js';
import { canWrite } from '../utils/authz.js';

let _emp = null;
let _documentTypes = [];
let _preselectTypeId = '';
/** @type {Array<object>} */
let _inboxFiles = [];

const ALLOWED_DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);
const ALLOWED_DOC_EXT = /\.(pdf|doc|docx|jpe?g|png)$/i;

export function initDocuments() {
  getEl('close-doc-modal').addEventListener('click', closeUploadModal);
  getEl('doc-modal-cancel').addEventListener('click', closeUploadModal);
  getEl('doc-modal-save').addEventListener('click', () => {
    submitUpload().catch((err) => {
      getEl('doc-err').textContent = err.message || 'Upload failed.';
    });
  });
  getEl('doc-file').addEventListener('change', onFilePicked);

  getEl('close-doc-inbox-modal')?.addEventListener('click', closeInboxModal);
  getEl('doc-inbox-cancel')?.addEventListener('click', closeInboxModal);
  getEl('doc-inbox-save')?.addEventListener('click', () => {
    submitInboxAttach().catch((err) => {
      getEl('doc-inbox-err').textContent = err.message || 'Attach failed.';
    });
  });
  getEl('doc-inbox-file')?.addEventListener('change', onInboxFilePicked);

  wireDocDropZone();
}

function wireDocDropZone() {
  const zone = getEl('tab-docs');
  if (!zone || zone.dataset.dropWired) return;
  zone.dataset.dropWired = '1';

  zone.addEventListener('dragenter', (e) => {
    if (!canWrite() || !hasFileDrag(e)) return;
    e.preventDefault();
    zone.classList.add('doc-drop-active');
  });
  zone.addEventListener('dragover', (e) => {
    if (!canWrite() || !hasFileDrag(e)) return;
    e.preventDefault();
    zone.classList.add('doc-drop-active');
  });
  zone.addEventListener('dragleave', (e) => {
    if (e.currentTarget === zone && !zone.contains(e.relatedTarget)) {
      zone.classList.remove('doc-drop-active');
    }
  });
  zone.addEventListener('drop', (e) => {
    zone.classList.remove('doc-drop-active');
    if (!canWrite()) return;
    e.preventDefault();
    e.stopPropagation();
    const file = pickDroppedFile(e.dataTransfer?.files);
    if (!file) {
      showToast('Drop a PDF, Word doc, or image (JPG/PNG).', 'error');
      return;
    }
    if (!_emp) {
      showToast('Open an employee 201 File tab first.', 'info');
      return;
    }
    openUploadModal('', file);
  });
}

function hasFileDrag(e) {
  return [...(e.dataTransfer?.types || [])].includes('Files');
}

function pickDroppedFile(fileList) {
  if (!fileList?.length) return null;
  for (const file of fileList) {
    if (isAllowedDocFile(file)) return file;
  }
  return null;
}

function isAllowedDocFile(file) {
  if (ALLOWED_DOC_EXT.test(file.name || '')) return true;
  if (file.type && ALLOWED_DOC_MIMES.has(file.type)) return true;
  return false;
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
          <div style="font-size:0.8571rem;color:var(--text-2);margin-bottom:8px;">
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
                  : canWrite()
                    ? `<button type="button" class="ph-badge doc-rec-chip" data-rec-type="${c.id}" style="background:rgba(46,111,255,.1);color:var(--blue-700);border:none;cursor:pointer;">${escapeHtml(c.name)} · recommended</button>`
                    : `<span class="ph-badge" style="background:rgba(46,111,255,.1);color:var(--blue-700);">${escapeHtml(c.name)} · recommended</span>`,
              )
              .join('')}
          </div>
        </div>`
      : '';

    const docsHtml = documents.length
      ? documents.map((doc) => buildDocRow(doc)).join('')
      : '<div class="empty" style="padding:20px 0">No documents on file yet.</div>';

    const uploadToolbar = canWrite()
      ? `<div class="file-toolbar" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
        <button type="button" class="fab fab-upload" id="doc-open-upload">Upload document</button>
        <button type="button" class="btn btn-sm btn-edit" id="doc-open-inbox">Attach from inbox</button>
      </div>`
      : '';

    setHTML(
      'tab-docs',
      `
      ${checklistHtml}
      ${uploadToolbar}
      <p style="font-size:0.8571rem;color:var(--text-3);margin-bottom:12px;">
        ${documents.length} file(s) · sorted by most recent · multiple versions allowed per type
        ${canWrite() ? ' · drag & drop files here to upload' : ''}
      </p>
      <div class="doc-list">${docsHtml}</div>`,
    );

    getEl('doc-open-upload')?.addEventListener('click', () => openUploadModal());
    getEl('doc-open-inbox')?.addEventListener('click', () => {
      openInboxModal().catch((err) => {
        showToast(err.message || 'Failed to load inbox.', 'error');
      });
    });

    document.querySelectorAll('[data-rec-type]').forEach((btn) => {
      btn.addEventListener('click', () => openUploadModal(btn.dataset.recType));
    });

    document.querySelectorAll('[data-download-doc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.open(downloadDocumentUrl(btn.dataset.downloadDoc), '_blank');
      });
    });

    document.querySelectorAll('[data-print-doc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        printDocument(
          btn.dataset.printDoc,
          btn.dataset.printMime || '',
          btn.dataset.printName || '',
        ).catch((err) => {
          showToast(err.message || 'Print failed.', 'error');
        });
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

function openUploadModal(preselectTypeId = '', droppedFile = null) {
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

  if (droppedFile) applyPickedFile(droppedFile);

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
  applyPickedFile(file);
}

function applyPickedFile(file) {
  const input = getEl('doc-file');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  getEl('doc-file-meta').textContent = `${file.name} · ${formatFileSize(file.size)}`;
  const nameInput = getEl('doc-display-name');
  if (!nameInput.value.trim()) {
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

async function openInboxModal(preselectTypeId = '') {
  if (!_emp) return;

  getEl('doc-inbox-err').textContent = '';
  getEl('doc-inbox-issued').value = '';
  getEl('doc-inbox-expiry').value = '';
  getEl('doc-inbox-remarks').value = '';
  getEl('doc-inbox-display').value = '';
  getEl('doc-inbox-file-meta').textContent = '';
  getEl('doc-inbox-employee-name').textContent =
    `${_emp.firstName || ''} ${_emp.lastName || ''}`.trim() || 'this employee';

  const [{ files }, { documentTypes }] = await Promise.all([
    listScanInbox(),
    _documentTypes.length
      ? Promise.resolve({ documentTypes: _documentTypes })
      : listDocumentTypes(),
  ]);
  if (documentTypes?.length) _documentTypes = documentTypes;

  _inboxFiles = (files || []).filter((f) => !f.tooLarge);

  const fileEl = getEl('doc-inbox-file');
  if (!_inboxFiles.length) {
    fileEl.innerHTML = '<option value="">No pending files in inbox</option>';
    fileEl.disabled = true;
    getEl('doc-inbox-file-meta').textContent =
      'Drop scans into the Scan Inbox folder, then try again.';
  } else {
    fileEl.disabled = false;
    fileEl.innerHTML =
      '<option value="">Select a scanned file</option>' +
      _inboxFiles
        .map(
          (f, i) =>
            `<option value="${i}">${escapeHtml(f.name)} (${formatFileSize(f.size)})</option>`,
        )
        .join('');
  }

  const typeEl = getEl('doc-inbox-type');
  typeEl.innerHTML =
    '<option value="">Select type</option>' +
    _documentTypes
      .map(
        (t) =>
          `<option value="${t.id}">${escapeHtml(t.name)}${t.isRequired ? ' (recommended)' : ''}</option>`,
      )
      .join('');
  if (preselectTypeId) typeEl.value = preselectTypeId;

  getEl('doc-inbox-save').disabled = !_inboxFiles.length;
  getEl('doc-inbox-overlay').classList.add('open');
}

function closeInboxModal() {
  getEl('doc-inbox-overlay')?.classList.remove('open');
  _inboxFiles = [];
}

function onInboxFilePicked() {
  const idx = getEl('doc-inbox-file').value;
  const file = idx === '' ? null : _inboxFiles[Number(idx)];
  const meta = getEl('doc-inbox-file-meta');
  const display = getEl('doc-inbox-display');
  if (!file) {
    meta.textContent = '';
    return;
  }
  meta.textContent = `${formatFileSize(file.size)} · ${new Date(file.modifiedAt).toLocaleString('en-PH')}`;
  if (!display.value.trim()) {
    const name = file.name;
    display.value = name.includes('.')
      ? name.slice(0, name.lastIndexOf('.'))
      : name;
  }
}

async function submitInboxAttach() {
  const errEl = getEl('doc-inbox-err');
  const btn = getEl('doc-inbox-save');
  errEl.textContent = '';

  const idx = getEl('doc-inbox-file').value;
  const file = idx === '' ? null : _inboxFiles[Number(idx)];
  const displayName = getEl('doc-inbox-display').value.trim();
  const documentTypeId = getEl('doc-inbox-type').value;
  const issuedDate = getEl('doc-inbox-issued').value;
  const expiryDate = getEl('doc-inbox-expiry').value;
  const remarks = getEl('doc-inbox-remarks').value.trim();

  if (!file?.name) {
    errEl.textContent = 'Select an inbox file.';
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
  btn.textContent = 'Attaching…';
  try {
    const result = await assignScanInboxFile(file.name, {
      employeeId: _emp.id,
      documentTypeId,
      displayName,
      issuedDate,
      expiryDate,
      remarks,
    });
    closeInboxModal();
    showToast(`Attached as v${result.versionNumber || 1}.`, 'success');
    updateScanInboxBadge();
    await renderTabDocs(_emp);
    refreshPanelHeader();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Attach to 201 File';
  }
}

function updateScanInboxBadge() {
  listScanInbox()
    .then(({ files }) => {
      const badge = document.getElementById('scan-inbox-badge');
      if (badge) badge.textContent = String(files?.length ?? 0);
    })
    .catch(() => {});
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
          <span style="font-size:0.7143rem;background:var(--bg-subtle);color:var(--blue-700);padding:1px 7px;border-radius:99px;font-weight:700;margin-left:5px;">v${doc.versionNumber}</span>
          <span style="font-size:0.7143rem;background:#eef2ff;color:#3730a3;padding:1px 7px;border-radius:99px;font-weight:700;margin-left:4px;">${escapeHtml(doc.documentTypeName)}</span>
        </div>
        <div class="doc-meta">${escapeHtml(size)} · ${escapeHtml(when)}${dates ? ` · ${escapeHtml(dates)}` : ''}${doc.remarks ? ` · ${escapeHtml(doc.remarks)}` : ''}</div>
      </div>
      <div class="doc-acts">
        <button class="dbtn dbtn-dl" data-download-doc="${doc.id}">Download</button>
        <button class="dbtn dbtn-print" data-print-doc="${doc.id}" data-print-mime="${escapeHtml(doc.mimeType || '')}" data-print-name="${escapeHtml(doc.fileName || '')}">Print</button>
        ${canWrite() ? `<button class="dbtn dbtn-del" data-delete-doc="${doc.id}">Remove</button>` : ''}
      </div>
    </div>`;
}
