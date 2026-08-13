import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  listScanInbox,
  assignScanInboxFile,
  rejectScanInboxFile,
} from '../../js/api/scanInbox.js';
import { listEmployees } from '../../js/api/employees.js';
import { listDocumentTypes } from '../../js/api/documents.js';
import { ApiError } from '../../js/api/client.js';
import { formatFileSize } from '../../js/utils/helpers.js';
import { showToast } from '../../js/utils/toast.js';
import { canWrite } from '../../js/utils/authz.js';

export function ScanInboxPage() {
  const [inboxPath, setPath] = useState('—');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignFile, setAssignFile] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [types, setTypes] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [documentTypeId, setTypeId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [issuedDate, setIssued] = useState('');
  const [expiryDate, setExpiry] = useState('');
  const [remarks, setRemarks] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const writable = canWrite();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { inboxPath: path, files: list } = await listScanInbox();
      setPath(path || '—');
      setFiles(list || []);
      const badge = document.getElementById('scan-inbox-badge');
      if (badge) badge.textContent = String(list?.length || 0);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Failed to load inbox', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openAssign(fileName) {
    setAssignFile(fileName);
    setErr('');
    setDisplayName(fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName);
    setIssued('');
    setExpiry('');
    setRemarks('');
    setEmployeeId('');
    setTypeId('');
    const [{ employees: emps }, { documentTypes }] = await Promise.all([
      listEmployees({ all: true }),
      listDocumentTypes(),
    ]);
    setEmployees(emps || []);
    setTypes(documentTypes || []);
  }

  async function submitAssign() {
    setErr('');
    if (!employeeId || !documentTypeId || !displayName.trim()) {
      setErr('Employee, document type, and display name are required.');
      return;
    }
    if (issuedDate && expiryDate && expiryDate < issuedDate) {
      setErr('Expiry date must be on or after issued date.');
      return;
    }
    setBusy(true);
    try {
      const result = await assignScanInboxFile(assignFile, {
        employeeId,
        documentTypeId,
        displayName: displayName.trim(),
        issuedDate,
        expiryDate,
        remarks: remarks.trim(),
      });
      setAssignFile(null);
      showToast(`Assigned as v${result.versionNumber}.`, 'success');
      await load();
    } catch (e) {
      setErr(e.message || 'Assign failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="toolbar" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: '0.9286rem', color: 'var(--text-2)', margin: '0 0 4px' }}>
            Files dropped here wait for assignment to an employee’s Documents.
          </p>
          <p style={{ fontSize: '0.7857rem', color: 'var(--text-3)', margin: 0, fontFamily: "'DM Mono',monospace" }}>
            {inboxPath}
          </p>
        </div>
        <button type="button" className="btn btn-sm btn-edit" onClick={load}>
          Refresh
        </button>
      </div>
      <div className="card" style={{ padding: '8px 14px' }}>
        <div className="bk-list">
          {loading && <div className="empty">Loading inbox…</div>}
          {!loading && !files.length && (
            <div className="empty" style={{ padding: '28px 0', textAlign: 'center' }}>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>Inbox is empty</p>
            </div>
          )}
          {files.map((f) => (
            <div className="bk-item" style={{ alignItems: 'center' }} key={f.name}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="bk-name">{f.name}</div>
                <div className="bk-meta">
                  {formatFileSize(f.size)} · {new Date(f.modifiedAt).toLocaleString('en-PH')}
                  {f.tooLarge ? ' · too large' : ''}
                </div>
              </div>
              <div className="bk-acts">
                {writable ? (
                  <>
                    <button type="button" className="btn btn-sm btn-edit" disabled={f.tooLarge} onClick={() => openAssign(f.name)}>
                      Assign
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-del"
                      onClick={async () => {
                        if (!confirm(`Reject "${f.name}"? File moves to inbox/failed.`)) return;
                        try {
                          await rejectScanInboxFile(f.name, 'Rejected from Scan Inbox UI');
                          showToast('File rejected.', 'success');
                          await load();
                        } catch (e) {
                          showToast(e instanceof ApiError ? e.message : 'Error', 'error');
                        }
                      }}
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: '0.7857rem', color: 'var(--text-3)' }}>View only</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {assignFile &&
        createPortal(
          <div className="overlay open" onClick={(e) => e.target === e.currentTarget && setAssignFile(null)}>
            <div className="modal" style={{ maxWidth: 480 }}>
              <div className="modal-header">
                <h3>Assign scan</h3>
                <button type="button" className="modal-close" onClick={() => setAssignFile(null)}>
                  ×
                </button>
              </div>
              <p style={{ fontSize: '0.8571rem', marginBottom: 12 }}>
                File: <strong>{assignFile}</strong>
              </p>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>Employee *</label>
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">Select employee</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.lastName}, {e.firstName}
                      {e.employeeNo ? ` (${e.employeeNo})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>Document type *</label>
                <select value={documentTypeId} onChange={(e) => setTypeId(e.target.value)}>
                  <option value="">Select type</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.isRequired ? ' (recommended)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>Display name *</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div className="form-grid" style={{ marginBottom: 10 }}>
                <div className="fg">
                  <label>Issued</label>
                  <input type="date" value={issuedDate} onChange={(e) => setIssued(e.target.value)} />
                </div>
                <div className="fg">
                  <label>Expiry</label>
                  <input type="date" value={expiryDate} onChange={(e) => setExpiry(e.target.value)} />
                </div>
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>Remarks</label>
                <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
              <div className="login-err">{err}</div>
              <div className="modal-actions">
                <button type="button" className="btn btn-cancel" onClick={() => setAssignFile(null)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={submitAssign}>
                  {busy ? 'Assigning…' : 'Assign to Documents'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
