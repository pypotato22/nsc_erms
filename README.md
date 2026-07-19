# NSC-ERMS

Northern Samar Colleges — Employee Records Management System.

**Stack:** Vanilla JS SPA (`renderer/`) · Node.js + Express (`server/`) · PostgreSQL (`db/migrations/`)

## Current status

Working end-to-end for registrar workflows:

- Auth (login / logout / sessions / change-password) + first-run setup wizard
- Employees, departments, **Positions** catalog page + per-department links
- 201 File documents (upload, versioning, trash, restore)
- Scan Inbox (assign / reject drop-folder scans)
- Users + RBAC (superadmin / admin / staff / viewer)
- Audit log **writes** on sensitive actions
- **Backups:** `pg_dump` + `FILES_ROOT` zip (admin/superadmin)

## Prerequisites

- Node.js 20+
- PostgreSQL 14+ (server + **client tools** so `pg_dump` is on PATH)
- (Production LAN) TLS certificate for the host name

## Quick start (development)

```bash
# 1. Create database (psql) — or: npm run db:create
# 2. Configure env
copy .env.example .env
# edit DB_*, SESSION_SECRET, FILES_ROOT, SEED_SUPERADMIN_*

# 3. Install
npm install

# 4. Migrate + seed
npm run db:setup

# 5. Run API (http://localhost:3443)
npm run dev:server

# 6. Run SPA (proxies /api → API)
npm run dev:client
```

Health: `http://localhost:3443/api/v1/health`

## Production build

```bash
npm run build          # Vite → renderer/dist
npm start              # Express on PORT (default 3443)
# or: npm run start:fresh   # build then start
```

**UI changes:** `npm start` serves `renderer/dist` when it exists. After editing `renderer/src`, run `npm run build` (or `start:fresh`), or use `npm run dev:client` with `dev:server` for live Vite. Otherwise you will keep seeing the old built assets.

The API serves `renderer/dist` when `index.html` exists there; otherwise it falls back to the source `renderer/` folder (handy for API-only local runs). Open `http://localhost:3443/` (or HTTPS if TLS is configured).

### Seeded superadmin

Defaults (override in `.env`):

- Username: `superadmin`
- Password: `ChangeMeNow!`
- Must change password on first login

## Backups

Admin/superadmin → **Backup** page:

1. **Create** runs `pg_dump` and copies `FILES_ROOT`, then zips both under `BACKUPS_ROOT` (default: `./backups`).
2. **Download** / **Delete** from the list.
3. **Restore** is an ops procedure (not in-app). Each zip includes `README.txt`, `database.sql`, and `files/`.

Requirements:

- `pg_dump` available (PostgreSQL bin folder on PATH), or set `PG_DUMP_PATH`
- `tar` available (Windows 10+ includes it) for creating the zip

## LAN HTTPS

1. Create a local CA + cert (recommended: [mkcert](https://github.com/FiloSottile/mkcert)):

```bash
mkcert -install
mkcert erms.local 192.168.x.x localhost
```

2. Set in `.env`:

```
TLS_CERT_PATH=C:\certs\erms.local+2.pem
TLS_KEY_PATH=C:\certs\erms.local+2-key.pem
ALLOW_HTTP_DEV=false
NODE_ENV=production
```

3. Restart the API — it listens on `https://…:3443`. Session cookies become `Secure` when TLS is enabled.

4. Install/trust the mkcert CA on staff PCs so browsers accept the LAN cert.

## Roles

| Role | Write records | Manage users / backups |
|------|---------------|------------------------|
| viewer | no | no |
| staff | yes | no |
| admin | yes | yes (not superadmin accounts) |
| superadmin | yes | yes + setup |

## Next phases

1. Optional Electron shell
2. Optional in-app restore wizard (ops restore remains documented)
3. Nav RBAC + lookup admin UI

## Phase F — Security hardening (done)

- Login rate limiting (5 attempts / 15 min per account, 30 / IP)
- API blocked until forced password change (`PASSWORD_CHANGE_REQUIRED`)
- Production `SESSION_SECRET` validation (min 32 chars, not default)
- CORS tightened: dev allows localhost; production uses `CORS_ORIGINS` or same-origin only

### Production checklist

1. Set strong `SESSION_SECRET` (32+ random chars)
2. Set `NODE_ENV=production`, TLS paths, `ALLOW_HTTP_DEV=false`
3. If using Vite dev against LAN API, set `CORS_ORIGINS`
4. Trust mkcert CA on staff PCs
5. Smoke test: login → change password → employee → upload → backup

## Phase E (done)

- Employee + trash list pagination (12 / 25 per page; export/scan still load all)
- Audit log viewer in Settings (admin/superadmin)
- Audit writes for failed login + logout
- Positions catalog page + Vite production build (`npm run build` → `npm start`)
