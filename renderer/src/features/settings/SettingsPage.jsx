import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  listUsers,
  listRoles,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
} from '../../js/api/users.js';
import { listEmployees } from '../../js/api/employees.js';
import { listDepartments } from '../../js/api/departments.js';
import { listAuditLogs } from '../../js/api/audit.js';
import {
  getStorageSettings,
  validateStorageSettings,
  updateStorageSettings,
} from '../../js/api/settings.js';
import { ApiError } from '../../js/api/client.js';
import { showToast } from '../../js/utils/toast.js';
import { showChangePassword } from '../../js/components/changePassword.js';
import { PasswordInput } from '../../shared/ui/PasswordInput.jsx';
import { canManageUsers, isSuperadmin, setCurrentRole } from '../../js/utils/authz.js';

const AUDIT_PAGE_SIZE = 20;
const FONT_SIZES = [
  { size: 13, label: 'S' },
  { size: 14, label: 'M' },
  { size: 17, label: 'L' },
  { size: 21, label: 'XL' },
];

const AUDIT_ACTIONS = [
  { value: '', label: 'All actions' },
  { value: 'auth.login', label: 'Login' },
  { value: 'auth.login_failed', label: 'Login failed' },
  { value: 'auth.logout', label: 'Logout' },
  { value: 'auth.change_password', label: 'Password change' },
  { value: 'employee.create', label: 'Employee create' },
  { value: 'employee.update', label: 'Employee update' },
  { value: 'employee.delete', label: 'Employee delete' },
  { value: 'employee.restore', label: 'Employee restore' },
  { value: 'employee.permanent_delete', label: 'Employee permanent delete' },
  { value: 'document.upload', label: 'Document upload' },
  { value: 'document.soft_delete', label: 'Document trash' },
  { value: 'document.restore', label: 'Document restore' },
  { value: 'document.permanent_delete', label: 'Document purge' },
  { value: 'backup.create', label: 'Backup create' },
  { value: 'settings.storage_update', label: 'Storage paths update' },
  { value: 'user.create', label: 'User create' },
  { value: 'user.update', label: 'User update' },
  { value: 'user.password_reset', label: 'User password reset' },
  { value: 'user.delete', label: 'User delete' },
  { value: 'position.create', label: 'Position create' },
  { value: 'position.update', label: 'Position update' },
  { value: 'position.delete', label: 'Position delete' },
];

function sourceLabel(source) {
  if (source === 'settings') return 'from saved settings';
  if (source === 'env') return 'from environment / default';
  if (source === 'default') return 'default under files root';
  return '';
}

function canPickDesktopFolder() {
  return Boolean(
    window.nscDesktop?.isDesktop && typeof window.nscDesktop.pickFolder === 'function',
  );
}

function readInitialPrefs(getPrefs) {
  const prefs = (typeof getPrefs === 'function' ? getPrefs() : null) || {};
  return {
    darkMode: Boolean(prefs.darkMode),
    fontSize: Number(prefs.fontSize) || 14,
    pdsHtmlPrintPreview: prefs.pdsHtmlPrintPreview !== false,
  };
}

export function SettingsPage({ getPrefs, savePrefs, getCurrentUser, prefs: prefsProp, setPrefs }) {
  const resolvePrefs = useCallback(() => {
    if (typeof getPrefs === 'function') return getPrefs() || {};
    return prefsProp || {};
  }, [getPrefs, prefsProp]);

  const persistPrefs = useCallback(() => {
    if (typeof savePrefs === 'function') {
      savePrefs();
      return;
    }
    if (typeof setPrefs === 'function') {
      setPrefs({ ...resolvePrefs() });
    }
  }, [savePrefs, setPrefs, resolvePrefs]);

  const syncRole = useCallback(() => {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (user?.roleCode) {
      setCurrentRole(user.roleCode);
    }
  }, [getCurrentUser]);

  const [uiPrefs, setUiPrefs] = useState(() => readInitialPrefs(getPrefs || (() => prefsProp)));
  const [statsText, setStatsText] = useState('—');
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [uName, setUName] = useState('');
  const [uUser, setUUser] = useState('');
  const [uPass, setUPass] = useState('');
  const [uRole, setURole] = useState('staff');
  const [roleDisabled, setRoleDisabled] = useState(false);
  const [userSaving, setUserSaving] = useState(false);

  const [resetUser, setResetUser] = useState(null);
  const [resetPw, setResetPw] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetErr, setResetErr] = useState('');
  const [resetSaving, setResetSaving] = useState(false);

  const [auditQ, setAuditQ] = useState('');
  const [auditQDebounced, setAuditQDebounced] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditTick, setAuditTick] = useState(0);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditMeta, setAuditMeta] = useState({ page: 1, total: 0, totalPages: 1 });
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');

  const [filesRoot, setFilesRoot] = useState('');
  const [scanInboxPath, setScanInboxPath] = useState('');
  const [backupsRoot, setBackupsRoot] = useState('');
  const [scanSource, setScanSource] = useState('');
  const [backupsSource, setBackupsSource] = useState('');
  const [storageErr, setStorageErr] = useState('');
  const [desktopBrowse, setDesktopBrowse] = useState(() => canPickDesktopFolder());

  const auditTimer = useRef(null);

  // Keep authz in sync before permission checks on this render.
  syncRole();
  const manageUsers = canManageUsers();
  const superadmin = isSuperadmin();

  useEffect(() => {
    setUiPrefs(readInitialPrefs(getPrefs || (() => prefsProp)));
    setDesktopBrowse(canPickDesktopFolder());
  }, [getPrefs, prefsProp]);

  useEffect(() => {
    clearTimeout(auditTimer.current);
    auditTimer.current = setTimeout(() => {
      setAuditQDebounced(auditQ.trim());
      setAuditPage(1);
    }, 300);
    return () => clearTimeout(auditTimer.current);
  }, [auditQ]);

  const refreshStats = useCallback(async () => {
    try {
      const [{ employees }, { departments }] = await Promise.all([
        listEmployees({ all: true }),
        listDepartments(),
      ]);
      setStatsText(`${employees.length} employees · ${departments.length} departments`);
    } catch {
      setStatsText('—');
    }
  }, []);

  const loadUsers = useCallback(async () => {
    syncRole();
    if (!canManageUsers()) {
      setUsers([]);
      setUsersError('');
      return;
    }
    setUsersLoading(true);
    setUsersError('');
    try {
      const { users: rows } = await listUsers();
      setUsers(rows || []);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 403
          ? 'Only admin or superadmin accounts can manage users.'
          : err instanceof ApiError
            ? err.message
            : 'Unable to load users';
      setUsersError(msg);
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [syncRole]);

  const loadAudit = useCallback(async () => {
    syncRole();
    if (!canManageUsers()) {
      setAuditLogs([]);
      setAuditError('');
      return;
    }
    setAuditLoading(true);
    setAuditError('');
    try {
      const { logs, page, total, totalPages } = await listAuditLogs({
        page: auditPage,
        limit: AUDIT_PAGE_SIZE,
        q: auditQDebounced,
        action: auditAction,
      });
      const nextPage = page || 1;
      if (nextPage !== auditPage) {
        setAuditPage(nextPage);
      }
      setAuditMeta({
        page: nextPage,
        total: total || 0,
        totalPages: totalPages || 1,
      });
      setAuditLogs(logs || []);
    } catch (err) {
      setAuditError(err instanceof ApiError ? err.message : 'Unable to load audit logs');
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  }, [syncRole, auditPage, auditQDebounced, auditAction, auditTick]);

  const loadStorage = useCallback(async () => {
    syncRole();
    if (!isSuperadmin()) return;
    setDesktopBrowse(canPickDesktopFolder());
    setStorageErr('');
    try {
      const data = await getStorageSettings();
      setFilesRoot(data.filesRoot || '');
      setScanInboxPath(data.scanInboxPath || '');
      setBackupsRoot(data.backupsRoot || '');
      setScanSource(sourceLabel(data.sources?.scanInboxPath));
      setBackupsSource(sourceLabel(data.sources?.backupsRoot));
    } catch (err) {
      setStorageErr(err instanceof ApiError ? err.message : 'Failed to load storage paths.');
    }
  }, [syncRole]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  useEffect(() => {
    loadStorage();
  }, [loadStorage]);

  function handleToggleDark() {
    const prefs = resolvePrefs();
    prefs.darkMode = !prefs.darkMode;
    document.body.classList.toggle('dark', prefs.darkMode);
    setUiPrefs((prev) => ({ ...prev, darkMode: prefs.darkMode }));
    persistPrefs();
  }

  function handleTogglePdsHtmlPrint() {
    const prefs = resolvePrefs();
    const enabled = prefs.pdsHtmlPrintPreview !== false;
    prefs.pdsHtmlPrintPreview = !enabled;
    setUiPrefs((prev) => ({ ...prev, pdsHtmlPrintPreview: prefs.pdsHtmlPrintPreview }));
    persistPrefs();
    showToast(
      prefs.pdsHtmlPrintPreview
        ? 'Print HTML preview enabled — you can print the HTML layout while the PDF loads.'
        : 'Print HTML preview disabled — printing will wait for the official PDF.',
      'info',
    );
  }

  function handleSetFont(size) {
    const prefs = resolvePrefs();
    prefs.fontSize = size;
    document.documentElement.style.setProperty('--fs', `${size}px`);
    setUiPrefs((prev) => ({ ...prev, fontSize: size }));
    persistPrefs();
    showToast(`Font size set to ${size}px.`, 'info');
  }

  async function openUserModal(user = null) {
    syncRole();
    if (!canManageUsers()) {
      showToast('You do not have permission to manage users.', 'error');
      return;
    }
    try {
      const { roles: roleRows } = await listRoles();
      const filtered = (roleRows || []).filter((r) => {
        if (r.code === 'superadmin') return isSuperadmin();
        return true;
      });
      setRoles(filtered);

      const isEdit = Boolean(user);
      setEditUser(user);
      setUName(user?.displayName || '');
      setUUser(user?.username || '');
      setUPass('');

      if (isEdit) {
        if (user.role?.code === 'superadmin' && !isSuperadmin()) {
          setRoleDisabled(true);
          setURole(user.role?.code || 'staff');
        } else {
          setRoleDisabled(false);
          const code = user.role?.code || 'staff';
          setURole(filtered.some((r) => r.code === code) ? code : filtered[0]?.code || 'staff');
        }
      } else {
        setRoleDisabled(false);
        setURole(filtered.some((r) => r.code === 'staff') ? 'staff' : filtered[0]?.code || 'staff');
      }
      setUserModalOpen(true);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to open user form.', 'error');
    }
  }

  function closeUserModal() {
    setUserModalOpen(false);
    setEditUser(null);
    setUPass('');
  }

  async function saveUser() {
    const displayName = uName.trim();
    const username = uUser.trim();
    const password = uPass;
    const roleCode = uRole;

    if (!displayName) {
      showToast('Display name is required.', 'error');
      return;
    }

    setUserSaving(true);
    try {
      if (editUser?.id) {
        await updateUser(editUser.id, { displayName, roleCode });
        closeUserModal();
        showToast('User updated.', 'success');
        await loadUsers();
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
      await loadUsers();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to save user.', 'error');
    } finally {
      setUserSaving(false);
    }
  }

  async function toggleUserActive(id, isActive) {
    const verb = isActive ? 'activate' : 'deactivate';
    if (!confirm(`${verb[0].toUpperCase() + verb.slice(1)} this user?`)) return;
    try {
      await updateUser(id, { isActive });
      showToast(`User ${verb}d.`, 'success');
      await loadUsers();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `${verb[0].toUpperCase() + verb.slice(1)} failed.`, 'error');
    }
  }

  async function permanentlyDeleteUser(id) {
    if (
      !confirm(
        'Permanently delete this inactive user?\n\nThis cannot be undone. Audit history will keep the action but clear the deleted account link.',
      )
    ) {
      return;
    }
    try {
      await deleteUser(id);
      showToast('User deleted permanently.', 'success');
      await loadUsers();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Delete failed.', 'error');
    }
  }

  function openResetPasswordModal(user) {
    setResetUser(user);
    setResetPw('');
    setResetConfirm('');
    setResetErr('');
  }

  function closeResetPasswordModal() {
    setResetUser(null);
    setResetPw('');
    setResetConfirm('');
    setResetErr('');
  }

  async function submitResetPassword() {
    setResetErr('');
    if (!resetPw || !resetConfirm) {
      setResetErr('Both password fields are required.');
      return;
    }
    if (resetPw.length < 8) {
      setResetErr('Password must be at least 8 characters.');
      return;
    }
    if (resetPw !== resetConfirm) {
      setResetErr('Passwords do not match.');
      return;
    }
    setResetSaving(true);
    try {
      await resetUserPassword(resetUser.id, resetPw);
      closeResetPasswordModal();
      showToast('Password reset. Activate the user when ready.', 'success');
    } catch (err) {
      setResetErr(err instanceof ApiError ? err.message : 'Reset failed.');
    } finally {
      setResetSaving(false);
    }
  }

  async function browseStorageFolder(kind, title) {
    if (!canPickDesktopFolder()) return;
    setStorageErr('');
    const current = kind === 'inbox' ? scanInboxPath : backupsRoot;
    const result = await window.nscDesktop.pickFolder({
      title,
      defaultPath: current.trim() || undefined,
    });
    if (result?.canceled || !result?.path) return;
    if (kind === 'inbox') setScanInboxPath(result.path);
    else setBackupsRoot(result.path);
  }

  async function testStoragePaths() {
    if (!isSuperadmin()) return;
    setStorageErr('');
    try {
      await validateStorageSettings({
        scanInboxPath: scanInboxPath.trim(),
        backupsRoot: backupsRoot.trim(),
      });
      showToast('Paths are valid and writable.', 'success');
    } catch (err) {
      setStorageErr(err instanceof ApiError ? err.message : 'Path check failed.');
    }
  }

  async function saveStoragePaths() {
    if (!isSuperadmin()) return;
    setStorageErr('');
    const body = {
      scanInboxPath: scanInboxPath.trim(),
      backupsRoot: backupsRoot.trim(),
    };
    if (!body.scanInboxPath || !body.backupsRoot) {
      setStorageErr('Both scan inbox and backup paths are required.');
      return;
    }
    try {
      const data = await updateStorageSettings(body);
      setFilesRoot(data.filesRoot || '');
      setScanInboxPath(data.scanInboxPath || '');
      setBackupsRoot(data.backupsRoot || '');
      setScanSource(sourceLabel(data.sources?.scanInboxPath));
      setBackupsSource(sourceLabel(data.sources?.backupsRoot));
      showToast('Storage paths saved.', 'success');
    } catch (err) {
      setStorageErr(err instanceof ApiError ? err.message : 'Failed to save paths.');
    }
  }

  const pageInfo =
    auditMeta.total === 0
      ? 'No entries'
      : `Page ${auditMeta.page} of ${auditMeta.totalPages} · ${auditMeta.total} entr${auditMeta.total === 1 ? 'y' : 'ies'}`;

  return (
    <div className="settings-wrap">
      <section className="settings-section">
        <h3 className="settings-section-title">Your preferences</h3>
        <div className="settings-section-grid">
          <div className="settings-card">
            <h4>Appearance</h4>
            <div className="setting-row">
              <div className="sl">
                <div className="sl-title">Dark Mode</div>
                <div className="sl-desc">Switch to dark theme</div>
              </div>
              <div
                className={`toggle${uiPrefs.darkMode ? ' on' : ''}`}
                role="switch"
                aria-checked={uiPrefs.darkMode}
                tabIndex={0}
                onClick={handleToggleDark}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleToggleDark();
                  }
                }}
              >
                <div className="knob" />
              </div>
            </div>
            <div className="setting-row">
              <div className="sl">
                <div className="sl-title">Font Size</div>
                <div className="sl-desc">Adjust text size across the app</div>
              </div>
              <div className="fs-btns">
                {FONT_SIZES.map(({ size, label }) => (
                  <button
                    key={size}
                    type="button"
                    data-size={size}
                    className={`fs-btn${uiPrefs.fontSize === size ? ' active' : ''}`}
                    onClick={() => handleSetFont(size)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="settings-card">
            <h4>PDS</h4>
            <div className="setting-row">
              <div className="sl">
                <div className="sl-title">HTML print preview</div>
                <div className="sl-desc">
                  When off, printing waits for the official PDF instead of allowing HTML preview printing
                </div>
              </div>
              <div
                className={`toggle${uiPrefs.pdsHtmlPrintPreview ? ' on' : ''}`}
                role="switch"
                aria-checked={uiPrefs.pdsHtmlPrintPreview}
                tabIndex={0}
                onClick={handleTogglePdsHtmlPrint}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTogglePdsHtmlPrint();
                  }
                }}
              >
                <div className="knob" />
              </div>
            </div>
          </div>

          <div className="settings-card">
            <h4>Account</h4>
            <div className="setting-row">
              <div className="sl">
                <div className="sl-title">Password</div>
                <div className="sl-desc">Update your sign-in password</div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-edit"
                onClick={() => showChangePassword(false)}
              >
                Change password
              </button>
            </div>
            <div className="setting-row">
              <div className="sl">
                <div className="sl-title">Version</div>
              </div>
              <span className="settings-mono-value">v1.0.0</span>
            </div>
            <div className="setting-row">
              <div className="sl">
                <div className="sl-title">Records</div>
                <div className="sl-desc">{statsText}</div>
              </div>
              <button type="button" className="btn btn-sm btn-edit" onClick={() => refreshStats()}>
                Refresh
              </button>
            </div>
          </div>
        </div>
      </section>

      {manageUsers && (
        <section className="settings-section needs-admin">
          <h3 className="settings-section-title">Administration</h3>
          <div className="settings-section-stack">
            <div className="settings-card">
              <h4>User Accounts</h4>
              <table className="user-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {usersLoading && (
                    <tr>
                      <td colSpan={5} className="settings-muted">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!usersLoading && usersError && (
                    <tr>
                      <td colSpan={5} className="settings-muted">
                        {usersError}
                      </td>
                    </tr>
                  )}
                  {!usersLoading && !usersError && !users.length && (
                    <tr>
                      <td colSpan={5} className="settings-muted">
                        No user accounts yet.
                      </td>
                    </tr>
                  )}
                  {!usersLoading &&
                    !usersError &&
                    users.map((u) => {
                      const protectedRole = u.role?.code === 'superadmin';
                      const canModify = !protectedRole || isSuperadmin();
                      return (
                        <tr key={u.id}>
                          <td>{u.displayName || u.username}</td>
                          <td>
                            <code className="settings-username">{u.username}</code>
                          </td>
                          <td>
                            <span className="badge active">{u.role?.name}</span>
                          </td>
                          <td>
                            {u.isActive ? (
                              <span className="badge active">Active</span>
                            ) : (
                              <span
                                className="badge"
                                style={{ background: 'var(--bg-base)', color: 'var(--text-3)' }}
                              >
                                Inactive
                              </span>
                            )}
                          </td>
                          <td>
                            {canModify ? (
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 6,
                                  flexWrap: 'wrap',
                                  justifyContent: 'flex-end',
                                }}
                              >
                                <button
                                  type="button"
                                  className="btn btn-sm btn-edit"
                                  onClick={() => openUserModal(u)}
                                >
                                  Edit
                                </button>
                                {u.isActive ? (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-del"
                                    onClick={() => toggleUserActive(u.id, false)}
                                  >
                                    Deactivate
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-edit"
                                      onClick={() => openResetPasswordModal(u)}
                                    >
                                      Reset password
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-edit"
                                      onClick={() => toggleUserActive(u.id, true)}
                                    >
                                      Activate
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-del"
                                      onClick={() => permanentlyDeleteUser(u.id)}
                                    >
                                      Delete forever
                                    </button>
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="settings-muted">Protected</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: 16 }}
                onClick={() => openUserModal(null)}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add User
              </button>
            </div>

            <div className="settings-card">
              <h4>Audit log</h4>
              <div className="audit-toolbar">
                <input
                  type="search"
                  placeholder="Search action, user, IP…"
                  value={auditQ}
                  onChange={(e) => setAuditQ(e.target.value)}
                />
                <select
                  value={auditAction}
                  onChange={(e) => {
                    setAuditAction(e.target.value);
                    setAuditPage(1);
                  }}
                >
                  {AUDIT_ACTIONS.map((opt) => (
                    <option key={opt.value || 'all'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-sm btn-edit"
                  onClick={() => {
                    setAuditPage(1);
                    setAuditTick((t) => t + 1);
                  }}
                >
                  Refresh
                </button>
              </div>
              <div className="audit-list">
                {auditLoading && <p className="settings-muted">Loading…</p>}
                {!auditLoading && auditError && <p className="settings-muted">{auditError}</p>}
                {!auditLoading && !auditError && !auditLogs.length && (
                  <p className="settings-muted" style={{ padding: '8px 0' }}>
                    No matching audit entries.
                  </p>
                )}
                {!auditLoading &&
                  !auditError &&
                  auditLogs.map((log) => {
                    const when = log.createdAt
                      ? new Date(log.createdAt).toLocaleString('en-PH')
                      : '—';
                    const who = log.actor
                      ? log.actor.displayName || log.actor.username
                      : null;
                    return (
                      <div className="audit-row" key={log.id || `${log.action}-${log.createdAt}-${log.ip}`}>
                        <div className="audit-main">
                          <span className="audit-action">{log.action}</span>
                          <span className="audit-who">
                            {who || (
                              <span style={{ color: 'var(--text-3)' }}>system / unknown</span>
                            )}
                          </span>
                        </div>
                        <div className="audit-meta">
                          {when}
                          {log.entityType ? ` · ${log.entityType}` : ''}
                          {log.entityId ? (
                            <>
                              {' · '}
                              <code>{String(log.entityId).slice(0, 26)}</code>
                            </>
                          ) : null}
                          {log.ip ? ` · ${log.ip}` : ''}
                        </div>
                      </div>
                    );
                  })}
              </div>
              <div className="pager">
                <button
                  type="button"
                  className="btn btn-sm btn-edit"
                  disabled={!auditMeta.total || auditMeta.page <= 1}
                  onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <span className="pager-info">{pageInfo}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-edit"
                  disabled={!auditMeta.total || auditMeta.page >= auditMeta.totalPages}
                  onClick={() => setAuditPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {superadmin && (
        <section className="settings-section needs-superadmin">
          <h3 className="settings-section-title">Server storage</h3>
          <div className="settings-section-stack">
            <div className="settings-card">
              <h4>Storage paths</h4>
              <p className="settings-hint">
                Absolute paths on the <strong>server</strong> machine. Changing a path does not move existing
                files — new scans/backups use the new folder from then on.
                {desktopBrowse && (
                  <span className="desktop-only-hint">
                    {' '}
                    Browse picks a folder on <em>this</em> computer — use it only when the desktop app runs on
                    the same machine as the API.
                  </span>
                )}
              </p>
              <div className="storage-paths-form">
                <div className="fg full">
                  <label htmlFor="storage-files-root">Files root (read-only)</label>
                  <input id="storage-files-root" type="text" readOnly value={filesRoot} />
                </div>
                <div className="fg full">
                  <label htmlFor="storage-scan-inbox">Scan inbox path</label>
                  <div className="path-field-row">
                    <input
                      id="storage-scan-inbox"
                      type="text"
                      placeholder="C:\nsc-erms-files\inbox"
                      autoComplete="off"
                      value={scanInboxPath}
                      onChange={(e) => setScanInboxPath(e.target.value)}
                    />
                    {desktopBrowse && (
                      <button
                        type="button"
                        className="btn btn-sm btn-edit desktop-folder-btn"
                        onClick={() =>
                          browseStorageFolder('inbox', 'Select scan inbox folder').catch(() => {})
                        }
                      >
                        Browse…
                      </button>
                    )}
                  </div>
                  <span className="field-hint">{scanSource}</span>
                </div>
                <div className="fg full">
                  <label htmlFor="storage-backups-root">Backup path</label>
                  <div className="path-field-row">
                    <input
                      id="storage-backups-root"
                      type="text"
                      placeholder="C:\nsc-erms-backups"
                      autoComplete="off"
                      value={backupsRoot}
                      onChange={(e) => setBackupsRoot(e.target.value)}
                    />
                    {desktopBrowse && (
                      <button
                        type="button"
                        className="btn btn-sm btn-edit desktop-folder-btn"
                        onClick={() =>
                          browseStorageFolder('backups', 'Select backup folder').catch(() => {})
                        }
                      >
                        Browse…
                      </button>
                    )}
                  </div>
                  <span className="field-hint">{backupsSource}</span>
                </div>
                {storageErr ? (
                  <p className="login-err">{storageErr}</p>
                ) : null}
                <div className="storage-paths-actions">
                  <button type="button" className="btn btn-cancel" onClick={testStoragePaths}>
                    Test paths
                  </button>
                  <button type="button" className="btn btn-primary" onClick={saveStoragePaths}>
                    Save paths
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {userModalOpen &&
        createPortal(
          <div
            className="overlay open"
            onClick={(e) => e.target === e.currentTarget && closeUserModal()}
          >
            <div className="modal" style={{ width: 400 }}>
              <button type="button" className="modal-close" onClick={closeUserModal}>
                ×
              </button>
              <h3>{editUser ? 'Edit User' : 'Add User Account'}</h3>
              <div className="fg" style={{ marginBottom: 13 }}>
                <label>Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Maria Santos"
                  value={uName}
                  onChange={(e) => setUName(e.target.value)}
                />
              </div>
              {!editUser && (
                <>
                  <div className="fg user-create-only" style={{ marginBottom: 13 }}>
                    <label>Username *</label>
                    <input
                      type="text"
                      placeholder="e.g. msantos"
                      value={uUser}
                      onChange={(e) => setUUser(e.target.value)}
                    />
                  </div>
                  <div className="fg user-create-only" style={{ marginBottom: 13 }}>
                    <label>Password *</label>
                    <PasswordInput
                      placeholder="Min. 8 characters"
                      value={uPass}
                      onChange={(e) => setUPass(e.target.value)}
                    />
                  </div>
                </>
              )}
              <div className="fg">
                <label>Role</label>
                <select
                  value={uRole}
                  disabled={roleDisabled}
                  onChange={(e) => setURole(e.target.value)}
                >
                  {roles.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-cancel" onClick={closeUserModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={userSaving}
                  onClick={saveUser}
                >
                  {editUser ? 'Save changes' : 'Create user'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {resetUser &&
        createPortal(
          <div
            className="overlay open"
            onClick={(e) => e.target === e.currentTarget && closeResetPasswordModal()}
          >
            <div className="modal" style={{ width: 400 }}>
              <button type="button" className="modal-close" onClick={closeResetPasswordModal}>
                ×
              </button>
              <h3>Reset password</h3>
              <p style={{ fontSize: '0.8571rem', color: 'var(--text-2)', margin: '-8px 0 14px' }}>
                Set a new password for inactive user{' '}
                <strong>{resetUser.displayName || resetUser.username}</strong>. They must change it on
                first login after activation.
              </p>
              <div className="fg" style={{ marginBottom: 13 }}>
                <label>New password *</label>
                <PasswordInput
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                />
              </div>
              <div className="fg" style={{ marginBottom: 13 }}>
                <label>Confirm password *</label>
                <PasswordInput
                  autoComplete="new-password"
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                />
              </div>
              <div className="login-err">{resetErr}</div>
              <div className="modal-actions">
                <button type="button" className="btn btn-cancel" onClick={closeResetPasswordModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={resetSaving}
                  onClick={submitResetPassword}
                >
                  Reset password
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
