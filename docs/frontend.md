# Frontend (SPA)

Vite SPA in **strangler migration** to React (JSX). Hash routing and `js/api/*` stay; React islands mount into page hosts while `main.js` still boots.

Phase marker: [`renderer/src/reactReady.js`](../renderer/src/reactReady.js) (`REACT_MIGRATION_PHASE`).

## Entry and build

| Mode | How |
|------|-----|
| Dev | `npm run dev:client` → Vite on **5173**, proxies `/api` → `:3443` |
| Prod | `npm run build` → `renderer/dist`; Express serves it (same port as API) |

Key files:

- [`renderer/index.html`](../renderer/index.html) — shell: login, setup, pages, modals
- [`renderer/src/main.js`](../renderer/src/main.js) — bootstrap, routing, session
- [`renderer/src/style.css`](../renderer/src/style.css) — imports `styles/tokens.css` + `styles/global.css`
- [`renderer/vite.config.js`](../renderer/vite.config.js) — `@vitejs/plugin-react`

## Module map

```text
renderer/src/
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
| Full HashRouter AppShell | Deferred; vanilla `navTo` still owns sidebar |

### API layer

All JSON calls go through [`api/client.js`](../renderer/src/js/api/client.js) except multipart uploads (raw `fetch` + `FormData`). Always `credentials: 'include'`.

### Components (pages)

| Component | Page hash / role |
|-----------|------------------|
| `login.js` → React | Login form |
| `changePassword.js` → React | Forced / Settings password change |
| `setupWizard.js` → React | First-run (superadmin) |
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
| `titlebar.js` → React | Electron chrome |

## Routing

Hash routes (`#employees`, `#departments`, …). `main.js` `navTo` / `applyRouteFromHash` still own sidebar activation and page host visibility.

## Authz UI

`body[data-role=…]` plus `.needs-admin` / `.needs-write` hide controls. Role set via `setCurrentRole` after login/session restore.

## Live sync

SSE via `liveSync.js`; React pages re-render when `main.js` handlers call their `render*Page` bridges.

## Prefs

`localStorage` key `nsc_erms_prefs` (font size, etc.). React `usePrefs` + Settings page share the same key.
