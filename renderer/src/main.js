import { getEl, getInitials } from './js/utils/helpers.js';
import { showToast } from './js/utils/toast.js';

import { me, logout as apiLogout } from './js/api/auth.js';
import { ApiError } from './js/api/client.js';

import { initLogin, normalizeUser } from './js/components/login.js';
import { initChangePassword, showChangePassword } from './js/components/changePassword.js';
import {
  initSetupWizard,
  checkSetupNeeded,
  showSetupWizard,
  hideSetupWizard,
} from './js/components/setupWizard.js';
import {
  initEmployeeTable,
  renderEmployeeTable,
  refreshFilterDropdowns,
} from './js/components/employeeTable.js';
import { initEmployeeModal } from './js/components/employeeModal.js';
import { initProfilePanel, closeProfilePanel } from './js/components/profilePanel.js';
import { initDocuments } from './js/components/documents.js';
import { initScanModal } from './js/components/scanModal.js';
import { initScanInbox, renderScanInboxPage } from './js/components/scanInbox.js';
import { initTrash, renderTrashPage } from './js/components/trash.js';
import {
  initDepartments as initDepartmentComponent,
  renderDepartmentPage,
} from './js/components/departments.js';
import { initBackup, renderBackupPage } from './js/components/backup.js';
import { initSettings, renderSettingsPage } from './js/components/settings.js';
import { initExport } from './js/components/export.js';

const App = {
  currentUser: null,
  setupCompleted: false,
  searchQuery: '',
  prefs: { darkMode: false, fontSize: 14 },
  savePrefs() {
    localStorage.setItem('nsc_erms_prefs', JSON.stringify(App.prefs));
  },
  loadPrefs() {
    try {
      const s =
        localStorage.getItem('nsc_erms_prefs') ||
        localStorage.getItem('edurecords_prefs');
      if (s) App.prefs = { ...App.prefs, ...JSON.parse(s) };
    } catch { /* ignore */ }
  },
  applyPrefs() {
    document.body.classList.toggle('dark', App.prefs.darkMode);
    document.getElementById('dark-toggle')?.classList.toggle('on', App.prefs.darkMode);
    document.documentElement.style.setProperty('--fs', App.prefs.fontSize + 'px');
    const sizes = [13, 14, 15, 16];
    document.querySelectorAll('.fs-btn').forEach((btn, i) =>
      btn.classList.toggle('active', sizes[i] === App.prefs.fontSize),
    );
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  App.loadPrefs();
  App.applyPrefs();

  const getSearchQuery = () => App.searchQuery;

  initLogin(handleLogin);
  initChangePassword(afterPasswordChanged);
  initSetupWizard(afterSetupComplete);
  initEmployeeTable();
  initEmployeeModal(getSearchQuery);
  initProfilePanel(getSearchQuery);
  initDocuments();
  initScanModal();
  initScanInbox();
  initTrash();
  initDepartmentComponent();
  initBackup();
  initSettings(() => App.prefs, () => App.savePrefs());
  initExport();

  wireNavigation();
  wireSearch();
  wireLogout();

  await restoreSession();
});

async function restoreSession() {
  try {
    const status = await checkSetupNeeded();
    App.setupCompleted = Boolean(status.setupCompleted);

    const { user } = await me();
    enterAuthenticated(normalizeUser(user), status);
  } catch (err) {
    showLoginOnly();
    if (err instanceof ApiError && err.status === 401) return;
  }
}

function showLoginOnly() {
  hideSetupWizard();
  getEl('pw-overlay')?.classList.remove('open');
  getEl('app').style.display = 'none';
  getEl('login-screen').style.display = 'flex';
}

function enterAuthenticated(user, setupStatus) {
  App.currentUser = user;
  getEl('login-screen').style.display = 'none';

  if (user.mustChangePassword) {
    getEl('app').style.display = 'none';
    hideSetupWizard();
    showChangePassword(true);
    return;
  }

  if (!App.setupCompleted) {
    if (user.roleCode === 'superadmin') {
      showSetupWizard({
        ...setupStatus,
        filesRootHint: setupStatus.filesRoot || 'C:\\nsc-erms-files',
        scanInboxHint: setupStatus.scanInboxPath || 'C:\\nsc-erms-files\\inbox',
      });
      return;
    }
    getEl('login-screen').style.display = 'flex';
    getEl('app').style.display = 'none';
    getEl('login-err').textContent =
      'System setup is not complete. Ask a superadmin to finish first-run setup.';
    return;
  }

  showAppShell(user);
}

async function showAppShell(user) {
  hideSetupWizard();
  getEl('login-screen').style.display = 'none';
  getEl('app').style.display = 'flex';
  getEl('su-name').textContent = user.name;
  getEl('su-role').textContent = user.role;
  getEl('su-avatar').textContent = getInitials(
    user.name.split(' ')[0],
    user.name.split(' ')[1] ?? '',
  );
  App.applyPrefs();
  try {
    await refreshFilterDropdowns();
    await renderEmployeeTable();
    await renderScanInboxPage();
    await renderTrashPage();
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : 'Failed to load employees.', 'error');
  }
}

function handleLogin(user) {
  App.currentUser = user;
  checkSetupNeeded()
    .then((status) => {
      App.setupCompleted = Boolean(status.setupCompleted);
      enterAuthenticated(user, status);
    })
    .catch(() => {
      enterAuthenticated(user, { setupCompleted: App.setupCompleted });
    });
}

function afterPasswordChanged() {
  if (App.currentUser) App.currentUser.mustChangePassword = false;
  checkSetupNeeded()
    .then((status) => {
      App.setupCompleted = Boolean(status.setupCompleted);
      if (!App.setupCompleted && App.currentUser?.roleCode === 'superadmin') {
        showSetupWizard({
          ...status,
          filesRootHint: status.filesRoot || 'C:\\nsc-erms-files',
          scanInboxHint: status.scanInboxPath || 'C:\\nsc-erms-files\\inbox',
        });
      } else {
        showAppShell(App.currentUser);
      }
    })
    .catch(() => showAppShell(App.currentUser));
}

function afterSetupComplete() {
  App.setupCompleted = true;
  showAppShell(App.currentUser);
}

function wireNavigation() {
  document.querySelectorAll('#sidebar-nav a').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const pageName = link.dataset.page;
      if (pageName) navTo(pageName, link);
    });
  });
}

function navTo(pageName, linkEl) {
  document.querySelectorAll('#sidebar-nav a').forEach((a) => a.classList.remove('active'));
  linkEl.classList.add('active');
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  getEl('page-' + pageName).classList.add('active');

  const clone = linkEl.cloneNode(true);
  clone.querySelectorAll('.nav-badge,.nav-section-label').forEach((e) => e.remove());
  getEl('page-title').textContent = clone.textContent.trim();
  getEl('search-box').style.display = pageName === 'employees' ? 'block' : 'none';
  getEl('search-input').value = '';
  App.searchQuery = '';

  closeProfilePanel();
  if (pageName === 'departments') renderDepartmentPage();
  if (pageName === 'scan-inbox') renderScanInboxPage().catch(() => {});
  if (pageName === 'trash') renderTrashPage().catch(() => {});
  if (pageName === 'backup') renderBackupPage();
  if (pageName === 'settings') renderSettingsPage();
  if (pageName === 'employees') {
    renderEmployeeTable().catch(() => {});
  }
}

function wireSearch() {
  let timer = null;
  getEl('search-input').addEventListener('input', (e) => {
    App.searchQuery = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(() => {
      renderEmployeeTable(App.searchQuery).catch(showLoadError);
    }, 250);
  });
}

function showLoadError(err) {
  showToast(err instanceof ApiError ? err.message : 'Failed to load employees.', 'error');
}

function wireLogout() {
  getEl('logout-btn').addEventListener('click', handleLogout);
}

async function handleLogout() {
  if (!confirm('Log out?')) return;
  try {
    await apiLogout();
  } catch { /* clear local anyway */ }
  App.currentUser = null;
  closeProfilePanel();
  hideSetupWizard();
  getEl('pw-overlay')?.classList.remove('open');
  getEl('app').style.display = 'none';
  getEl('login-screen').style.display = 'flex';
  getEl('login-user').value = '';
  getEl('login-pass').value = '';
  showToast('Signed out.', 'info');
}
