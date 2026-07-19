# Frontend (SPA)

Vanilla JavaScript SPA built with Vite. No React/Vue/TypeScript.

## Entry and build

| Mode | How |
|------|-----|
| Dev | `npm run dev:client` → Vite on **5173**, proxies `/api` → `:3443` |
| Prod | `npm run build` → `renderer/dist`; Express serves it (same port as API) |

Key files:

- [`renderer/index.html`](../renderer/index.html) — shell: login, setup, pages, modals
- [`renderer/src/main.js`](../renderer/src/main.js) — bootstrap, routing, session
- [`renderer/src/style.css`](../renderer/src/style.css)
- [`renderer/vite.config.js`](../renderer/vite.config.js)

## Module map

```text
renderer/src/js/
  api/           Thin HTTP clients (one file per domain)
  components/    Screens, tables, modals, panels
  utils/         authz, toast, liveSync, helpers, printDocument
```

### API layer

All JSON calls go through [`api/client.js`](../renderer/src/js/api/client.js) except multipart uploads (raw `fetch` + `FormData`). Always `credentials: 'include'`.

### Components (pages)

| Component | Page hash / role |
|-----------|------------------|
| `login.js` | Login form |
| `changePassword.js` | Forced / Settings password change |
| `setupWizard.js` | First-run (superadmin) |
| `employeeTable.js` / `employeeModal.js` | Employees |
| `profilePanel.js` / `documents.js` | Profile + 201 File |
| `departments.js` / `positions.js` | Org catalogs |
| `scanInbox.js` | Scan intake |
| `trash.js` | Document trash |
| `archivedEmployees.js` | Soft-deleted employees |
| `backup.js` / `export.js` | Tools |
| `settings.js` | Prefs, users, audit |
| `titlebar.js` | Electron chrome |

## Routing

Hash SPA — no client router library. Allowed pages in `ROUTE_PAGES`:

`employees`, `departments`, `positions`, `scan-inbox`, `trash`, `archived-employees`, `backup`, `export`, `settings`

- URLs: `#employees`, `#scan-inbox`, …
- Sidebar links: `a[data-page=…]`
- `hashchange` + `navTo` toggle `.page` visibility and call `render*` for the page

## App state

Module-level object in `main.js` (not a global store framework):

```js
const App = {
  currentUser: null,
  setupCompleted: false,
  searchQuery: '',
  currentPage: 'employees',
  prefs: { darkMode: false, fontSize: 14 },
  // savePrefs / loadPrefs / applyPrefs
};
```

| Data | Storage |
|------|---------|
| Session user | Memory + cookie session via `/auth/me` |
| UI prefs | `localStorage` key `nsc_erms_prefs` (legacy fallback `edurecords_prefs`) |
| Role for UI | `setCurrentRole` → `document.body.dataset.role` |

Font sizes: `13 | 14 | 17 | 21` px via CSS variable `--fs`.

## Boot sequence (`DOMContentLoaded`)

1. Load/apply prefs; init desktop titlebar.
2. Init all components (wire callbacks).
3. Wire nav + search.
4. Restore session (`me()`); handle password gate / setup wizard.
5. `startLiveSync` when authenticated; stop on logout.

## Authz in UI

[`utils/authz.js`](../renderer/src/js/utils/authz.js): `canWrite()`, `canManageUsers()`, `isSuperadmin()`. Hide/disable controls in components accordingly. Server remains authoritative.

## Live sync

[`utils/liveSync.js`](../renderer/src/js/utils/liveSync.js) opens `EventSource('/api/v1/events/stream')`, debounces 300ms, skips own `actorUserId`, calls handlers to refresh lists/open panels. See [data-flow.md](data-flow.md).

## Errors and feedback

- `ApiError` from failed fetches
- Toasts via [`utils/toast.js`](../renderer/src/js/utils/toast.js)
- Inline login errors; `confirm()` for destructive actions

## Extending the SPA

Typical pattern for a new feature page:

1. Add route page id to `ROUTE_PAGES` + sidebar link + `#page-…` in `index.html`.
2. Add `js/api/<resource>.js` wrappers.
3. Add `js/components/<page>.js` with `init` / `render`.
4. Wire in `main.js` (init + `navTo` branch).
5. Add Express route/service if the API does not exist yet.

See [development.md](development.md).
