import {
  listUsers,
  listRoles,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
} from '../api/users.js';
import { listEmployees } from '../api/employees.js';
import { listDepartments } from '../api/departments.js';
import { listAuditLogs } from '../api/audit.js';
import {
  getStorageSettings,
  validateStorageSettings,
  updateStorageSettings,
} from '../api/settings.js';
import { ApiError } from '../api/client.js';
import { getEl, setHTML, escapeHtml } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { showChangePassword } from './changePassword.js';
import { canManageUsers, isSuperadmin, setCurrentRole } from '../utils/authz.js';

let _getPrefs = null;
let _savePrefs = null;
let _getCurrentUser = () => null;
let _roles = [];
let _usersCache = [];
let _auditPage = 1;
let _resetUserId = null;
const AUDIT_PAGE_SIZE = 20;

export function initSettings(getPrefs, savePrefs, getCurrentUser) {
  _getPrefs = getPrefs;
  _savePrefs = savePrefs;
  if (typeof getCurrentUser === 'function') {
    _getCurrentUser = getCurrentUser;
  }

  getEl('dark-toggle').addEventListener('click', handleToggleDark);

  document.querySelectorAll('.fs-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleSetFont(Number(btn.dataset.size), btn));
  });

  getEl('settings-change-pw')?.addEventListener('click', () => showChangePassword(false));

  getEl('add-user-btn')?.addEventListener('click', () => {
    openUserModal().catch((err) => {
      showToast(err instanceof ApiError ? err.message : 'Unable to open user form.', 'error');
    });
  });
  getEl('close-user-modal')?.addEventListener('click', closeUserModal);
  getEl('user-modal-cancel')?.addEventListener('click', closeUserModal);
  getEl('user-modal-save')?.addEventListener('click', () => {
    saveUser().catch((err) => {
      showToast(err instanceof ApiError ? err.message : 'Failed to save user.', 'error');
    });
  });

  getEl('close-reset-pw-modal')?.addEventListener('click', closeResetPasswordModal);
  getEl('reset-pw-cancel')?.addEventListener('click', closeResetPasswordModal);
  getEl('reset-pw-save')?.addEventListener('click', () => {
    submitResetPassword().catch((err) => {
      getEl('reset-pw-err').textContent =
        err instanceof ApiError ? err.message : 'Reset failed.';
    });
  });

  getEl('refresh')?.addEventListener('click', () => {
    refreshStats().catch(() => {});
  });

  getEl('audit-refresh')?.addEventListener('click', () => {
    _auditPage = 1;
    renderAuditLogs().catch(() => {});
  });
  getEl('audit-action')?.addEventListener('change', () => {
    _auditPage = 1;
    renderAuditLogs().catch(() => {});
  });
  let auditTimer = null;
  getEl('audit-q')?.addEventListener('input', () => {
    clearTimeout(auditTimer);
    auditTimer = setTimeout(() => {
      _auditPage = 1;
      renderAuditLogs().catch(() => {});
    }, 300);
  });
  getEl('audit-prev')?.addEventListener('click', () => {
    if (_auditPage <= 1) return;
    _auditPage -= 1;
    renderAuditLogs().catch(() => {});
  });
  getEl('audit-next')?.addEventListener('click', () => {
    _auditPage += 1;
    renderAuditLogs().catch(() => {});
  });

  getEl('storage-paths-validate')?.addEventListener('click', () => {
    testStoragePaths().catch((err) => {
      setStorageErr(err instanceof ApiError ? err.message : 'Path check failed.');
    });
  });
  getEl('storage-paths-save')?.addEventListener('click', () => {
    saveStoragePaths().catch((err) => {
      setStorageErr(err instanceof ApiError ? err.message : 'Failed to save paths.');
    });
  });

  getEl('browse-scan-inbox')?.addEventListener('click', () => {
    browseStorageFolder('storage-scan-inbox', 'Select scan inbox folder').catch(() => {});
  });
  getEl('browse-backups-root')?.addEventListener('click', () => {
    browseStorageFolder('storage-backups-root', 'Select backup folder').catch(() => {});
  });

  syncDesktopFolderBrowseUi();
}

function canPickDesktopFolder() {
  return Boolean(window.nscDesktop?.isDesktop && typeof window.nscDesktop.pickFolder === 'function');
}

function syncDesktopFolderBrowseUi() {
  // Visibility is CSS-gated on body.desktop-shell (.btn display overrides [hidden]).
  // Keep hint attribute in sync for a11y when not in Electron.
  const show = canPickDesktopFolder();
  document.querySelectorAll('.desktop-only-hint').forEach((el) => {
    el.hidden = !show;
  });
}

async function browseStorageFolder(inputId, title) {
  if (!canPickDesktopFolder()) return;
  setStorageErr('');
  const input = getEl(inputId);
  const result = await window.nscDesktop.pickFolder({
    title,
    defaultPath: input?.value?.trim() || undefined,
  });
  if (result?.canceled || !result?.path) return;
  if (input) input.value = result.path;
}

export async function renderSettingsPage() {
  syncRoleFromSession();
  await renderUserTable();
  await renderAuditLogs();
  await refreshStats();
  await loadStoragePaths();
}

function sourceLabel(source) {
  if (source === 'settings') return 'from saved settings';
  if (source === 'env') return 'from environment / default';
  if (source === 'default') return 'default under files root';
  return '';
}

function setStorageErr(msg) {
  const el = getEl('storage-paths-err');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function readStorageForm() {
  return {
    scanInboxPath: getEl('storage-scan-inbox')?.value.trim() || '',
    backupsRoot: getEl('storage-backups-root')?.value.trim() || '',
  };
}

async function loadStoragePaths() {
  if (!isSuperadmin()) return;
  syncDesktopFolderBrowseUi();
  const filesEl = getEl('storage-files-root');
  const inboxEl = getEl('storage-scan-inbox');
  const backupsEl = getEl('storage-backups-root');
  if (!filesEl || !inboxEl || !backupsEl) return;

  setStorageErr('');
  try {
    const data = await getStorageSettings();
    filesEl.value = data.filesRoot || '';
    inboxEl.value = data.scanInboxPath || '';
    backupsEl.value = data.backupsRoot || '';
    const scanSrc = getEl('storage-scan-source');
    const bakSrc = getEl('storage-backups-source');
    if (scanSrc) scanSrc.textContent = sourceLabel(data.sources?.scanInboxPath);
    if (bakSrc) bakSrc.textContent = sourceLabel(data.sources?.backupsRoot);
  } catch (err) {
    setStorageErr(err instanceof ApiError ? err.message : 'Failed to load storage paths.');
  }
}

async function testStoragePaths() {
  if (!isSuperadmin()) return;
  setStorageErr('');
  const body = readStorageForm();
  await validateStorageSettings(body);
  showToast('Paths are valid and writable.', 'success');
}

async function saveStoragePaths() {
  if (!isSuperadmin()) return;
  setStorageErr('');
  const body = readStorageForm();
  if (!body.scanInboxPath || !body.backupsRoot) {
    setStorageErr('Both scan inbox and backup paths are required.');
    return;
  }
  const data = await updateStorageSettings(body);
  getEl('storage-files-root').value = data.filesRoot || '';
  getEl('storage-scan-inbox').value = data.scanInboxPath || '';
  getEl('storage-backups-root').value = data.backupsRoot || '';
  const scanSrc = getEl('storage-scan-source');
  const bakSrc = getEl('storage-backups-source');
  if (scanSrc) scanSrc.textContent = sourceLabel(data.sources?.scanInboxPath);
  if (bakSrc) bakSrc.textContent = sourceLabel(data.sources?.backupsRoot);
  showToast('Storage paths saved.', 'success');
}

function syncRoleFromSession() {
  const user = _getCurrentUser();
  if (user?.roleCode) {
    setCurrentRole(user.roleCode);
  }
}

function handleToggleDark() {
  const prefs = _getPrefs();
  prefs.darkMode = !prefs.darkMode;
  document.body.classList.toggle('dark', prefs.darkMode);
  getEl('dark-toggle').classList.toggle('on', prefs.darkMode);
  _savePrefs();
}

function handleSetFont(size, btnEl) {
  const prefs = _getPrefs();
  prefs.fontSize = size;
  document.documentElement.style.setProperty('--fs', size + 'px');
  document.querySelectorAll('.fs-btn').forEach((b) => b.classList.remove('active'));
  btnEl.classList.add('active');
  _savePrefs();
  showToast(`Font size set to ${size}px.`, 'info');
}

async function openUserModal(editUser = null) {
  syncRoleFromSession();
  if (!canManageUsers()) {
    showToast('You do not have permission to manage users.', 'error');
    return;
  }

  await fillRoleSelect(editUser?.role?.code);

  const isEdit = Boolean(editUser);
  getEl('user-modal-title').textContent = isEdit ? 'Edit User' : 'Add User Account';
  getEl('user-modal-save').textContent = isEdit ? 'Save changes' : 'Create user';
  getEl('u-edit-id').value = isEdit ? editUser.id : '';
  getEl('u-name').value = editUser?.displayName || '';
  getEl('u-user').value = editUser?.username || '';
  getEl('u-pass').value = '';

  document.querySelectorAll('.user-create-only').forEach((el) => {
    el.style.display = isEdit ? 'none' : '';
  });

  if (isEdit) {
    const sel = getEl('u-role');
    if (editUser.role?.code === 'superadmin' && !isSuperadmin()) {
      sel.disabled = true;
    } else {
      sel.disabled = false;
      sel.value = editUser.role?.code || 'staff';
    }
  } else {
    getEl('u-role').disabled = false;
  }

  getEl('user-overlay').classList.add('open');
}

function closeUserModal() {
  getEl('user-overlay').classList.remove('open');
  getEl('u-edit-id').value = '';
}

async function fillRoleSelect(preselect) {
  const { roles } = await listRoles();
  _roles = roles.filter((r) => {
    if (r.code === 'superadmin') return isSuperadmin();
    return true;
  });
  const sel = getEl('u-role');
  sel.innerHTML = _roles
    .map(
      (r) =>
        `<option value="${escapeHtml(r.code)}">${escapeHtml(r.name)}</option>`,
    )
    .join('');
  if (preselect && _roles.some((r) => r.code === preselect)) {
    sel.value = preselect;
  } else if (_roles.some((r) => r.code === 'staff')) {
    sel.value = 'staff';
  }
}

async function saveUser() {
  const editId = getEl('u-edit-id').value.trim();
  const displayName = getEl('u-name').value.trim();
  const username = getEl('u-user').value.trim();
  const password = getEl('u-pass').value;
  const roleCode = getEl('u-role').value;

  if (!displayName) {
    showToast('Display name is required.', 'error');
    return;
  }

  if (editId) {
    await updateUser(editId, { displayName, roleCode });
    closeUserModal();
    showToast('User updated.', 'success');
    await renderUserTable();
    return;
  }

  if (!username || !password) {
    showToast('Name, username, and password are required.', 'error');
    return;
  }
  if (password.length < 8) {
    showToast('Password must be at least 8 characters.', 'error');
    return;
  }

  await createUser({ displayName, username, password, roleCode });
  closeUserModal();
  showToast(`User “${username}” created.`, 'success');
  await renderUserTable();
}

function openResetPasswordModal(user) {
  _resetUserId = user.id;
  getEl('reset-pw-user-label').textContent = user.displayName || user.username;
  getEl('reset-pw-new').value = '';
  getEl('reset-pw-confirm').value = '';
  getEl('reset-pw-err').textContent = '';
  getEl('reset-pw-overlay').classList.add('open');
}

function closeResetPasswordModal() {
  getEl('reset-pw-overlay').classList.remove('open');
  _resetUserId = null;
}

async function submitResetPassword() {
  const errEl = getEl('reset-pw-err');
  const btn = getEl('reset-pw-save');
  errEl.textContent = '';

  const password = getEl('reset-pw-new').value;
  const confirm = getEl('reset-pw-confirm').value;

  if (!password || !confirm) {
    errEl.textContent = 'Both password fields are required.';
    return;
  }
  if (password.length < 8) {
    errEl.textContent = 'Password must be at least 8 characters.';
    return;
  }
  if (password !== confirm) {
    errEl.textContent = 'Passwords do not match.';
    return;
  }

  btn.disabled = true;
  try {
    await resetUserPassword(_resetUserId, password);
    closeResetPasswordModal();
    showToast('Password reset. Activate the user when ready.', 'success');
  } finally {
    btn.disabled = false;
  }
}

async function renderUserTable() {
  syncRoleFromSession();

  try {
    const { users } = await listUsers();
    _usersCache = users;
    if (!users.length) {
      setHTML(
        'user-table',
        `<tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr>
         <tr><td colspan="5" class="settings-muted">No user accounts yet.</td></tr>`,
      );
      return;
    }

    setHTML(
      'user-table',
      `
    <tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr>
    ${users
      .map((u) => {
        const protectedRole = u.role.code === 'superadmin';
        const canModify = !protectedRole || isSuperadmin();
        const statusBadge = u.isActive
          ? `<span class="badge active">Active</span>`
          : `<span class="badge" style="background:var(--bg-base);color:var(--text-3);">Inactive</span>`;
        let action = '';
        if (canModify) {
          if (u.isActive) {
            action = `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
              <button type="button" class="btn btn-sm btn-edit" data-edit-user="${u.id}">Edit</button>
              <button type="button" class="btn btn-sm btn-del" data-deactivate-user="${u.id}">Deactivate</button>
            </div>`;
          } else {
            action = `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
              <button type="button" class="btn btn-sm btn-edit" data-edit-user="${u.id}">Edit</button>
              <button type="button" class="btn btn-sm btn-edit" data-reset-pw-user="${u.id}">Reset password</button>
              <button type="button" class="btn btn-sm btn-edit" data-activate-user="${u.id}">Activate</button>
              <button type="button" class="btn btn-sm btn-del" data-delete-user="${u.id}">Delete forever</button>
            </div>`;
          }
        } else {
          action = `<span class="settings-muted">Protected</span>`;
        }
        return `
      <tr>
        <td>${escapeHtml(u.displayName || u.username)}</td>
        <td><code class="settings-username">${escapeHtml(u.username)}</code></td>
        <td><span class="badge active">${escapeHtml(u.role.name)}</span></td>
        <td>${statusBadge}</td>
        <td>${action}</td>
      </tr>`;
      })
      .join('')}`,
    );

    document.querySelectorAll('[data-edit-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const user = _usersCache.find((u) => u.id === btn.dataset.editUser);
        if (user) {
          openUserModal(user).catch((err) => {
            showToast(err instanceof ApiError ? err.message : 'Unable to open user form.', 'error');
          });
        }
      });
    });
    document.querySelectorAll('[data-deactivate-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        toggleUserActive(btn.dataset.deactivateUser, false).catch((err) => {
          showToast(err instanceof ApiError ? err.message : 'Deactivate failed.', 'error');
        });
      });
    });
    document.querySelectorAll('[data-activate-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        toggleUserActive(btn.dataset.activateUser, true).catch((err) => {
          showToast(err instanceof ApiError ? err.message : 'Activate failed.', 'error');
        });
      });
    });
    document.querySelectorAll('[data-reset-pw-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const user = _usersCache.find((u) => u.id === btn.dataset.resetPwUser);
        if (user) openResetPasswordModal(user);
      });
    });
    document.querySelectorAll('[data-delete-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        permanentlyDeleteUser(btn.dataset.deleteUser).catch((err) => {
          showToast(err instanceof ApiError ? err.message : 'Delete failed.', 'error');
        });
      });
    });
  } catch (err) {
    const msg =
      err instanceof ApiError && err.status === 403
        ? 'Only admin or superadmin accounts can manage users.'
        : err instanceof ApiError
          ? err.message
          : 'Unable to load users';
    setHTML(
      'user-table',
      `<tr><td colspan="5" class="settings-muted">${escapeHtml(msg)}</td></tr>`,
    );
  }
}

async function toggleUserActive(id, isActive) {
  const verb = isActive ? 'activate' : 'deactivate';
  if (!confirm(`${verb[0].toUpperCase() + verb.slice(1)} this user?`)) return;
  await updateUser(id, { isActive });
  showToast(`User ${verb}d.`, 'success');
  await renderUserTable();
}

async function permanentlyDeleteUser(id) {
  if (
    !confirm(
      'Permanently delete this inactive user?\n\nThis cannot be undone. Audit history will keep the action but clear the deleted account link.',
    )
  ) {
    return;
  }
  await deleteUser(id);
  showToast('User deleted permanently.', 'success');
  await renderUserTable();
}

async function refreshStats() {
  const el = document.getElementById('db-stats');
  if (!el) return;
  try {
    const [{ employees }, { departments }] = await Promise.all([
      listEmployees({ all: true }),
      listDepartments(),
    ]);
    el.textContent = `${employees.length} employees · ${departments.length} departments`;
  } catch {
    el.textContent = '—';
  }
}

async function renderAuditLogs() {
  const host = getEl('audit-list');
  if (!host) return;
  syncRoleFromSession();

  if (!canManageUsers()) {
    setHTML(
      'audit-list',
      `<p class="settings-muted">Only administrators can view audit logs.</p>`,
    );
    return;
  }

  setHTML('audit-list', `<p class="settings-muted">Loading…</p>`);

  try {
    const q = getEl('audit-q')?.value.trim() || '';
    const action = getEl('audit-action')?.value || '';
    const { logs, page, total, totalPages } = await listAuditLogs({
      page: _auditPage,
      limit: AUDIT_PAGE_SIZE,
      q,
      action,
    });
    _auditPage = page || 1;

    const info = getEl('audit-page-info');
    if (info) {
      info.textContent =
        total === 0
          ? 'No entries'
          : `Page ${page} of ${totalPages} · ${total} entr${total === 1 ? 'y' : 'ies'}`;
    }
    const prev = getEl('audit-prev');
    const next = getEl('audit-next');
    if (prev) prev.disabled = !total || page <= 1;
    if (next) next.disabled = !total || page >= totalPages;

    if (!logs.length) {
      setHTML(
        'audit-list',
        `<p class="settings-muted" style="padding:8px 0;">No matching audit entries.</p>`,
      );
      return;
    }

    setHTML(
      'audit-list',
      logs
        .map((log) => {
          const when = log.createdAt
            ? new Date(log.createdAt).toLocaleString('en-PH')
            : '—';
          const who = log.actor
            ? escapeHtml(log.actor.displayName || log.actor.username)
            : '<span style="color:var(--text-3)">system / unknown</span>';
          const metaBits = [];
          if (log.entityType) metaBits.push(escapeHtml(log.entityType));
          if (log.entityId) metaBits.push(`<code>${escapeHtml(String(log.entityId).slice(0, 26))}</code>`);
          if (log.ip) metaBits.push(escapeHtml(log.ip));
          return `
        <div class="audit-row">
          <div class="audit-main">
            <span class="audit-action">${escapeHtml(log.action)}</span>
            <span class="audit-who">${who}</span>
          </div>
          <div class="audit-meta">${when}${metaBits.length ? ` · ${metaBits.join(' · ')}` : ''}</div>
        </div>`;
        })
        .join(''),
    );
  } catch (err) {
    setHTML(
      'audit-list',
      `<p class="settings-muted">${escapeHtml(err instanceof ApiError ? err.message : 'Unable to load audit logs')}</p>`,
    );
  }
}
