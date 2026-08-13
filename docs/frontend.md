# Frontend (SPA)

Vite SPA, now **React-first**. React boots the whole app (auth screens + HashRouter shell); `js/api/*` and the thin `js/components/*` bridges stay, mounting island roots into the page/overlay hosts React renders.

Phase marker: [`renderer/src/reactReady.js`](../renderer/src/reactReady.js) (`REACT_MIGRATION_PHASE`).

## Entry and build

| Mode | How |
|------|-----|
| Dev | `npm run dev:client` → Vite on **5173**, proxies `/api` → `:3443` |
| Prod | `npm run build` → `renderer/dist`; Express serves it (same port as API) |

Key files:

- [`renderer/index.html`](../renderer/index.html) — root-only: `#root` + the `main.jsx` module script
- [`renderer/src/main.jsx`](../renderer/src/main.jsx) — `createRoot('#root')` → `<RootApp />`
- [`renderer/src/app/RootApp.jsx`](../renderer/src/app/RootApp.jsx) — prefs, session restore, auth screens, toast, titlebar, global overlay hosts
- [`renderer/src/layouts/AppShell.jsx`](../renderer/src/layouts/AppShell.jsx) — HashRouter sidebar + page hosts
- [`renderer/src/style.css`](../renderer/src/style.css) — imports `styles/tokens.css` + `styles/global.css`
- [`renderer/vite.config.js`](../renderer/vite.config.js) — `@vitejs/plugin-react`

## Module map

```text
renderer/src/
  app/           RootApp (boot, auth screens, session, global hosts)
  features/      React pages + dense surfaces (profile, docs, PDS viewer, wizard)
  layouts/       AppShell / Titlebar
  shared/        mountIsland, toast, hooks
  styles/        Design tokens + global CSS
  js/
    api/         Thin HTTP clients (shared by React + vanilla)
    components/  Thin bridges → mountIsland
    utils/       authz, toast bridge, liveSync, helpers, printDocument, pds helpers
```

### React migration status

| Area | Status |
|------|--------|
| Toast, login, change password, setup | React islands |
| Titlebar | React |
| Employees table (list/search/sort/pager) | React |
| Positions, departments, export, backup, trash, archived, scan inbox | React pages + bridges |
| Settings | React |
| PDS wizard modal / profile panel / 201 File / PDS viewer | React islands |
| Full HashRouter AppShell | Done — React owns sidebar, routing, page hosts |
| `index.html` | Root-only (`#root`); no login/sidebar/modal markup left |

### API layer

All JSON calls go through [`api/client.js`](../renderer/src/js/api/client.js) except multipart uploads (raw `fetch` + `FormData`). Always `credentials: 'include'`.

### Components (pages)

| Component | Page hash / role |
|-----------|------------------|
| `RootApp` → `LoginPage` | Login form |
| `RootApp` → `ChangePasswordModal` | Forced change; `changePassword.js` bridge still serves Settings |
| `RootApp` → `SetupWizard` | First-run (superadmin) |
| `employeeTable.js` → React | Employees list |
| `employeeModal.js` → React | PDS add/edit wizard |
| `profilePanel.js` / `documents.js` → React | Profile + 201 File |
| `pdsViewer.js` → React | PDS preview / print / downloads |
| `departments.js` / `positions.js` → React | Org catalogs |
| `scanInbox.js` → React | Scan intake |
| `trash.js` → React | Document trash |
| `archivedEmployees.js` → React | Soft-deleted employees |
| `backup.js` / `export.js` → React | Tools |
| `settings.js` → React | Prefs, users, audit |
| `RootApp` → `Titlebar` | Electron chrome |

## Routing

`HashRouter` inside [`AppShell`](../renderer/src/layouts/AppShell.jsx). Routes are `#/employees`, `#/departments`, `#/positions`, `#/scan-inbox`, `#/trash`, `#/archived-employees`, `#/backup`, `#/export`, `#/settings`; `/` and unknown paths redirect to `/employees`, and `/backup` redirects for non-admins.

`NavLink` supplies the `active` class the existing `#sidebar nav a` CSS expects. On every location change AppShell resets the employee search/pager, closes the profile panel, calls the matching `render*Page` bridge, and flips `.active` onto the matching `#page-*` host.

## Authz UI

`body[data-role=…]` plus `.needs-admin` / `.needs-write` hide controls. Role set via `setCurrentRole` after login/session restore.

## Live sync

SSE via `liveSync.js`; `RootApp` starts the stream once the app shell is showing and its handlers call the `render*Page` bridges.

## Prefs

`localStorage` key `nsc_erms_prefs` (dark mode, font size, PDS HTML print preview). `RootApp` loads/applies them at boot and hands `getPrefs` / `savePrefs` to the Settings page; React `usePrefs` reads the same key.
