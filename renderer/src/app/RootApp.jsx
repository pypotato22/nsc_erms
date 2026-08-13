import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '../layouts/AppShell.jsx';
import { Titlebar } from '../layouts/Titlebar.jsx';
import { ToastHost } from '../shared/ui/toast/ToastHost.jsx';
import { LoginPage } from '../features/auth/LoginPage.jsx';
import { SetupWizard } from '../features/auth/SetupWizard.jsx';
import { ChangePasswordModal } from '../features/auth/ChangePasswordModal.jsx';
import { normalizeUser } from '../features/auth/normalizeUser.js';

import { me, logout as apiLogout } from '../js/api/auth.js';
import { getSetupStatus } from '../js/api/setup.js';
import { showToast } from '../js/utils/toast.js';
import { setCurrentRole, clearCurrentRole } from '../js/utils/authz.js';
import { startLiveSync, stopLiveSync } from '../js/utils/liveSync.js';

import { initEmployeeTable, renderEmployeeTable, refreshFilterDropdowns } from '../js/components/employeeTable.js';
import { initEmployeeModal } from '../js/components/employeeModal.js';
import {
  initProfilePanel,
  closeProfilePanel,
  refreshOpenProfileForLiveSync,
  refreshPanelHeader,
} from '../js/components/profilePanel.js';
import { initPdsViewer } from '../js/components/pdsViewer.js';
import { initDocuments, refreshOpenDocsTabForLiveSync } from '../js/components/documents.js';
import { initScanInbox, renderScanInboxPage } from '../js/components/scanInbox.js';
import { initTrash, renderTrashPage } from '../js/components/trash.js';
import { initArchivedEmployees, renderArchivedEmployeesPage } from '../js/components/archivedEmployees.js';
import { initDepartments, renderDepartmentPage } from '../js/components/departments.js';
import { initPositions, renderPositionsPage } from '../js/components/positions.js';
import { initBackup } from '../js/components/backup.js';

const PREFS_KEY = 'nsc_erms_prefs';
const LEGACY_PREFS_KEY = 'edurecords_prefs';
const FONT_SIZES = [13, 14, 17, 21];
const DEFAULT_PREFS = { darkMode: false, fontSize: 14, pdsHtmlPrintPreview: true };

function normalizeFontSize(size) {
  const n = Number(size);
  if (FONT_SIZES.includes(n)) return n;
  return FONT_SIZES.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best));
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY) || localStorage.getItem(LEGACY_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    parsed.fontSize = normalizeFontSize(parsed.fontSize);
    return parsed;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function applyPrefs(prefs) {
  document.body.classList.toggle('dark', Boolean(prefs.darkMode));
  document.documentElement.style.setProperty('--fs', `${prefs.fontSize}px`);
}

function withSetupHints(status) {
  return {
    ...status,
    filesRootHint: status?.filesRoot || 'C:\\nsc-erms-files',
    scanInboxHint: status?.scanInboxPath || 'C:\\nsc-erms-files\\inbox',
    backupsRootHint: status?.backupsRoot || 'C:\\nsc-erms-backups',
  };
}

export function RootApp() {
  const [screen, setScreen] = useState('loading');
  const [user, setUser] = useState(null);
  const [setupStatus, setSetupStatus] = useState(null);
  const [loginNotice, setLoginNotice] = useState('');

  const prefsRef = useRef(loadPrefs());
  const userRef = useRef(null);
  const searchRef = useRef('');
  const pageRef = useRef('employees');
  const isDesktop = Boolean(typeof window !== 'undefined' && window.nscDesktop?.isDesktop);

  const getPrefs = useCallback(() => prefsRef.current, []);
  const savePrefs = useCallback(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefsRef.current));
    applyPrefs(prefsRef.current);
  }, []);
  const getSearchQuery = useCallback(() => searchRef.current, []);
  const getCurrentUser = useCallback(() => userRef.current, []);

  const enterAuthenticated = useCallback((nextUser, status) => {
    userRef.current = nextUser;
    setUser(nextUser);
    setCurrentRole(nextUser.roleCode);

    if (nextUser.mustChangePassword) {
      setScreen('password');
      return;
    }
    if (!status?.setupCompleted) {
      if (nextUser.roleCode === 'superadmin') {
        setSetupStatus(withSetupHints(status));
        setScreen('setup');
        return;
      }
      setLoginNotice('System setup is not complete. Ask a superadmin to finish first-run setup.');
      setScreen('login');
      return;
    }
    setLoginNotice('');
    setScreen('app');
  }, []);

  useEffect(() => {
    applyPrefs(prefsRef.current);
    if (isDesktop) document.body.classList.add('desktop-shell');

    initEmployeeTable((q) => {
      searchRef.current = q;
    });
    initEmployeeModal(getSearchQuery);
    initProfilePanel(getSearchQuery);
    initPdsViewer(getPrefs);
    initDocuments(() => {
      refreshPanelHeader().catch(() => {});
    });
    initScanInbox();
    initTrash();
    initArchivedEmployees(getSearchQuery);
    initDepartments();
    initPositions();
    initBackup();

    let cancelled = false;
    (async () => {
      try {
        const status = await getSetupStatus();
        const { user: sessionUser } = await me();
        if (cancelled) return;
        enterAuthenticated(normalizeUser(sessionUser), status);
      } catch {
        if (cancelled) return;
        clearCurrentRole();
        setScreen('login');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enterAuthenticated, getPrefs, getSearchQuery, isDesktop]);

  useEffect(() => {
    if (screen !== 'app') return undefined;
    startLiveSync({
      getCurrentUserId: () => userRef.current?.id,
      'employees.changed': (payload) => {
        renderArchivedEmployeesPage().catch(() => {});
        if (pageRef.current === 'employees') {
          renderEmployeeTable(searchRef.current).catch(() => {});
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
        if (pageRef.current === 'departments') renderDepartmentPage().catch(() => {});
        if (pageRef.current === 'employees') {
          renderEmployeeTable(searchRef.current).catch(() => {});
        }
      },
      'positions.changed': () => {
        refreshFilterDropdowns().catch(() => {});
        if (pageRef.current === 'positions') renderPositionsPage().catch(() => {});
        if (pageRef.current === 'departments') renderDepartmentPage().catch(() => {});
      },
    });
    return () => stopLiveSync();
  }, [screen]);

  const handleLoginSuccess = useCallback(
    (nextUser) => {
      setLoginNotice('');
      getSetupStatus()
        .then((status) => enterAuthenticated(nextUser, status))
        .catch(() => enterAuthenticated(nextUser, { setupCompleted: false }));
    },
    [enterAuthenticated],
  );

  const handlePasswordChanged = useCallback(() => {
    const current = { ...userRef.current, mustChangePassword: false };
    getSetupStatus()
      .then((status) => enterAuthenticated(current, status))
      .catch(() => enterAuthenticated(current, { setupCompleted: true }));
  }, [enterAuthenticated]);

  const handleSetupComplete = useCallback(() => {
    setScreen('app');
  }, []);

  const handleLogout = useCallback(async () => {
    if (!confirm('Log out?')) return;
    try {
      await apiLogout();
    } catch {
      /* clear local session anyway */
    }
    stopLiveSync();
    closeProfilePanel();
    clearCurrentRole();
    userRef.current = null;
    pageRef.current = 'employees';
    searchRef.current = '';
    setUser(null);
    setLoginNotice('');
    setScreen('login');
    showToast('Signed out.', 'info');
  }, []);

  const handlePageChange = useCallback((page) => {
    pageRef.current = page;
  }, []);

  return (
    <>
      {isDesktop && (
        <header id="desktop-titlebar">
          <Titlebar />
        </header>
      )}

      {(screen === 'loading' || screen === 'login') && (
        <div id="login-screen" style={{ display: 'flex' }}>
          {screen === 'login' && <LoginPage onSuccess={handleLoginSuccess} notice={loginNotice} />}
        </div>
      )}

      {screen === 'setup' && (
        <div id="setup-screen" style={{ display: 'flex' }}>
          <SetupWizard status={setupStatus} onComplete={handleSetupComplete} />
        </div>
      )}

      {screen === 'password' && <ChangePasswordModal open forced onDone={handlePasswordChanged} />}

      {screen === 'app' && (
        <AppShell
          user={user}
          onLogout={handleLogout}
          onPageChange={handlePageChange}
          getPrefs={getPrefs}
          savePrefs={savePrefs}
          getCurrentUser={getCurrentUser}
        />
      )}

      <div id="panel-backdrop" />
      <div id="panel" />
      <div id="emp-overlay" className="overlay" />
      <div id="pds-view-overlay" className="overlay" />
      <div id="doc-overlay" className="overlay" />
      <div id="doc-inbox-overlay" className="overlay" />
      <div id="pw-react-host" />
      <div id="print-area" />

      <ToastHost />
    </>
  );
}
