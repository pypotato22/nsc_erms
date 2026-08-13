import { Fragment, useEffect, useMemo, useState } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import logoUrl from '../../school_logo.jpg';

import { getInitials } from '../js/utils/helpers.js';
import { showToast } from '../js/utils/toast.js';
import { ApiError } from '../js/api/client.js';
import { canManageUsers } from '../js/utils/authz.js';

import {
  renderEmployeeTable,
  refreshFilterDropdowns,
  resetEmployeePage,
  clearEmployeeSearch,
} from '../js/components/employeeTable.js';
import { closeProfilePanel } from '../js/components/profilePanel.js';
import { renderDepartmentPage } from '../js/components/departments.js';
import { renderPositionsPage } from '../js/components/positions.js';
import { renderScanInboxPage } from '../js/components/scanInbox.js';
import { renderTrashPage } from '../js/components/trash.js';
import { renderArchivedEmployeesPage } from '../js/components/archivedEmployees.js';
import { renderBackupPage } from '../js/components/backup.js';
import { renderSettingsPage, initSettings } from '../js/components/settings.js';
import { initExport } from '../js/components/export.js';

const ICONS = {
  employees: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  departments: (
    <>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </>
  ),
  positions: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <line x1="12" y1="12" x2="12" y2="16" />
      <line x1="10" y1="14" x2="14" y2="14" />
    </>
  ),
  'scan-inbox': (
    <>
      <rect x="2" y="7" width="20" height="10" rx="2" />
      <path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  trash: (
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  'archived-employees': (
    <>
      <path d="M21 8v13H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </>
  ),
  backup: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </>
  ),
  export: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
};

/**
 * Sidebar sections mirror the legacy `#sidebar-nav` markup so `style.css`
 * (`#sidebar nav a`, `a.active`, `.nav-badge`) keeps applying unchanged.
 */
const NAV_SECTIONS = [
  {
    label: 'Records',
    items: [
      { page: 'employees', title: 'Employees', badgeId: 'emp-count-badge', badgeInitial: '0' },
      { page: 'departments', title: 'Departments' },
      { page: 'positions', title: 'Positions' },
      { page: 'scan-inbox', title: 'Scan Inbox', badgeId: 'scan-inbox-badge', badgeInitial: '0' },
      { page: 'trash', title: 'Trash', badgeId: 'trash-badge', badgeInitial: '0' },
      {
        page: 'archived-employees',
        title: 'Archived Employees',
        badgeId: 'archived-employees-badge',
        badgeInitial: '0',
      },
    ],
  },
  {
    label: 'Tools',
    items: [
      { page: 'backup', title: 'Backup & Restore', className: 'needs-admin' },
      { page: 'export', title: 'Export' },
    ],
  },
  {
    label: 'System',
    items: [{ page: 'settings', title: 'Settings' }],
  },
];

const PAGES = NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.page));

const PAGE_TITLES = Object.fromEntries(
  NAV_SECTIONS.flatMap((section) => section.items.map((item) => [item.page, item.title])),
);

const PAGE_RENDERERS = {
  employees: () => renderEmployeeTable(),
  departments: () => renderDepartmentPage(),
  positions: () => renderPositionsPage(),
  'scan-inbox': () => renderScanInboxPage(),
  trash: () => renderTrashPage(),
  'archived-employees': () => renderArchivedEmployeesPage(),
  backup: () => renderBackupPage(),
  export: () => initExport(),
  settings: () => renderSettingsPage(),
};

function pageFromPath(pathname) {
  const segment = (pathname || '').replace(/^\/+/, '').split('/')[0];
  return PAGES.includes(segment) ? segment : null;
}

function NavIcon({ page }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {ICONS[page]}
    </svg>
  );
}

export function AppShell(props) {
  return (
    <HashRouter>
      <Shell {...props} />
    </HashRouter>
  );
}

function Shell({ user, onLogout, onPageChange, getPrefs, savePrefs, getCurrentUser }) {
  const location = useLocation();
  const [activePage, setActivePage] = useState(() => pageFromPath(location.pathname) || 'employees');

  const initials = useMemo(() => {
    const [first = '', last = ''] = String(user?.name || '').split(' ');
    return getInitials(first, last);
  }, [user?.name]);

  useEffect(() => {
    initSettings(getPrefs, savePrefs, getCurrentUser);
  }, [getPrefs, savePrefs, getCurrentUser]);

  useEffect(() => {
    (async () => {
      try {
        await refreshFilterDropdowns();
        await renderEmployeeTable();
        await renderScanInboxPage();
        await renderTrashPage();
        await renderArchivedEmployeesPage();
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Failed to load employees.', 'error');
      }
    })();
  }, []);

  useEffect(() => {
    const page = pageFromPath(location.pathname);
    if (!page) return;
    if (page === 'backup' && !canManageUsers()) return;

    setActivePage(page);
    onPageChange?.(page);

    clearEmployeeSearch();
    resetEmployeePage();
    closeProfilePanel();

    Promise.resolve(PAGE_RENDERERS[page]?.()).catch(() => {});
  }, [location.pathname, onPageChange]);

  return (
    <div id="app">
      <aside id="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <img src={logoUrl} alt="Northern Samar Colleges" width={36} height={36} />
          </div>
          <div className="brand-text">
            <h1>NSC - ERMS</h1>
          </div>
        </div>

        <nav id="sidebar-nav">
          {NAV_SECTIONS.map((section) => (
            <Fragment key={section.label}>
              <div className="nav-section-label">{section.label}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.page}
                  to={`/${item.page}`}
                  draggable={false}
                  className={({ isActive }) =>
                    [item.className, isActive ? 'active' : null].filter(Boolean).join(' ')
                  }
                >
                  <NavIcon page={item.page} />
                  {item.title}
                  {item.badgeId && (
                    <span className="nav-badge" id={item.badgeId}>
                      {item.badgeInitial}
                    </span>
                  )}
                </NavLink>
              ))}
            </Fragment>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="su-avatar" id="su-avatar">
            {initials}
          </div>
          <div className="su-info">
            <div className="su-name" id="su-name">
              {user?.name}
            </div>
            <div className="su-role" id="su-role">
              {user?.role}
            </div>
          </div>
          <button id="logout-btn" className="su-logout" title="Logout" type="button" onClick={onLogout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      <div id="main">
        <div id="topbar">
          <h2 id="page-title">{PAGE_TITLES[activePage]}</h2>
        </div>

        <div id="content">
          {PAGES.map((page) => (
            <div key={page} id={`page-${page}`} className={page === activePage ? 'page active' : 'page'} />
          ))}
        </div>
      </div>

      <Routes>
        <Route path="/" element={<Navigate to="/employees" replace />} />
        {PAGES.map((page) => (
          <Route
            key={page}
            path={`/${page}`}
            element={page === 'backup' && !canManageUsers() ? <Navigate to="/employees" replace /> : null}
          />
        ))}
        <Route path="*" element={<Navigate to="/employees" replace />} />
      </Routes>
    </div>
  );
}
