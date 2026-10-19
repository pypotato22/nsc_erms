import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { renameScanInboxFile } from '../../js/api/scanInbox.js';

function splitName(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { stem: name.slice(0, dot), ext: name.slice(dot) } : { stem: name, ext: '' };
}

/** Small modal to rename a file that is still in the inbox. */
export function ScanRenameDialog({ fileName, onClose, onRenamed }) {
  const { stem: initialStem, ext } = splitName(fileName);
  const [stem, setStem] = useState(initialStem);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  async function submit(e) {
    e.preventDefault();
    const next = stem.trim();
    if (!next) {
      setErr('File name is required.');
      return;
    }
    if (next + ext === fileName) {
      onClose();
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const { name } = await renameScanInboxFile(fileName, next);
      onRenamed(fileName, name);
    } catch (e2) {
      setErr(e2.message || 'Rename failed.');
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="overlay open scan-rename-overlay"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <form className="modal" style={{ maxWidth: 440 }} onSubmit={submit}>
        <div className="modal-header">
          <h3>Rename file</h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label htmlFor="scan-rename-input">New name</label>
          <div className="scan-rename-field">
            <input
              id="scan-rename-input"
              ref={inputRef}
              type="text"
              value={stem}
              maxLength={150}
              onChange={(e) => setStem(e.target.value)}
            />
            {ext && <span className="scan-rename-ext">{ext}</span>}
          </div>
          <span className="field-hint">The file type ({ext || 'none'}) stays the same.</span>
        </div>
        <div className="login-err">{err}</div>
        <div className="modal-actions">
          <button type="button" className="btn btn-cancel" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Renaming…' : 'Rename'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
