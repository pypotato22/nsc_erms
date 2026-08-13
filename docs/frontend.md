# Frontend (SPA)

Vite SPA, now **React-first**. React boots the whole app (auth screens + HashRouter shell) and every page is a routed React component. `js/api/*` stays as the HTTP layer; the remaining `js/components/*` bridges exist only for the **overlays** that live outside the router.

Phase marker: [`renderer/src/reactReady.js`](../renderer/src/reactReady.js) (`REACT_MIGRATION_PHASE`).

## Entry and build

| Mode | How |
|------|-----|
| Dev | `npm run dev:client` → Vite on **5173**, proxies `/api` → `:3443` |
| Prod | `npm run build` → `renderer/dist`; Express serves it (same port as API) |

Key files:

- [`renderer/index.html`](../renderer/index.html) — root-only: `#root` + the `main.jsx` module script
- [`renderer/src/main.jsx`](../renderer/src/main.jsx) — legacy hash redirect, then `createRoot('#root')` → `<RootApp />`
- [`renderer/src/app/RootApp.jsx`](../renderer/src/app/RootApp.jsx) — prefs, session restore, auth screens, toast, titlebar, global overlay hosts, live sync
- [`renderer/src/layouts/AppShell.jsx`](../renderer/src/layouts/AppShell.jsx) — HashRouter sidebar + routed pages
- [`renderer/src/style.css`](../renderer/src/style.css) — thin barrel that `@import`s the plain stylesheets in `styles/`
- [`renderer/vite.config.js`](../renderer/vite.config.js) — `@vitejs/plugin-react`

## Module map

```text
renderer/src/
  app/           RootApp (boot, auth screens, session, global hosts, live sync)
  features/      React pages + dense surfaces (profile, docs, PDS viewer, wizard)
  layouts/       AppShell / Titlebar
  shared/
    lib/         appEvents, legacyHash, mountIsland
    hooks/       usePrefs, useLiveSync
    ui/          PasswordInput, toast host/store
  styles/        Plain, split stylesheets (see below)
  js/
    api/         Thin HTTP clients
    components/  Overlay bridges → mountIsland
    utils/       authz, toast bridge, liveSync, helpers, printDocument, pds helpers
```

## Styling

Plain CSS files — **no CSS Modules** for app chrome and pages. [`style.css`](../renderer/src/style.css) is a barrel that imports, in cascade order:

| File | Covers |
|------|--------|
| `styles/tokens.css` | Brand vars, dark-mode overrides |
| `styles/global.css` | Reset + base document rules (imports tokens) |
| `styles/layout.css` | `#app`, desktop titlebar, sidebar, brand, nav, sidebar user, main, topbar, pages |
| `styles/ui.css` | Card, table, badges, buttons, toolbar, password field, avatar, picture upload, empty state, toast, pager |
| `styles/overlays.css` | Overlay/modal chrome, desktop print preview, scanner modal |
| `styles/profile.css` | Profile side panel + Documents tab |
| `styles/org.css` | Departments / Positions tables |
| `styles/tools.css` | Backup, Settings, Export, storage paths |
| `styles/auth.css` | Login + setup wizard |
| `styles/pds.css` | PDS viewer (CS Form 212) + add/edit wizard |
| `styles/print.css` | `@media print` rules for `#print-area` |
| `styles/rbac.css` | `body[data-role]` visibility helpers |

Class names and IDs are unchanged from the old monolith, so the import order in the barrel matters — keep it stable when adding files.

### React migration status

| Area | Status |
|------|--------|
| Toast, login, change password, setup | React |
| Titlebar | React |
| All pages (employees, departments, positions, scan inbox, trash, archived, backup, export, settings) | React components rendered by routes |
| PDS wizard modal / profile panel / 201 File / PDS viewer | React islands behind overlay bridges |
| `index.html` | Root-only (`#root`); no login/sidebar/modal markup left |

### API layer

All JSON calls go through [`api/client.js`](../renderer/src/js/api/client.js) except multipart uploads (raw `fetch` + `FormData`). Always `credentials: 'include'`.

### Pages (rendered by routes)

| Route | Component |
|-------|-----------|
| `#/employees` | `features/employees/EmployeesPage.jsx` |
| `#/departments` | `features/departments/DepartmentsPage.jsx` |
| `#/positions` | `features/positions/PositionsPage.jsx` |
| `#/scan-inbox` | `features/scan-inbox/ScanInboxPage.jsx` |
| `#/trash` | `features/trash/TrashPage.jsx` |
| `#/archived-employees` | `features/archived/ArchivedEmployeesPage.jsx` |
| `#/backup` | `features/backup/BackupPage.jsx` (admin only) |
| `#/export` | `features/export/ExportPage.jsx` |
| `#/settings` | `features/settings/SettingsPage.jsx` |

### Overlay bridges (the only `js/components/*` left)

| Bridge | Mounts |
|--------|--------|
| `employeeModal.js` | PDS add/edit wizard into `#emp-overlay` |
| `profilePanel.js` | Profile side panel into `#panel` |
| `documents.js` | Documents tab into `#tab-docs` |
| `pdsViewer.js` | PDS preview / print / downloads into `#pds-view-overlay` |
| `changePassword.js` | Change-password modal into `#pw-react-host` (used by Settings) |

## Routing

`HashRouter` inside [`AppShell`](../renderer/src/layouts/AppShell.jsx). Routes are `#/employees`, `#/departments`, `#/positions`, `#/scan-inbox`, `#/trash`, `#/archived-employees`, `#/backup`, `#/export`, `#/settings`; `/` and unknown paths redirect to `/employees`, and `/backup` redirects for non-admins.

Each route renders its page inside a `<div id="page-…" className="page active">` wrapper so the legacy page CSS keeps applying. `NavLink` supplies the `active` class the `#sidebar nav a` CSS expects. On every location change AppShell resets the employee search, closes the profile panel and updates the page title — there are no `render*Page` calls left.

Pre-router builds used bare hashes such as `#employees`. [`shared/lib/legacyHash.js`](../renderer/src/shared/lib/legacyHash.js) rewrites those to `#/employees` (via `history.replaceState`) before the router reads the location.

## App event bus

[`shared/lib/appEvents.js`](../renderer/src/shared/lib/appEvents.js) is a tiny `onAppEvent` / `emitAppEvent` pub/sub. Emitters never need to know whether the target page is mounted, which is what lets the router unmount pages freely.

| Event | Payload | Emitted by | Listened to by |
|-------|---------|------------|----------------|
| `employees.refresh` | `{ q?: string }` | live sync, wizard save, profile archive/undo, archived restore | `EmployeesPage` |
| `employees.refreshFilters` | — | live sync, wizard save, department save/delete | `EmployeesPage` |
| `employees.clearSearch` | — | AppShell on navigation | `EmployeesPage` |
| `departments.refresh` | — | live sync | `DepartmentsPage` |
| `positions.refresh` | — | live sync | `PositionsPage` |
| `scan.refresh` | — | live sync, Documents tab attach | `ScanInboxPage`, AppShell badge |
| `trash.refresh` | — | live sync, Documents tab delete/undo | `TrashPage`, AppShell badge |
| `archived.refresh` | — | live sync, profile archive/undo | `ArchivedEmployeesPage`, AppShell badge |
| `documents.refresh` | `{ employeeId? }` | live sync, Trash restore | `documents.js` bridge (open 201 File tab) |

Sidebar counts for scan inbox, trash and archived employees are primed by AppShell itself (and refreshed on the events above) so they stay correct while those pages are unmounted.

## Authz UI

`body[data-role=…]` plus `.needs-admin` / `.needs-write` hide controls. Role set via `setCurrentRole` after login/session restore.

## Live sync

SSE via `liveSync.js`; `RootApp` starts the stream once the app shell is showing and its handlers translate server pushes into app events.

## Prefs

`localStorage` key `nsc_erms_prefs` (dark mode, font size, PDS HTML print preview). `RootApp` loads/applies them at boot and passes `getPrefs` / `savePrefs` / `getCurrentUser` as props through `AppShell` to `SettingsPage`; React `usePrefs` reads the same key.
