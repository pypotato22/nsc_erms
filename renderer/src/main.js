import { getEl, getInitials } from './js/utils/helpers.js';
import { showToast } from './js/utils/toast.js';

import { me, logout as apiLogout } from './js/api/auth.js';
import { ApiError } from './js/api/client.js';

import { initLogin, normalizeUser } from './js/components/login.js';
import { initDesktopTitlebar } from './js/components/titlebar.js';
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
  resetEmployeePage,
} from './js/components/employeeTable.js';
import { initEmployeeModal } from './js/components/employeeModal.js';
import { initProfilePanel, closeProfilePanel, refreshOpenProfileForLiveSync } from './js/components/profilePanel.js';
import { initDocuments, refreshOpenDocsTabForLiveSync } from './js/components/documents.js';
import { initScanInbox, renderScanInboxPage } from './js/components/scanInbox.js';
import { initTrash, renderTrashPage } from './js/components/trash.js';
import {
  initArchivedEmployees,
  renderArchivedEmployeesPage,
} from './js/components/archivedEmployees.js';
import {
  initDepartments as initDepartmentComponent,
  renderDepartmentPage,
} from './js/components/departments.js';
import { initPositions, renderPositionsPage } from './js/components/positions.js';
import { initBackup, renderBackupPage } from './js/components/backup.js';
import { initSettings, renderSettingsPage } from './js/components/settings.js';
import { initExport } from './js/components/export.js';
import { setCurrentRole, clearCurrentRole } from './js/utils/authz.js';
import { startLiveSync, stopLiveSync } from './js/utils/liveSync.js';

const FONT_SIZES = [13, 14, 17, 21];

function normalizeFontSize(size) {
  const n = Number(size);
  if (FONT_SIZES.includes(n)) return n;
  return FONT_SIZES.reduce((best, s) =>
    Math.abs(s - n) < Math.abs(best - n) ? s : best,
  );
}

const App = {
  currentUser: null,
  setupCompleted: false,
  searchQuery: '',
  currentPage: 'employees',
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
      App.prefs.fontSize = normalizeFontSize(App.prefs.fontSize);
    } catch { /* ignore */ }
  },
  applyPrefs() {
    document.body.classList.toggle('dark', App.prefs.darkMode);
    document.getElementById('dark-toggle')?.classList.toggle('on', App.prefs.darkMode);
    document.documentElement.style.setProperty('--fs', App.prefs.fontSize + 'px');
    document.querySelectorAll('.fs-btn').forEach((btn) =>
      btn.classList.toggle('active', Number(btn.dataset.size) === App.prefs.fontSize),
    );
  },
};

const ROUTE_PAGES = [
  'employees',
  'departments',
  'positions',
  'scan-inbox',
  'trash',
  'archived-employees',
  'backup',
  'export',
  'settings',
];

document.addEventListener('DOMContentLoaded', async () => {
  App.loadPrefs();
  App.applyPrefs();
  initDesktopTitlebar();

  const getSearchQuery = () => App.searchQuery;

  initLogin(handleLogin);
  initChangePassword(afterPasswordChanged);
  initSetupWizard(afterSetupComplete);
  initEmployeeTable();
  initEmployeeModal(getSearchQuery);
  initProfilePanel(getSearchQuery);
  initDocuments();
  initScanInbox();
  initTrash();
  initArchivedEmployees(getSearchQuery);
  initDepartmentComponent();
  initPositions();
  initBackup();
  initSettings(
    () => App.prefs,
    () => App.savePrefs(),
    () => App.currentUser,
  );
  initExport();

  wireNavigation();
  wireSearch();
  wireLogout();
  window.addEventListener('hashchange', () => {
    if (getEl('app').style.display === 'flex') applyRouteFromHash();
  });

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
  clearCurrentRole();
  getEl('pw-overlay')?.classList.remove('open');
  getEl('app').style.display = 'none';
  getEl('login-screen').style.display = 'flex';
}

function enterAuthenticated(user, setupStatus) {
  App.currentUser = user;
  setCurrentRole(user.roleCode);
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
  setCurrentRole(user?.roleCode);
  getEl('login-screen').style.display = 'none';
  getEl('app').style.display = 'flex';
  getEl('su-name').textContent = user.name;
  getEl('su-role').textContent = user.role;
  getEl('su-avatar').textContent = getInitials(
    user.name.split(' ')[0],
    user.name.split(' ')[1] ?? '',
  );
  App.applyPrefs();
  startLiveSync({
    getCurrentUserId: () => App.currentUser?.id,
    'employees.changed': (payload) => {
      // Badge + list surfaces
      renderArchivedEmployeesPage().catch(() => {});
      if (App.currentPage === 'employees') {
        renderEmployeeTable(App.searchQuery).catch(() => {});
      }
      refreshOpenProfileForLiveSync(payload).catch(() => {});
    },
    'documents.changed': (payload) => {
      renderTrashPage().catch(() => {});
      refreshOpenDocsTabForLiveSync(payload).catch(() => {});
    },
    'scan.changed': () => {
      renderScanInboxPage().catch(() => {});
    },
    'departments.changed': () => {
      refreshFilterDropdowns().catch(() => {});
      if (App.currentPage === 'departments') {
        renderDepartmentPage();
      }
      if (App.currentPage === 'employees') {
        renderEmployeeTable(App.searchQuery).catch(() => {});
      }
    },
    'positions.changed': () => {
      refreshFilterDropdowns().catch(() => {});
      if (App.currentPage === 'positions') {
        renderPositionsPage().catch(() => {});
      }
      if (App.currentPage === 'departments') {
        renderDepartmentPage();
      }
    },
  });
  try {
    await refreshFilterDropdowns();
    await renderEmployeeTable();
    await renderScanInboxPage();
    await renderTrashPage();
    await renderArchivedEmployeesPage();
    applyRouteFromHash();
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
  if (App.currentUser) {
    App.currentUser.mustChangePassword = false;
    setCurrentRole(App.currentUser.roleCode);
  }
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
      if (pageName) navTo(pageName, link, true);
    });
  });
}

function parseRouteHash() {
  const raw = (location.hash || '').replace(/^#/, '').trim();
  if (!raw) return 'employees';
  const page = raw.split('/')[0];
  return ROUTE_PAGES.includes(page) ? page : 'employees';
}

function applyRouteFromHash() {
  const pageName = parseRouteHash();
  const link = document.querySelector(`#sidebar-nav a[data-page="${pageName}"]`);
  if (link) navTo(pageName, link, false);
}

function navTo(pageName, linkEl, updateHash = true) {
  if (updateHash && location.hash.replace(/^#/, '') !== pageName) {
    location.hash = pageName;
  }

  App.currentPage = pageName;
  document.querySelectorAll('#sidebar-nav a').forEach((a) => a.classList.remove('active'));
  linkEl.classList.add('active');
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  getEl('page-' + pageName).classList.add('active');

  const clone = linkEl.cloneNode(true);
  clone.querySelectorAll('.nav-badge,.nav-section-label').forEach((e) => e.remove());
  getEl('page-title').textContent = clone.textContent.trim();
  getEl('search-input').value = '';
  App.searchQuery = '';
  resetEmployeePage();

  closeProfilePanel();
  if (pageName === 'departments') renderDepartmentPage();
  if (pageName === 'positions') renderPositionsPage().catch(() => {});
  if (pageName === 'scan-inbox') renderScanInboxPage().catch(() => {});
  if (pageName === 'trash') renderTrashPage().catch(() => {});
  if (pageName === 'archived-employees') renderArchivedEmployeesPage().catch(() => {});
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
      resetEmployeePage();
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
  stopLiveSync();
  App.currentUser = null;
  clearCurrentRole();
  closeProfilePanel();
  hideSetupWizard();
  getEl('pw-overlay')?.classList.remove('open');
  getEl('app').style.display = 'none';
  getEl('login-screen').style.display = 'flex';
  getEl('login-user').value = '';
  getEl('login-pass').value = '';
  showToast('Signed out.', 'info');
}
