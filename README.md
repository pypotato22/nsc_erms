# NSC-ERMS

Northern Samar Colleges — Employee Records Management System.

**Stack:** Vanilla JS SPA (`renderer/`) · Node.js + Express (`server/`) · PostgreSQL (`db/migrations/`)

## Current status

Working end-to-end for registrar workflows:

- Auth (login / logout / sessions / change-password) + first-run setup wizard
- Employees, departments, positions (catalog + per-department links)
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

1. Production Vite `dist` packaging / optional Electron shell
2. Optional in-app restore wizard (ops restore remains documented)
3. Login rate limiting

## Phase E (done)

- Employee + trash list pagination (25 per page; export/scan still load all)
- Audit log viewer in Settings (admin/superadmin)
- Audit writes for failed login + logout
