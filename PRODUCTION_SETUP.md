# NSC-ERMS — Production Setup

Step-by-step guide to deploy **Northern Samar Colleges — Employee Records Management System** on a LAN registrar server and staff desktop clients.

**Audience:** IT / registrar ops on Windows Server or a dedicated Windows PC.

---

## Architecture

| Piece | Role |
|-------|------|
| **ERMS server** | Node.js + Express API, serves the built SPA, talks to PostgreSQL and disk storage |
| **PostgreSQL** | Employee records, users, sessions, audit, document metadata |
| **`FILES_ROOT`** | 201 File uploads and related binaries on disk |
| **Desktop client** | Electron thin client on staff PCs; opens `https://your-host:3443` |

```text
Staff PC (Electron / browser)
        │  HTTPS (LAN)
        ▼
Registrar server ──► PostgreSQL
        │
        └── FILES_ROOT / SCAN_INBOX / BACKUPS_ROOT
```

---

## Prerequisites (server machine)

- Windows 10/11 or Windows Server (LAN host)
- **Node.js 20+**
- **PostgreSQL 14+** with client tools (`psql`, `pg_dump` on PATH — or set `PG_DUMP_PATH`)
- Fixed LAN hostname or IP (e.g. `erms.local` or `192.168.x.x`)
- Disk space for employee documents and backups
- Optional but **recommended for production:** TLS via [mkcert](https://github.com/FiloSottile/mkcert) or an internal CA

---

## 1. Install and prepare PostgreSQL

1. Install PostgreSQL and note the superuser password.
2. Ensure the service is running and reachable from the ERMS host (`DB_HOST` / `DB_PORT`).
3. Create the application database (one of):

```bash
npm run db:create
```

or run `db/scripts/create_database.sql` with `psql`.

Use a dedicated DB user with rights on `nsc_erms` (or your chosen `DB_NAME`) if you do not want the default `postgres` role in production.

---

## 2. Get the application on the server

1. Copy or clone this repository to a stable path, e.g. `C:\apps\nsc-erms-desktop-client`.
2. From that folder:

```bash
npm install
```

---

## 3. Configure `.env`

```bash
copy .env.example .env
```

Edit `.env` for production. Required highlights:

| Variable | Production guidance |
|----------|---------------------|
| `NODE_ENV` | `production` |
| `PORT` | `3443` (or your chosen port; open in Windows Firewall) |
| `DB_*` | Host, port, database, user, password |
| `SESSION_SECRET` | **≥ 32 random characters**, not the example defaults |
| `TLS_CERT_PATH` / `TLS_KEY_PATH` | Absolute paths to cert and key PEM files |
| `ALLOW_HTTP_DEV` | `false` |
| `FILES_ROOT` | Absolute path, e.g. `D:\nsc-erms-files` |
| `BACKUPS_ROOT` | Absolute path for backup zips (optional; default `./backups`) |
| `SCAN_INBOX_PATH` | Optional; defaults under `FILES_ROOT/inbox` |
| `PG_DUMP_PATH` | Full path to `pg_dump.exe` if not on PATH |
| `SEED_SUPERADMIN_*` | Only for first seed — change password after first login |
| `CORS_ORIGINS` | Usually **empty** for same-origin (`npm start`). Set only for cross-origin clients |

Generate a strong secret (PowerShell example):

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

Example production fragment:

```env
NODE_ENV=production
PORT=3443
ALLOW_HTTP_DEV=false

DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=nsc_erms
DB_USER=nsc_erms
DB_PASSWORD=use-a-strong-password

SESSION_SECRET=paste-your-long-random-secret-here

TLS_CERT_PATH=C:\certs\erms.local+2.pem
TLS_KEY_PATH=C:\certs\erms.local+2-key.pem

FILES_ROOT=D:\nsc-erms-files
BACKUPS_ROOT=D:\nsc-erms-backups
MAX_UPLOAD_BYTES=31457280
```

Create the folders if they do not exist (`FILES_ROOT`, inbox, backups) and ensure the Node process can read/write them.

---

## 4. TLS (LAN HTTPS)

Production should use HTTPS so session cookies stay `Secure` and desktop/browser clients trust the host.

### Option A — mkcert (common for campus LAN)

On the **server**:

```bash
mkcert -install
mkcert erms.local 192.168.x.x localhost
```

Point `TLS_CERT_PATH` / `TLS_KEY_PATH` at the generated `.pem` files.

On each **staff PC**:

1. Install/trust the same mkcert **local CA** (or distribute `rootCA.pem` via Group Policy).
2. Ensure DNS or `hosts` maps `erms.local` to the server IP if you use a name.

### Option B — Internal CA / AD certificates

Issue a cert for the server hostname; place cert + key where the service can read them; set the same TLS env vars.

Without TLS, the server refuses to start unless `ALLOW_HTTP_DEV=true` (not recommended on a shared LAN).

---

## 5. Database migrate and seed

```bash
npm run migrate
npm run seed
```

Or first-time all-in-one (creates DB + migrate + seed):

```bash
npm run db:setup
```

Default seeded superadmin (override in `.env` before seed):

| Field | Default |
|-------|---------|
| Username | `superadmin` |
| Password | `ChangeMeNow!` |

The account is forced to **change password on first login**. Do this before handing the system to staff.

Optional demo data:

```bash
npm run seed:employees
```

---

## 6. Build UI and start the server

```bash
npm run build
npm start
```

Or:

```bash
npm run start:fresh
```

Verify:

```text
https://erms.local:3443/api/v1/health
https://erms.local:3443/
```

Replace host/port with your values. Health should report the service as ok and the database as up.

### Firewall

Allow inbound TCP on `PORT` (default **3443**) from the LAN.

### Keeping the process running

Use one of:

- Windows Service wrapper (e.g. NSSM) pointing at `node server/src/index.js` with working directory = project root
- Scheduled Task “At startup”
- Or a process manager you already use

Ensure the service user can access `.env`, TLS files, PostgreSQL, and `FILES_ROOT` / `BACKUPS_ROOT`.

---

## 7. First-run setup wizard

On first open, a superadmin may need to complete the **first-run setup** (organization name, files root, scan inbox, max upload) if not already configured via ops.

Confirm paths match production disks before going live.

---

## 8. Desktop client (staff PCs)

### Build the installer (on a build machine)

```bash
npm run build:desktop
```

Installer: `dist/desktop/NSC-ERMS Setup 0.1.0.exe` (version follows `package.json`).

### Install on staff PCs

1. Run the NSIS installer.
2. Launch **NSC-ERMS**.
3. If the saved URL is wrong or unreachable, use the **Connect** screen:
   - Choose **HTTP** or **HTTPS**
   - Enter `host:port` (e.g. `erms.local:3443`) or paste a full URL
4. Successful connects are saved to `config.json` next to the exe.

Optional: place `config.json` beside `NSC-ERMS.exe`:

```json
{
  "serverUrl": "https://erms.local:3443"
}
```

Staff can also use a browser to `https://erms.local:3443/` if the mkcert/CA is trusted.

---

## 9. Roles and access

| Role | Write records | Manage users / backups |
|------|---------------|------------------------|
| viewer | no | no |
| staff | yes | no |
| admin | yes | yes (not superadmin accounts) |
| superadmin | yes | yes + setup |

Create real users under **Settings → Users** after the initial superadmin login. Prefer least privilege (viewer/staff for day-to-day work).

---

## 10. Backups

In-app (**Backup** page, admin/superadmin):

1. **Create** — `pg_dump` + zip of `FILES_ROOT` under `BACKUPS_ROOT`
2. **Download** / **Delete** from the list
3. **Restore** — ops procedure (not in-app); each archive includes `README.txt`, `database.sql`, and `files/`

Requirements on the server:

- `pg_dump` available (`PATH` or `PG_DUMP_PATH`)
- `tar` available (Windows 10+ includes it)

Schedule regular in-app backups and copy zips off-box (external disk / NAS).

---

## 11. Production checklist

- [ ] PostgreSQL installed, DB created, migrations applied
- [ ] Strong `SESSION_SECRET` (≥ 32 chars, not example values)
- [ ] `NODE_ENV=production`, `ALLOW_HTTP_DEV=false`
- [ ] TLS cert/key set and trusted on staff PCs
- [ ] `FILES_ROOT` / `BACKUPS_ROOT` on durable disks with backups
- [ ] Firewall allows `PORT` on the LAN
- [ ] `npm run build` then `npm start` (or service) confirmed via `/api/v1/health`
- [ ] Superadmin password changed after first login
- [ ] Users/roles created for staff
- [ ] Desktop installer deployed; Connect URL verified (HTTPS)
- [ ] Smoke test: login → employee → document upload → backup create/download

---

## 12. Updates

On the server:

```bash
# pull or copy new release
npm install
npm run migrate
npm run build
# restart the Node service
```

Rebuild and redistribute the desktop installer when Electron shell changes:

```bash
npm run build:desktop
```

Staff only need a new installer when the **client** changes; UI fixes served by the server apply after `npm run build` + restart without reinstalling Electron.

---

## Troubleshoot

| Symptom | Check |
|---------|--------|
| Server exits on start | `.env` present; `SESSION_SECRET`; TLS paths exist; DB credentials |
| Health `database: down` | Postgres service, `DB_*`, firewall to DB host |
| Browser/Electron cert errors | Trust mkcert/local CA on the client PC |
| Desktop Connect fails | Server running; correct `https://host:port`; firewall; health URL in a browser |
| Blank/old UI | Run `npm run build` so `renderer/dist` is current |
| Backup create fails | `pg_dump` / `PG_DUMP_PATH`; write access to `BACKUPS_ROOT`; `tar` available |
| Cross-origin API errors | Same-origin deploy needs empty `CORS_ORIGINS`; otherwise list exact origins |

---

## Related

- Day-to-day development: [README.md](README.md)
- Env template: [.env.example](.env.example)
- Desktop config example: [electron/config.example.json](electron/config.example.json)
