import {
  listUsers,
  listRoles,
  createUser,
  updateUser,
} from '../api/users.js';
import { listEmployees } from '../api/employees.js';
import { listDepartments } from '../api/departments.js';
import { listAuditLogs } from '../api/audit.js';
import { ApiError } from '../api/client.js';
import { getEl, setHTML, escapeHtml } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { canManageUsers, isSuperadmin, setCurrentRole } from '../utils/authz.js';

let _getPrefs = null;
let _savePrefs = null;
let _getCurrentUser = () => null;
let _roles = [];
let _auditPage = 1;
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

  getEl('add-user-btn')?.addEventListener('click', () => {
    openUserModal().catch((err) => {
      showToast(err instanceof ApiError ? err.message : 'Unable to open user form.', 'error');
    });
  });
  getEl('close-user-modal')?.addEventListener('click', closeUserModal);
  getEl('user-modal-cancel')?.addEventListener('click', closeUserModal);
  getEl('user-modal-save')?.addEventListener('click', () => {
    saveUser().catch((err) => {
      showToast(err instanceof ApiError ? err.message : 'Failed to create user.', 'error');
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
}

export async function renderSettingsPage() {
  syncRoleFromSession();
  await renderUserTable();
  await renderAuditLogs();
  await refreshStats();
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

async function openUserModal() {
  syncRoleFromSession();
  if (!canManageUsers()) {
    showToast('You do not have permission to manage users.', 'error');
    return;
  }
  getEl('u-name').value = '';
  getEl('u-user').value = '';
  getEl('u-pass').value = '';
  await fillRoleSelect();
  getEl('user-overlay').classList.add('open');
}

function closeUserModal() {
  getEl('user-overlay').classList.remove('open');
}

async function fillRoleSelect() {
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
  if (_roles.some((r) => r.code === 'staff')) {
    sel.value = 'staff';
  }
}

async function saveUser() {
  const displayName = getEl('u-name').value.trim();
  const username = getEl('u-user').value.trim();
  const password = getEl('u-pass').value;
  const roleCode = getEl('u-role').value;

  if (!displayName || !username || !password) {
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

async function renderUserTable() {
  syncRoleFromSession();

  try {
    const { users } = await listUsers();
    if (!users.length) {
      setHTML(
        'user-table',
        `<tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr>
         <tr><td colspan="5" style="color:var(--text-3);font-size:12px;">No user accounts yet.</td></tr>`,
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
        const statusBadge = u.isActive
          ? `<span class="badge active" style="font-size:10px;">Active</span>`
          : `<span class="badge" style="font-size:10px;background:var(--bg-base);color:var(--text-3);">Inactive</span>`;
        let action = '';
        if (!protectedRole || isSuperadmin()) {
          if (u.isActive) {
            action = `<button type="button" class="btn btn-sm btn-del" data-deactivate-user="${u.id}">Deactivate</button>`;
          } else {
            action = `<button type="button" class="btn btn-sm btn-edit" data-activate-user="${u.id}">Activate</button>`;
          }
        } else {
          action = `<span style="font-size:11px;color:var(--text-3);">Protected</span>`;
        }
        return `
      <tr>
        <td>${escapeHtml(u.displayName || u.username)}</td>
        <td><code style="background:var(--bg-base);padding:2px 8px;border-radius:6px;font-size:12px;font-family:'DM Mono',monospace;">${escapeHtml(u.username)}</code></td>
        <td><span class="badge active" style="font-size:10px;">${escapeHtml(u.role.name)}</span></td>
        <td>${statusBadge}</td>
        <td>${action}</td>
      </tr>`;
      })
      .join('')}`,
    );

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
  } catch (err) {
    const msg =
      err instanceof ApiError && err.status === 403
        ? 'Only admin or superadmin accounts can manage users.'
        : err instanceof ApiError
          ? err.message
          : 'Unable to load users';
    setHTML(
      'user-table',
      `<tr><td colspan="5" style="color:var(--text-3);font-size:12px;">${escapeHtml(msg)}</td></tr>`,
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
      `<p style="font-size:12px;color:var(--text-3);">Only administrators can view audit logs.</p>`,
    );
    return;
  }

  setHTML('audit-list', `<p style="font-size:12px;color:var(--text-3);">Loading…</p>`);

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
        `<p style="font-size:12px;color:var(--text-3);padding:8px 0;">No matching audit entries.</p>`,
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
      `<p style="font-size:12px;color:var(--text-3);">${escapeHtml(err instanceof ApiError ? err.message : 'Unable to load audit logs')}</p>`,
    );
  }
}
