import { changePassword } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { getEl } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';

let _onDone = null;
let _forced = false;

export function initChangePassword(onDone) {
  _onDone = onDone;
  getEl('pw-save-btn').addEventListener('click', handleSave);
  getEl('pw-cancel-btn').addEventListener('click', () => {
    if (!_forced) hideChangePassword();
  });
  getEl('close-pw-modal').addEventListener('click', () => {
    if (!_forced) hideChangePassword();
  });
  getEl('pw-overlay').addEventListener('click', (e) => {
    if (e.target === getEl('pw-overlay') && !_forced) hideChangePassword();
  });
  getEl('pw-new').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSave();
  });
  getEl('pw-confirm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSave();
  });
}

export function showChangePassword(forced = false) {
  _forced = Boolean(forced);
  getEl('pw-overlay').classList.add('open');
  getEl('pw-forced-note').style.display = _forced ? 'block' : 'none';
  getEl('close-pw-modal').style.display = _forced ? 'none' : '';
  getEl('pw-cancel-btn').style.display = _forced ? 'none' : '';
  getEl('pw-err').textContent = '';
  getEl('pw-current').value = '';
  getEl('pw-new').value = '';
  getEl('pw-confirm').value = '';
  getEl('pw-current').focus();
}

export function hideChangePassword() {
  getEl('pw-overlay').classList.remove('open');
  _forced = false;
}

async function handleSave() {
  const currentPassword = getEl('pw-current').value;
  const newPassword = getEl('pw-new').value;
  const confirm = getEl('pw-confirm').value;
  const errEl = getEl('pw-err');
  const btn = getEl('pw-save-btn');

  errEl.textContent = '';
  if (!currentPassword || !newPassword || !confirm) {
    errEl.textContent = 'All fields are required.';
    return;
  }
  if (newPassword.length < 8) {
    errEl.textContent = 'New password must be at least 8 characters.';
    return;
  }
  if (newPassword !== confirm) {
    errEl.textContent = 'New passwords do not match.';
    return;
  }

  btn.disabled = true;
  try {
    await changePassword(currentPassword, newPassword);
    hideChangePassword();
    showToast('Password updated.', 'success');
    _onDone?.();
  } catch (err) {
    errEl.textContent =
      err instanceof ApiError ? err.message : 'Could not change password.';
  } finally {
    btn.disabled = false;
  }
}
