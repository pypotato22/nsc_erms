# Development guide

## Prerequisites

- **Node.js 20+**
- **PostgreSQL 14+** (server + client tools so `pg_dump` is on PATH, or set `PG_DUMP_PATH`)
- Windows recommended for `build:desktop` (x64 NSIS)

## Quick setup

```bash
copy .env.example .env
# Edit DB_*, SESSION_SECRET, FILES_ROOT, SEED_SUPERADMIN_*

npm install
npm run db:setup          # create DB + migrate + seed

npm run dev:server        # API http://localhost:3443
npm run dev:client        # SPA http://localhost:5173 (proxies /api)

# Optional desktop shell
copy electron\config.example.json electron\config.json
npm run dev:desktop
```

Health: `GET http://localhost:3443/api/v1/health`

Default seeded superadmin (override in `.env`): username `superadmin`, password `ChangeMeNow!` — must change password on first login.

## Root npm scripts

| Script | Purpose |
|--------|---------|
| `dev:server` / `dev` | Watch API (`server`) |
| `dev:client` | Vite SPA |
| `dev:desktop` | Electron |
| `build` | Vite → `renderer/dist` |
| `build:desktop` | electron-builder NSIS |
| `start` | Production API (serves built SPA when present) |
| `start:fresh` | `build` then `start` |
| `migrate` / `seed` / `seed:employees` | DB |
| `db:create` / `db:setup` | Create + migrate + seed |

Workspaces: `renderer`, `server` ([`package.json`](../package.json)).

## Project layout reminder

See [architecture.md](architecture.md). Business logic belongs on the **server**; the renderer is a thin UI; Electron is a chrome + Connect shell.

## Suggested extension points

### New REST resource

1. SQL migration in `db/migrations/` (if schema changes).
2. Route under `server/src/routes/` + mount in `app.js`.
3. Use `requireAuth` / `requireRole`, `HttpError`, `writeAudit`, `publish` where appropriate.
4. Mapper function for stable JSON shapes.
5. `renderer/src/js/api/<name>.js` + component + hash page wiring ([frontend.md](frontend.md)).

### New SSE event

1. `publish('thing.changed', { …, actorUserId })` from the mutating route.
2. Subscribe in `liveSync.js` and handle in `main.js` (refresh render).

### New role capability

1. Enforce in route middleware (`requireRole`).
2. Mirror UX in `authz.js` helpers / component `canWrite`-style checks.
3. Document in [auth-and-rbac.md](auth-and-rbac.md) / [api-reference.md](api-reference.md).

## Conventions

- **ES modules** throughout (`"type": "module"` in server; Vite ESM on client). Electron main/preload use CommonJS `require` today.
- **IDs:** `ulid()` → `CHAR(26)`.
- **Errors:** throw `HttpError(status, message, code)`; client gets `{ error: { code, message } }`.
- **JSON field naming:** prefer camelCase in mapped API responses; some lookup payloads still return snake_case columns — match existing peer endpoints.
- Do not invent OpenAPI files unless the team decides to add one; keep [api-reference.md](api-reference.md) updated.

## Production-ish local check

```bash
npm run build
npm start
# open http://localhost:3443/
```

After renderer edits, rebuild or use `dev:client` — otherwise Express may keep serving stale `renderer/dist`.

## Known gaps

| Gap | Status |
|-----|--------|
| Automated tests (unit/e2e) | None in repo |
| OpenAPI / TypeScript types | None — docs + mappers are the contract |
| Electron auto-update / tray | Not implemented |
| In-app backup restore | Ops-only |
| Multi-instance SSE | In-memory hub — not shared across Node processes |

## Further reading

- [api-reference.md](api-reference.md) — endpoints and DTOs
- [database-schema.md](database-schema.md) — tables
- [data-flow.md](data-flow.md) — request lifecycle
- [PRODUCTION_SETUP.md](../PRODUCTION_SETUP.md) — LAN deploy
