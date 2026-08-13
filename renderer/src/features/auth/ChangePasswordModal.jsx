import { useEffect, useState } from 'react';
import { changePassword } from '../../js/api/auth.js';
import { ApiError } from '../../js/api/client.js';
import { showToast } from '../../js/utils/toast.js';
import { PasswordInput } from '../../shared/ui/PasswordInput.jsx';

export function ChangePasswordModal({ open, forced, onDone, onCancel }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrent('');
    setNew('');
    setConfirm('');
    setError('');
    setBusy(false);
  }, [open]);

  if (!open) {
    return <div id="pw-overlay" className="overlay" />;
  }

  async function handleSave(e) {
    e?.preventDefault();
    setError('');
    if (!currentPassword || !newPassword || !confirm) {
      setError('All fields are required.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      showToast('Password updated.', 'success');
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      id="pw-overlay"
      className="overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget && !forced) onCancel?.();
      }}
    >
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3>Change password</h3>
          {!forced && (
            <button type="button" className="modal-close" id="close-pw-modal" onClick={onCancel} aria-label="Close">
              ×
            </button>
          )}
        </div>
        {forced && (
          <p id="pw-forced-note" style={{ fontSize: '0.8571rem', color: 'var(--text-2)', margin: '-8px 0 14px' }}>
            You must set a new password before continuing.
          </p>
        )}
        <form onSubmit={handleSave}>
          <div className="fg" style={{ marginBottom: 13 }}>
            <label htmlFor="pw-current">Current password *</label>
            <PasswordInput
              id="pw-current"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="fg" style={{ marginBottom: 13 }}>
            <label htmlFor="pw-new">New password *</label>
            <PasswordInput
              id="pw-new"
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNew(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="fg" style={{ marginBottom: 13 }}>
            <label htmlFor="pw-confirm">Confirm new password *</label>
            <PasswordInput
              id="pw-confirm"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="login-err" id="pw-err" style={{ marginTop: 12 }}>
            {error}
          </div>
          <div className="modal-actions">
            {!forced && (
              <button id="pw-cancel-btn" className="btn btn-cancel" type="button" onClick={onCancel}>
                Cancel
              </button>
            )}
            <button id="pw-save-btn" className="btn btn-primary" type="submit" disabled={busy}>
              Update password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
