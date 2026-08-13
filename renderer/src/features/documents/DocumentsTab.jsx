import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  listEmployeeDocuments,
  listDocumentTypes,
  uploadEmployeeDocument,
  deleteDocument,
  restoreDocument,
  downloadDocumentUrl,
} from '../../js/api/documents.js';
import { listScanInbox, assignScanInboxFile } from '../../js/api/scanInbox.js';
import { formatFileSize } from '../../js/utils/helpers.js';
import { printDocument } from '../../js/utils/printDocument.js';
import { showToast } from '../../js/utils/toast.js';
import { canWrite } from '../../js/utils/authz.js';
import { emitAppEvent } from '../../shared/lib/appEvents.js';

export const ALLOWED_DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);
export const ALLOWED_DOC_EXT = /\.(pdf|doc|docx|jpe?g|png)$/i;

function isAllowedDocFile(file) {
  if (ALLOWED_DOC_EXT.test(file.name || '')) return true;
  if (file.type && ALLOWED_DOC_MIMES.has(file.type)) return true;
  return false;
}

function pickDroppedFile(fileList) {
  if (!fileList?.length) return null;
  for (const file of fileList) {
    if (isAllowedDocFile(file)) return file;
  }
  return null;
}

function baseName(name = '') {
  return name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
}

/**
 * Renders modal content into one of the pre-existing overlay hosts in index.html
 * and toggles `.open` on it while mounted.
 */
function OverlayPortal({ hostId, children }) {
  const [host] = useState(() => document.getElementById(hostId));

  useEffect(() => {
    if (!host) return undefined;
    host.classList.add('open');
    return () => host.classList.remove('open');
  }, [host]);

  if (!host) return null;
  return createPortal(children, host);
}

export function DocumentsTab({ employee, reloadKey = 0, onHeaderRefresh }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  /** @type {[null | { typeId: string, file: File | null }, Function]} */
  const [upload, setUpload] = useState(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const writable = canWrite();
  const employeeId = employee?.id;

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setError('');
    try {
      const [{ documents: docs, checklist: list }, { documentTypes: types }] =
        await Promise.all([listEmployeeDocuments(employeeId), listDocumentTypes()]);
      setDocuments(docs || []);
      setChecklist(list || []);
      setDocumentTypes(types || []);
    } catch (err) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const openUpload = useCallback((typeId = '', file = null) => {
    setUpload({ typeId, file });
  }, []);

  useEffect(() => {
    const zone = document.getElementById('tab-docs');
    if (!zone) return undefined;

    const hasFileDrag = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

    function onDragEnter(e) {
      if (!writable || !hasFileDrag(e)) return;
      e.preventDefault();
      zone.classList.add('doc-drop-active');
    }
    function onDragOver(e) {
      if (!writable || !hasFileDrag(e)) return;
      e.preventDefault();
      zone.classList.add('doc-drop-active');
    }
    function onDragLeave(e) {
      if (e.currentTarget === zone && !zone.contains(e.relatedTarget)) {
        zone.classList.remove('doc-drop-active');
      }
    }
    function onDrop(e) {
      zone.classList.remove('doc-drop-active');
      if (!writable) return;
      e.preventDefault();
      e.stopPropagation();
      const file = pickDroppedFile(e.dataTransfer?.files);
      if (!file) {
        showToast('Drop a PDF, Word doc, or image (JPG/PNG).', 'error');
        return;
      }
      if (!employeeId) {
        showToast('Open an employee Documents tab first.', 'info');
        return;
      }
      openUpload('', file);
    }

    zone.addEventListener('dragenter', onDragEnter);
    zone.addEventListener('dragover', onDragOver);
    zone.addEventListener('dragleave', onDragLeave);
    zone.addEventListener('drop', onDrop);
    return () => {
      zone.removeEventListener('dragenter', onDragEnter);
      zone.removeEventListener('dragover', onDragOver);
      zone.removeEventListener('dragleave', onDragLeave);
      zone.removeEventListener('drop', onDrop);
      zone.classList.remove('doc-drop-active');
    };
  }, [writable, employeeId, openUpload]);

  async function afterMutate() {
    await load();
    onHeaderRefresh?.();
  }

  async function handleDelete(docId) {
    if (!confirm('Move this document to Trash?')) return;
    try {
      await deleteDocument(docId);
      await afterMutate();
      emitAppEvent('trash.refresh');
      showToast('Moved to Trash.', 'info', {
        actionLabel: 'Undo',
        duration: 8000,
        onAction: async () => {
          try {
            await restoreDocument(docId);
            showToast('Document restored.', 'success');
            await afterMutate();
            emitAppEvent('trash.refresh');
          } catch (err) {
            showToast(err.message || 'Restore failed.', 'error');
          }
        },
      });
    } catch (err) {
      showToast(err.message || 'Delete failed.', 'error');
    }
  }

  if (loading) {
    return <div className="empty" style={{ padding: '20px 0' }}>Loading documents…</div>;
  }

  if (error) {
    return (
      <div className="empty" style={{ padding: '20px 0', color: 'var(--error)' }}>
        {error}
      </div>
    );
  }

  const recommended = checklist.filter((c) => c.isRequired);
  const onFile = recommended.filter((c) => c.satisfied);
  const missing = recommended.filter((c) => !c.satisfied);

  return (
    <>
      {writable && (
        <div className="file-toolbar">
          <button type="button" className="fab fab-upload" id="doc-open-upload" onClick={() => openUpload()}>
            Upload document
          </button>
          <button type="button" className="fab fab-upload" id="doc-open-inbox" onClick={() => setInboxOpen(true)}>
            Attach from inbox
          </button>
        </div>
      )}

      {recommended.length > 0 && (
        <div className="doc-checklist">
          <div className="doc-checklist-head">
            <span className="doc-checklist-title">Recommended</span>
            <span className="doc-checklist-progress">
              {onFile.length}/{recommended.length} on file
              {missing.length === 0 ? ' · complete' : ''}
            </span>
          </div>
          {missing.length > 0 && (
            <div className="doc-chip-row">
              {missing.map((c) =>
                writable ? (
                  <button
                    key={c.id}
                    type="button"
                    className="doc-chip doc-chip-missing"
                    data-rec-type={c.id}
                    onClick={() => openUpload(c.id)}
                  >
                    {c.name}
                  </button>
                ) : (
                  <span key={c.id} className="doc-chip doc-chip-missing">
                    {c.name}
                  </span>
                ),
              )}
            </div>
          )}
          {onFile.length > 0 && (
            <div className="doc-chip-row">
              {onFile.map((c) => (
                <span key={c.id} className="doc-chip doc-chip-done">
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="doc-meta">
        {documents.length} file{documents.length === 1 ? '' : 's'} · most recent first · versions
        allowed per type{writable ? ' · drag & drop to upload' : ''}
      </p>

      <div className="doc-list">
        {documents.length === 0 ? (
          <div className="empty doc-empty">No documents on file yet.</div>
        ) : (
          documents.map((doc) => (
            <DocRow key={doc.id} doc={doc} writable={writable} onDelete={() => handleDelete(doc.id)} />
          ))
        )}
      </div>

      {upload && (
        <OverlayPortal hostId="doc-overlay">
          <UploadModal
            employee={employee}
            documentTypes={documentTypes}
            documents={documents}
            initialTypeId={upload.typeId}
            initialFile={upload.file}
            onClose={() => setUpload(null)}
            onUploaded={async () => {
              setUpload(null);
              showToast('Document uploaded.', 'success');
              await afterMutate();
            }}
          />
        </OverlayPortal>
      )}

      {inboxOpen && (
        <OverlayPortal hostId="doc-inbox-overlay">
          <InboxModal
            employee={employee}
            documentTypes={documentTypes}
            onClose={() => setInboxOpen(false)}
            onAttached={async (versionNumber) => {
              setInboxOpen(false);
              showToast(`Attached as v${versionNumber || 1}.`, 'success');
              emitAppEvent('scan.refresh');
              await afterMutate();
            }}
          />
        </OverlayPortal>
      )}
    </>
  );
}

function DocRow({ doc, writable, onDelete }) {
  const when = doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString('en-PH') : '—';
  const size = typeof doc.fileSize === 'number' ? formatFileSize(doc.fileSize) : doc.fileSize;
  const dates = [
    doc.issuedDate ? `Issued ${String(doc.issuedDate).slice(0, 10)}` : null,
    doc.expiryDate ? `Expires ${String(doc.expiryDate).slice(0, 10)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="doc-item">
      <div className="doc-icon di-pdf" />
      <div className="doc-info">
        <div className="doc-name">
          {doc.fileName}
          <span
            style={{
              fontSize: '0.7143rem',
              background: 'var(--bg-subtle)',
              color: 'var(--blue-700)',
              padding: '1px 7px',
              borderRadius: 99,
              fontWeight: 700,
              marginLeft: 5,
            }}
          >
            v{doc.versionNumber}
          </span>
          <span
            style={{
              fontSize: '0.7143rem',
              background: '#eef2ff',
              color: '#3730a3',
              padding: '1px 7px',
              borderRadius: 99,
              fontWeight: 700,
              marginLeft: 4,
            }}
          >
            {doc.documentTypeName}
          </span>
        </div>
        <div className="doc-meta">
          {size} · {when}
          {dates ? ` · ${dates}` : ''}
          {doc.remarks ? ` · ${doc.remarks}` : ''}
        </div>
      </div>
      <div className="doc-acts">
        <button
          type="button"
          className="dbtn dbtn-dl"
          onClick={() => window.open(downloadDocumentUrl(doc.id), '_blank')}
        >
          Download
        </button>
        <button
          type="button"
          className="dbtn dbtn-print"
          onClick={() => {
            printDocument(doc.id, doc.mimeType || '', doc.fileName || '').catch((err) => {
              showToast(err.message || 'Print failed.', 'error');
            });
          }}
        >
          Print
        </button>
        {writable && (
          <button type="button" className="dbtn dbtn-del" onClick={onDelete}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function UploadModal({
  employee,
  documentTypes,
  documents,
  initialTypeId = '',
  initialFile = null,
  onClose,
  onUploaded,
}) {
  const [typeId, setTypeId] = useState(initialTypeId || '');
  const [file, setFile] = useState(initialFile || null);
  const [displayName, setDisplayName] = useState(() => {
    const type = documentTypes.find((t) => t.id === initialTypeId);
    if (type) return type.name;
    if (initialFile) return baseName(initialFile.name);
    return '';
  });
  const [issuedDate, setIssuedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);
  const autoNameRef = useRef(displayName);

  const selectedType = documentTypes.find((t) => t.id === typeId) || null;
  const alreadyOnFile = selectedType
    ? documents.some((d) => d.documentTypeId === selectedType.id)
    : false;

  let hint = '';
  if (alreadyOnFile) {
    hint = `Already on file — this upload will be saved as a new version of ${selectedType.name}.`;
  } else if (selectedType?.isRequired) {
    hint = 'Recommended document type for this employee.';
  }

  /** Keep the display name in sync while the user has not typed their own. */
  function autofillName(nextTypeId, nextFile) {
    setDisplayName((current) => {
      if (current.trim() && current.trim() !== autoNameRef.current) return current;
      const type = documentTypes.find((t) => t.id === nextTypeId);
      let next = '';
      if (type) next = type.name;
      else if (nextFile) next = baseName(nextFile.name);
      if (!next) return current;
      autoNameRef.current = next;
      return next;
    });
  }

  async function submit() {
    setErr('');
    if (!file) {
      setErr('Choose a file to upload.');
      return;
    }
    if (!displayName.trim()) {
      setErr('Display name is required.');
      return;
    }
    if (!typeId) {
      setErr('Document type is required.');
      return;
    }
    if (issuedDate && expiryDate && expiryDate < issuedDate) {
      setErr('Expiry date must be on or after issued date.');
      return;
    }

    setBusy(true);
    try {
      await uploadEmployeeDocument(employee.id, {
        file,
        displayName: displayName.trim(),
        documentTypeId: typeId,
        issuedDate,
        expiryDate,
        remarks: remarks.trim(),
      });
      await onUploaded?.();
    } catch (e) {
      setErr(e.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal doc-upload-modal">
      <button id="close-doc-modal" className="modal-close" type="button" onClick={onClose}>
        ×
      </button>
      <h3>Upload document</h3>
      <p className="modal-lead">
        PDF, Word, or image. Each upload for the same type becomes a new version.
      </p>
      <div className="doc-upload-form">
        <div className="fg">
          <label htmlFor="doc-type">Document type *</label>
          <select
            id="doc-type"
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value);
              autofillName(e.target.value, file);
            }}
          >
            <option value="">Select type</option>
            {documentTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isRequired ? ' (recommended)' : ''}
              </option>
            ))}
          </select>
          <div id="doc-type-hint" className="field-hint" hidden={!hint}>
            {hint}
          </div>
        </div>
        <div className="fg">
          <label>File *</label>
          <div className="doc-file-picker">
            <input
              type="file"
              id="doc-file"
              className="doc-file-input"
              ref={fileInputRef}
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={(e) => {
                const picked = e.target.files?.[0] || null;
                setFile(picked);
                if (picked) autofillName(typeId, picked);
              }}
            />
            {!file && (
              <button
                type="button"
                id="doc-file-browse"
                className="fab fab-upload"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose file
              </button>
            )}
            {file && (
              <div id="doc-file-meta" className="doc-file-selected">
                <div className="doc-file-selected-main">
                  <strong>{file.name}</strong>
                  <span>{formatFileSize(file.size)}</span>
                </div>
                <button
                  type="button"
                  id="doc-file-change"
                  className="btn btn-sm btn-cancel"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Change
                </button>
              </div>
            )}
          </div>
          <div className="field-hint">Accepted: PDF, DOC, DOCX, JPG, PNG</div>
        </div>
        <div className="fg">
          <label htmlFor="doc-display-name">Display name *</label>
          <input
            type="text"
            id="doc-display-name"
            placeholder="e.g. NBI Clearance 2026"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <div className="field-hint">Shown in the Documents list</div>
        </div>
        <div className="form-grid">
          <div className="fg">
            <label htmlFor="doc-issued">Issued date</label>
            <input
              type="date"
              id="doc-issued"
              value={issuedDate}
              onChange={(e) => setIssuedDate(e.target.value)}
            />
          </div>
          <div className="fg">
            <label htmlFor="doc-expiry">Expiry date</label>
            <input
              type="date"
              id="doc-expiry"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
        </div>
        <div className="fg">
          <label htmlFor="doc-remarks">Remarks</label>
          <textarea
            id="doc-remarks"
            rows={2}
            placeholder="Optional notes"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
      </div>
      <div className="login-err" id="doc-err">
        {err}
      </div>
      <div className="modal-actions">
        <button id="doc-modal-cancel" className="btn btn-cancel" type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          id="doc-modal-save"
          className="btn btn-primary"
          type="button"
          disabled={busy}
          onClick={submit}
        >
          {busy ? 'Uploading…' : alreadyOnFile ? 'Upload as new version' : 'Upload'}
        </button>
      </div>
    </div>
  );
}

function InboxModal({ employee, documentTypes: initialTypes, onClose, onAttached }) {
  const [documentTypes, setDocumentTypes] = useState(initialTypes || []);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [typeId, setTypeId] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ files: list }, { documentTypes: types }] = await Promise.all([
          listScanInbox(),
          initialTypes?.length
            ? Promise.resolve({ documentTypes: initialTypes })
            : listDocumentTypes(),
        ]);
        if (cancelled) return;
        setFiles((list || []).filter((f) => !f.tooLarge));
        if (types?.length) setDocumentTypes(types);
      } catch (e) {
        if (cancelled) return;
        showToast(e.message || 'Failed to load inbox.', 'error');
        onClose?.();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = index === '' ? null : files[Number(index)];
  const employeeName =
    `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || 'this employee';

  async function submit() {
    setErr('');
    if (!selected?.name) {
      setErr('Select an inbox file.');
      return;
    }
    if (!displayName.trim()) {
      setErr('Display name is required.');
      return;
    }
    if (!typeId) {
      setErr('Document type is required.');
      return;
    }
    if (issuedDate && expiryDate && expiryDate < issuedDate) {
      setErr('Expiry date must be on or after issued date.');
      return;
    }

    setBusy(true);
    try {
      const result = await assignScanInboxFile(selected.name, {
        employeeId: employee.id,
        documentTypeId: typeId,
        displayName: displayName.trim(),
        issuedDate,
        expiryDate,
        remarks: remarks.trim(),
      });
      await onAttached?.(result.versionNumber);
    } catch (e) {
      setErr(e.message || 'Attach failed.');
    } finally {
      setBusy(false);
    }
  }

  let fileMeta = '';
  if (loading) fileMeta = 'Loading inbox…';
  else if (!files.length) fileMeta = 'Drop scans into the Scan Inbox folder, then try again.';
  else if (selected) {
    fileMeta = `${formatFileSize(selected.size)} · ${new Date(selected.modifiedAt).toLocaleString('en-PH')}`;
  }

  return (
    <div className="modal" style={{ width: 520 }}>
      <button id="close-doc-inbox-modal" className="modal-close" type="button" onClick={onClose}>
        ×
      </button>
      <h3>Attach from Scan Inbox</h3>
      <p style={{ fontSize: '0.8571rem', color: 'var(--text-2)', margin: '-8px 0 14px' }}>
        Assign a pending scanned file to <strong id="doc-inbox-employee-name">{employeeName}</strong>
        ’s Documents.
      </p>
      <div className="fg" style={{ marginBottom: 13 }}>
        <label htmlFor="doc-inbox-file">Inbox file *</label>
        <select
          id="doc-inbox-file"
          value={index}
          disabled={loading || !files.length}
          onChange={(e) => {
            setIndex(e.target.value);
            const picked = e.target.value === '' ? null : files[Number(e.target.value)];
            if (picked && !displayName.trim()) setDisplayName(baseName(picked.name));
          }}
        >
          {files.length ? (
            <>
              <option value="">Select a scanned file</option>
              {files.map((f, i) => (
                <option key={f.name} value={i}>
                  {f.name} ({formatFileSize(f.size)})
                </option>
              ))}
            </>
          ) : (
            <option value="">{loading ? 'Loading…' : 'No pending files in inbox'}</option>
          )}
        </select>
        <div
          id="doc-inbox-file-meta"
          style={{ fontSize: '0.7857rem', color: 'var(--text-3)', marginTop: 6 }}
        >
          {fileMeta}
        </div>
      </div>
      <div className="fg" style={{ marginBottom: 13 }}>
        <label htmlFor="doc-inbox-display">Display name *</label>
        <input
          type="text"
          id="doc-inbox-display"
          placeholder="e.g. NBI Clearance 2026"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <div className="fg" style={{ marginBottom: 13 }}>
        <label htmlFor="doc-inbox-type">Document type *</label>
        <select id="doc-inbox-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">Select type</option>
          {documentTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.isRequired ? ' (recommended)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="form-grid" style={{ marginBottom: 4 }}>
        <div className="fg">
          <label htmlFor="doc-inbox-issued">Issued date</label>
          <input
            type="date"
            id="doc-inbox-issued"
            value={issuedDate}
            onChange={(e) => setIssuedDate(e.target.value)}
          />
        </div>
        <div className="fg">
          <label htmlFor="doc-inbox-expiry">Expiry date</label>
          <input
            type="date"
            id="doc-inbox-expiry"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </div>
      </div>
      <div className="fg" style={{ marginBottom: 13 }}>
        <label htmlFor="doc-inbox-remarks">Remarks</label>
        <textarea
          id="doc-inbox-remarks"
          placeholder="Optional notes"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
      </div>
      <div className="login-err" id="doc-inbox-err" style={{ marginTop: 4 }}>
        {err}
      </div>
      <div className="modal-actions">
        <button id="doc-inbox-cancel" className="btn btn-cancel" type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          id="doc-inbox-save"
          className="btn btn-primary"
          type="button"
          disabled={busy || loading || !files.length}
          onClick={submit}
        >
          {busy ? 'Attaching…' : 'Attach to Documents'}
        </button>
      </div>
    </div>
  );
}
