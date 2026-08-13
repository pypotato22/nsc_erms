import { useCallback, useEffect, useState } from 'react';
import {
  listBackups,
  createBackup,
  deleteBackup,
  downloadBackupUrl,
} from '../../js/api/backups.js';
import { ApiError } from '../../js/api/client.js';
import { formatFileSize } from '../../js/utils/helpers.js';
import { showToast } from '../../js/utils/toast.js';
import { canManageUsers } from '../../js/utils/authz.js';

export function BackupPage() {
  const admin = canManageUsers();
  const [backupsRoot, setRoot] = useState('—');
  const [backups, setBackups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!admin) return;
    setError('');
    try {
      const data = await listBackups();
      setRoot(data.backupsRoot || '—');
      setBackups(data.backups || []);
      setBusy(Boolean(data.busy));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load backups');
    }
  }, [admin]);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate() {
    if (!admin) {
      showToast('Only administrators can create backups.', 'error');
      return;
    }
    if (
      !confirm(
        'Create a full backup now?\n\nThis runs pg_dump and copies FILES_ROOT. It may take a minute.',
      )
    ) {
      return;
    }
    setCreating(true);
    try {
      const { backup } = await createBackup();
      showToast(`Backup created: ${backup.fileName}`, 'success');
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Backup action failed.', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(id) {
    if (!confirm('Delete this backup archive from the server?')) return;
    try {
      await deleteBackup(id);
      showToast('Backup deleted.', 'success');
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Backup action failed.', 'error');
    }
  }

  return (
    <div className="backup-grid">
      <div className="backup-card needs-admin">
        <h4>Create Backup</h4>
        <p>
          Snapshot PostgreSQL (<code>pg_dump</code>) and a copy of <code>FILES_ROOT</code> into a zip stored on the
          server.
        </p>
        <p style={{ fontSize: '0.7857rem', color: 'var(--text-3)', margin: '0 0 12px', fontFamily: "'DM Mono',monospace" }}>
          {backupsRoot}
        </p>
        {admin ? (
          <>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={busy || creating}
              onClick={onCreate}
            >
              {creating || busy ? 'Backup in progress…' : 'Create Backup Now'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
              <h4 style={{ margin: 0, fontSize: '0.9286rem' }}>Saved backups</h4>
              <button type="button" className="btn btn-sm btn-edit" onClick={load}>
                Refresh
              </button>
            </div>
            <div className="bk-list">
              {error && (
                <p style={{ fontSize: '0.8571rem', color: 'var(--text-3)', textAlign: 'center', padding: '16px 0' }}>
                  {error}
                </p>
              )}
              {!error && !backups.length && (
                <p style={{ fontSize: '0.8571rem', color: 'var(--text-3)', textAlign: 'center', padding: '16px 0' }}>
                  No backups yet. Create one to snapshot the database and FILES_ROOT.
                </p>
              )}
              {backups.map((b) => {
                const when = b.createdAt ? new Date(b.createdAt).toLocaleString('en-PH') : '—';
                const who = b.createdByName ? ` · ${b.createdByName}` : '';
                return (
                  <div className="bk-item" style={{ alignItems: 'flex-start' }} key={b.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="bk-name">{b.fileName || b.id}</div>
                      <div className="bk-meta">
                        {formatFileSize(b.sizeBytes || 0)} · {when}
                        {who} · DB + files
                      </div>
                    </div>
                    <div className="bk-acts">
                      <button
                        type="button"
                        className="btn btn-sm btn-edit"
                        onClick={() => window.open(downloadBackupUrl(b.id), '_blank')}
                      >
                        Download
                      </button>
                      <button type="button" className="btn btn-sm btn-del" onClick={() => onDelete(b.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p style={{ fontSize: '0.8571rem', color: 'var(--text-3)', textAlign: 'center', padding: '16px 0' }}>
            Only administrators can create or download backups.
          </p>
        )}
      </div>
      <div className="backup-card">
        <h4>Restore (ops)</h4>
        <p>
          In-app restore is disabled on purpose — restoring overwrites live data. Use a maintenance window and the
          steps in each archive’s <code>README.txt</code>.
        </p>
        <ol style={{ fontSize: '0.8571rem', color: 'var(--text-2)', margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Stop the NSC-ERMS API</li>
          <li>
            Restore <code>database.sql</code> with <code>psql</code>
          </li>
          <li>
            Replace <code>FILES_ROOT</code> with the archive’s <code>files/</code> folder
          </li>
          <li>Start the API and verify login</li>
        </ol>
      </div>
    </div>
  );
}
