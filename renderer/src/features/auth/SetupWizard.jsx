import { useEffect, useState } from 'react';
import { completeSetup } from '../../js/api/setup.js';
import { ApiError } from '../../js/api/client.js';
import { showToast } from '../../js/utils/toast.js';
import logoUrl from '../../../school_logo.jpg';

function canPickDesktopFolder() {
  return Boolean(window.nscDesktop?.isDesktop && typeof window.nscDesktop.pickFolder === 'function');
}

export function SetupWizard({ status, onComplete }) {
  const [orgName, setOrgName] = useState(status?.orgName || 'Northern Samar Colleges');
  const [filesRoot, setFilesRoot] = useState(
    status?.filesRoot || status?.filesRootHint || 'C:\\nsc-erms-files',
  );
  const [scanInboxPath, setInbox] = useState(
    status?.scanInboxPath || status?.scanInboxHint || 'C:\\nsc-erms-files\\inbox',
  );
  const [backupsRoot, setBackups] = useState(
    status?.backupsRoot || status?.backupsRootHint || 'C:\\nsc-erms-backups',
  );
  const [maxUploadBytes, setMax] = useState(String(status?.maxUploadBytes || 31457280));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const showBrowse = canPickDesktopFolder();

  useEffect(() => {
    if (!status) return;
    setOrgName(status.orgName || 'Northern Samar Colleges');
    setFilesRoot(status.filesRoot || status.filesRootHint || 'C:\\nsc-erms-files');
    setInbox(status.scanInboxPath || status.scanInboxHint || 'C:\\nsc-erms-files\\inbox');
    setBackups(status.backupsRoot || status.backupsRootHint || 'C:\\nsc-erms-backups');
    setMax(String(status.maxUploadBytes || 31457280));
    setError('');
  }, [status]);

  async function browse(setter, title, current) {
    if (!canPickDesktopFolder()) return;
    const result = await window.nscDesktop.pickFolder({
      title,
      defaultPath: current?.trim() || undefined,
    });
    if (result?.canceled || !result?.path) return;
    setter(result.path);
  }

  async function handleFinish(e) {
    e?.preventDefault();
    setError('');
    if (!orgName.trim() || !filesRoot.trim() || !scanInboxPath.trim() || !backupsRoot.trim()) {
      setError('Organization name and all paths are required.');
      return;
    }
    setBusy(true);
    try {
      await completeSetup({
        orgName: orgName.trim(),
        filesRoot: filesRoot.trim(),
        scanInboxPath: scanInboxPath.trim(),
        backupsRoot: backupsRoot.trim(),
        maxUploadBytes: Number(maxUploadBytes),
      });
      showToast('Setup complete.', 'success');
      onComplete?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Setup failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-box setup-box">
      <div className="login-logo">
        <img src={logoUrl} alt="Northern Samar Colleges" width={72} height={72} />
      </div>
      <h1>First-run setup</h1>
      <p>Configure institution paths for the Registrar server.</p>
      <form onSubmit={handleFinish}>
        <div className="login-field">
          <label htmlFor="setup-org">Organization name</label>
          <input id="setup-org" type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} disabled={busy} />
        </div>
        <div className="login-field">
          <label htmlFor="setup-files">Files root (disk)</label>
          <div className="path-field-row">
            <input id="setup-files" type="text" autoComplete="off" value={filesRoot} onChange={(e) => setFilesRoot(e.target.value)} disabled={busy} />
            {showBrowse && (
              <button type="button" className="btn btn-sm btn-edit desktop-folder-btn" onClick={() => browse(setFilesRoot, 'Select files root folder', filesRoot)}>
                Browse…
              </button>
            )}
          </div>
        </div>
        <div className="login-field">
          <label htmlFor="setup-inbox">Scan inbox folder</label>
          <div className="path-field-row">
            <input id="setup-inbox" type="text" autoComplete="off" value={scanInboxPath} onChange={(e) => setInbox(e.target.value)} disabled={busy} />
            {showBrowse && (
              <button type="button" className="btn btn-sm btn-edit desktop-folder-btn" onClick={() => browse(setInbox, 'Select scan inbox folder', scanInboxPath)}>
                Browse…
              </button>
            )}
          </div>
        </div>
        <div className="login-field">
          <label htmlFor="setup-backups">Backup folder</label>
          <div className="path-field-row">
            <input id="setup-backups" type="text" autoComplete="off" value={backupsRoot} onChange={(e) => setBackups(e.target.value)} disabled={busy} />
            {showBrowse && (
              <button type="button" className="btn btn-sm btn-edit desktop-folder-btn" onClick={() => browse(setBackups, 'Select backup folder', backupsRoot)}>
                Browse…
              </button>
            )}
          </div>
          {showBrowse && (
            <p className="setup-path-hint desktop-only-hint">
              Browse picks a folder on this computer — use only when the desktop app runs on the API server.
            </p>
          )}
        </div>
        <div className="login-field">
          <label htmlFor="setup-max">Max upload bytes (max 31457280)</label>
          <input id="setup-max" type="number" value={maxUploadBytes} onChange={(e) => setMax(e.target.value)} disabled={busy} />
        </div>
        <div className="login-err" id="setup-err">
          {error}
        </div>
        <button id="setup-finish-btn" className="login-btn" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Finish setup'}
        </button>
      </form>
    </div>
  );
}
