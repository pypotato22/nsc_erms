import { useCallback, useEffect, useRef, useState } from 'react';
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
import { onAppEvent } from '../../shared/lib/appEvents.js';
import { EmployeeCombobox } from './EmployeeCombobox.jsx';
import { ScanFileViewer } from './ScanFileViewer.jsx';
import { ScanPreviewModal } from './ScanPreviewModal.jsx';
import { ScanRenameDialog } from './ScanRenameDialog.jsx';

const PREFS_KEY = 'nsc.scanInbox.prefs';
const DEFAULT_PREFS = { nameStyle: 'file', previewInAssign: true };

const NAME_STYLES = [
  { value: 'file', label: 'Keep the scan’s file name' },
  { value: 'emp-type', label: 'Employee – Document type (Dela Cruz, Juan – Diploma)' },
  { value: 'type-emp', label: 'Document type – Employee (Diploma – Dela Cruz, Juan)' },
];

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return { ...DEFAULT_PREFS, ...(raw && typeof raw === 'object' ? raw : {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function storePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — preference just won't persist */
  }
}

function stripExt(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function suggestDisplayName(style, employee, type) {
  if (style === 'file' || !employee || !type) return null;
  const person = `${employee.lastName}, ${employee.firstName}`;
  const raw = style === 'type-emp' ? `${type.name} - ${person}` : `${person} - ${type.name}`;
  return raw.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
}

export function ScanInboxPage() {
  const [inboxPath, setPath] = useState('—');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignFile, setAssignFile] = useState(null);
  const [previewName, setPreviewName] = useState(null);
  const [renameName, setRenameName] = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [employees, setEmployees] = useState([]);
  const [types, setTypes] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [documentTypeId, setTypeId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const nameTouched = useRef(false);
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
    return onAppEvent('scan.refresh', load);
  }, [load]);

  // Close the preview if its file disappears (assigned/rejected elsewhere).
  useEffect(() => {
    if (!loading && previewName && !files.some((f) => f.name === previewName)) {
      setPreviewName(null);
    }
  }, [files, loading, previewName]);

  function updatePrefs(patch) {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      storePrefs(next);
      return next;
    });
  }

  async function openAssign(fileName) {
    setPreviewName(null);
    setAssignFile(fileName);
    setErr('');
    nameTouched.current = false;
    setDisplayName(stripExt(fileName));
    setIssued('');
    setExpiry('');
    setRemarks('');
    setEmployeeId('');
    setTypeId('');
    try {
      const [{ employees: emps }, { documentTypes }] = await Promise.all([
        listEmployees({ all: true }),
        listDocumentTypes(),
      ]);
      setEmployees(emps || []);
      setTypes(documentTypes || []);
    } catch (e) {
      setErr(e.message || 'Failed to load employees and document types.');
    }
  }

  // Suggest a display name from the chosen employee + type until the user edits it.
  useEffect(() => {
    if (!assignFile || nameTouched.current) return;
    const suggestion = suggestDisplayName(
      prefs.nameStyle,
      employees.find((e) => e.id === employeeId),
      types.find((t) => t.id === documentTypeId),
    );
    if (suggestion) setDisplayName(suggestion);
  }, [assignFile, prefs.nameStyle, employeeId, documentTypeId, employees, types]);

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

  async function rejectFile(fileName) {
    if (!confirm(`Reject "${fileName}"? File moves to inbox/failed.`)) return;
    // If this file is being previewed, move on to its neighbour afterwards.
    const idx = files.findIndex((f) => f.name === fileName);
    const neighbour = files[idx + 1]?.name || files[idx - 1]?.name || null;
    try {
      await rejectScanInboxFile(fileName, 'Rejected from Scan Inbox UI');
      showToast('File rejected.', 'success');
      setPreviewName((cur) => (cur === fileName ? neighbour : cur));
      await load();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Error', 'error');
    }
  }

  async function onRenamed(oldName, newName) {
    setRenameName(null);
    setPreviewName((cur) => (cur === oldName ? newName : cur));
    setAssignFile((cur) => (cur === oldName ? newName : cur));
    showToast(oldName === newName ? 'Name unchanged.' : `Renamed to ${newName}.`, 'success');
    await load();
  }

  const assignFileInfo = assignFile
    ? files.find((f) => f.name === assignFile) || { name: assignFile, modifiedAt: '' }
    : null;
  const showAssignPreview = Boolean(assignFileInfo) && prefs.previewInAssign;

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
        <div className="bk-acts">
          <button
            type="button"
            className="btn btn-sm btn-edit"
            aria-expanded={showOptions}
            onClick={() => setShowOptions((v) => !v)}
          >
            Options
          </button>
          <button type="button" className="btn btn-sm btn-edit" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {showOptions && (
        <div className="card scan-options">
          <div className="fg">
            <label htmlFor="scan-opt-name-style">Suggested display name when assigning</label>
            <select
              id="scan-opt-name-style"
              value={prefs.nameStyle}
              onChange={(e) => updatePrefs({ nameStyle: e.target.value })}
            >
              {NAME_STYLES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <label className="scan-check">
            <input
              type="checkbox"
              checked={prefs.previewInAssign}
              onChange={(e) => updatePrefs({ previewInAssign: e.target.checked })}
            />
            Show the scan next to the Assign form
          </label>
          <span className="field-hint" style={{ flexBasis: '100%' }}>
            Saved on this computer. You can always edit the name before assigning.
          </span>
        </div>
      )}

      <div className="card" style={{ padding: '8px 14px' }}>
        <div className="bk-list">
          {loading && !files.length && <div className="empty">Loading inbox…</div>}
          {!loading && !files.length && (
            <div className="empty" style={{ padding: '28px 0', textAlign: 'center' }}>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>Inbox is empty</p>
            </div>
          )}
          {files.map((f) => (
            <div className="bk-item" style={{ alignItems: 'center' }} key={f.name}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <button
                  type="button"
                  className="bk-name scan-name-btn"
                  title={`Preview ${f.name}`}
                  onClick={() => setPreviewName(f.name)}
                >
                  {f.name}
                </button>
                <div className="bk-meta">
                  {formatFileSize(f.size)} · {new Date(f.modifiedAt).toLocaleString('en-PH')}
                  {f.tooLarge ? ' · too large' : ''}
                </div>
              </div>
              <div className="bk-acts">
                <button type="button" className="btn btn-sm btn-edit" onClick={() => setPreviewName(f.name)}>
                  Preview
                </button>
                {writable ? (
                  <>
                    <button type="button" className="btn btn-sm btn-edit" onClick={() => setRenameName(f.name)}>
                      Rename
                    </button>
                    <button type="button" className="btn btn-sm btn-edit" disabled={f.tooLarge} onClick={() => openAssign(f.name)}>
                      Assign
                    </button>
                    <button type="button" className="btn btn-sm btn-del" onClick={() => rejectFile(f.name)}>
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

      {previewName && (
        <ScanPreviewModal
          files={files}
          name={previewName}
          writable={writable}
          suspended={Boolean(renameName)}
          onSelect={setPreviewName}
          onClose={() => setPreviewName(null)}
          onRename={setRenameName}
          onAssign={openAssign}
          onReject={rejectFile}
        />
      )}

      {renameName && (
        <ScanRenameDialog
          fileName={renameName}
          onClose={() => setRenameName(null)}
          onRenamed={onRenamed}
        />
      )}

      {assignFile &&
        createPortal(
          <div className="overlay open" onClick={(e) => e.target === e.currentTarget && setAssignFile(null)}>
            <div className="modal" style={{ maxWidth: showAssignPreview ? 1040 : 480, width: '94vw' }}>
              <div className="modal-header">
                <h3>Assign scan</h3>
                <button type="button" className="modal-close" onClick={() => setAssignFile(null)}>
                  ×
                </button>
              </div>
              <div className={showAssignPreview ? 'scan-assign-body' : undefined}>
                {showAssignPreview && <ScanFileViewer file={assignFileInfo} />}
                <div>
                  <p style={{ fontSize: '0.8571rem', marginBottom: 12 }}>
                    File: <strong>{assignFile}</strong>{' '}
                    <button
                      type="button"
                      className="btn btn-sm btn-edit"
                      style={{ marginLeft: 6 }}
                      onClick={() => setRenameName(assignFile)}
                    >
                      Rename file
                    </button>
                  </p>
                  <div className="fg" style={{ marginBottom: 10 }}>
                    <label>Employee *</label>
                    <EmployeeCombobox
                      employees={employees}
                      value={employeeId}
                      onChange={setEmployeeId}
                    />
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
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => {
                        nameTouched.current = true;
                        setDisplayName(e.target.value);
                      }}
                    />
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
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
