# How to Study NSC-ERMS — A Complete Learning Guide

This guide is a structured path for understanding **Northern Samar Colleges — Employee Records Management System (NSC-ERMS)**: what it is, how it is built, and how to learn it from zero to defendable depth.

---

## 1. What You Are Studying

NSC-ERMS is a **campus LAN employee records system** for registrar/HR workflows. It centralizes:

| Domain area | What the system does |
|-------------|----------------------|
| **Employees** | Master records, assignments, search, archive/restore |
| **201 File** | Typed documents (PDS, TOR, licenses, etc.), versioning, trash |
| **Org structure** | Departments, positions, department–position links |
| **Scan intake** | Drop-folder scans → assign to employee or reject |
| **Users & RBAC** | `viewer` / `staff` / `admin` / `superadmin` |
| **Audit** | Logs sensitive actions |
| **Backups** | `pg_dump` + file tree zipped together |
| **Desktop client** | Electron thin shell loading the LAN server UI |

**Architecture in one sentence:** A registrar server runs Express + PostgreSQL + disk storage and serves a Vanilla JS SPA; staff PCs use a browser or Electron window pointed at that server.

```text
Staff PC (browser or Electron)
        │  HTTPS (LAN)
        ▼
Registrar Express (SPA + /api/v1)
        ├── PostgreSQL (records, sessions, audit)
        └── Disk (FILES_ROOT, scan inbox, backups)
```

---

## 2. Prerequisites

Before diving into code, you should be comfortable with:

| Topic | Why it matters here |
|-------|---------------------|
| **HTTP/REST** | All business logic is `/api/v1/*` JSON |
| **Cookies & sessions** | Auth uses `nsc_erms.sid`, not JWT |
| **SQL basics** | No ORM — raw queries in route handlers |
| **Node.js + ES modules** | Server and renderer are ESM |
| **Browser fetch / FormData** | JSON API + multipart uploads |
| **PostgreSQL** | Schema, migrations, `pg_dump` for backups |
| **Philippine 201 File context** | Domain reason for document types, scan workflow |

**Tools to install:** Node.js 20+, PostgreSQL 14+ (with client tools for `pg_dump`), Git.

---

## 3. Recommended Study Phases

Study in this order. Each phase builds on the last.

### Phase A — Big picture (2–4 hours)

**Goal:** Explain the system to someone in 5 minutes.

1. Read [README.md](../README.md) — status, quick start, roles, backups.
2. Read [docs/README.md](README.md) — doc index and stack summary.
3. Read [architecture.md](architecture.md) — monorepo layout, entry points, API mounts.
4. Skim [CAPSTONE_PAPER.md](CAPSTONE_PAPER.md) Chapters 1 and 4 — problem statement, objectives, design rationale.

**Checkpoint questions:**

- Why is Electron a *thin client* and not an embedded server?
- Where do files live vs. where does metadata live?
- What are the four roles and what can each do?

---

### Phase B — Run it locally (2–3 hours)

**Goal:** See the system work with your own hands.

```bash
copy .env.example .env
# Edit DB_*, SESSION_SECRET, FILES_ROOT, SEED_SUPERADMIN_*

npm install
npm run db:setup

npm run dev:server    # http://localhost:3443
npm run dev:client    # http://localhost:5173 (proxies /api)
```

Optional desktop:

```bash
copy electron\config.example.json electron\config.json
# Set "serverUrl": "http://localhost:3443"
npm run dev:desktop
```

**Hands-on walkthrough (do every step):**

| Step | What you learn |
|------|----------------|
| Hit `GET /api/v1/health` | Health probe (used by Electron Connect) |
| Login as `superadmin` / `ChangeMeNow!` | Session cookie, forced password change |
| Complete setup wizard | `app_settings`, `FILES_ROOT`, scan inbox dirs |
| Create department + position | Lookup catalogs |
| Create employee + upload document | DB row + disk file + versioning |
| Drop a file in scan inbox → assign | Filesystem-first intake |
| Soft-delete document → Trash → restore | Soft-delete lifecycle |
| Archive employee → Archived list | Employee soft-delete |
| Open Settings → Users, Audit | RBAC admin surfaces |
| Create backup (admin) | `pg_dump` + zip |

**Checkpoint:** You can narrate one full request: *click Upload → browser → API → Postgres + disk → SSE to other clients*.

---

### Phase C — Data & request flow (4–6 hours)

**Goal:** Trace any feature from UI to database.

Read in order:

1. [data-flow.md](data-flow.md) — JSON path, uploads, SSE, soft-delete
2. [database-schema.md](database-schema.md) — tables, ER diagram, migrations
3. [file-storage.md](file-storage.md) — `FILES_ROOT`, scan inbox, backups

**Key source files (read in this order):**

| Order | File | Why |
|-------|------|-----|
| 1 | `renderer/src/js/api/client.js` | Central `fetch` wrapper, `ApiError` |
| 2 | `server/src/app.js` | Middleware stack, route mounts |
| 3 | `server/src/middleware/auth.js` | `requireAuth`, `requireRole` |
| 4 | `server/src/middleware/passwordGate.js` | Blocks API until password changed |
| 5 | One route end-to-end, e.g. `server/src/routes/employees.js` | SQL + mappers + audit + SSE |
| 6 | Matching UI: `renderer/src/js/components/employeeTable.js` | How the page calls the API |

**Exercise — trace “create employee”:**

```text
employeeModal.js → api/employees.js → client.js
  → POST /api/v1/employees
  → requireAuth + requireRole('staff'|'admin'|'superadmin')
  → INSERT employees + employee_assignments
  → writeAudit(...) + publish('employees.changed', ...)
  → liveSync.js debounces → main.js re-renders table
```

Repeat this pattern for: document upload (multipart), scan assign (filesystem + DB), login (session store).

---

### Phase D — Security & auth (3–4 hours)

**Goal:** Explain how unauthorized access is prevented.

Read [auth-and-rbac.md](auth-and-rbac.md), then inspect:

| File | Concept |
|------|---------|
| `server/src/routes/auth.js` | Login, bcrypt, session creation |
| `server/src/middleware/rateLimit.js` | Brute-force protection |
| `server/src/config.js` | Production `SESSION_SECRET` validation, CORS |
| `renderer/src/js/utils/authz.js` | UI mirrors server roles (not authoritative) |

**Study the role matrix:**

| Role | Write records | Manage users/backups | Setup wizard |
|------|---------------|----------------------|--------------|
| viewer | No | No | No |
| staff | Yes | No | No |
| admin | Yes | Yes (not superadmin) | No |
| superadmin | Yes | Yes | Yes |

**Security checklist to verify yourself:**

- Session cookie is `httpOnly`, `sameSite=lax`, `Secure` under TLS
- Passwords hashed with bcrypt (cost 12)
- Rate limit: 5 attempts / 15 min per account
- Audit on login failure, logout, sensitive mutations
- Helmet middleware on Express
- Path traversal blocked in file service

---

### Phase E — Frontend architecture (3–4 hours)

**Goal:** Understand SPA structure without a framework.

Read [frontend.md](frontend.md), then:

| File | Role |
|------|------|
| `renderer/src/main.js` | Boot, hash routing, `App` state, live sync wiring |
| `renderer/index.html` | Page shells, modals |
| `renderer/src/js/utils/liveSync.js` | SSE invalidation (not full state push) |
| `renderer/src/js/components/*.js` | One file per screen |

**Important design choices:**

- **Hash routing** — `#employees`, `#settings`; no React Router
- **No global store** — module-level `App` object + re-fetch on navigate/SSE
- **Role in DOM** — `document.body.dataset.role` for CSS/UX gating
- **Credentials** — never in `localStorage`; only UI prefs there

**Exercise:** Pick one page (e.g. Scan Inbox). Map every button → API call → server route → service.

---

### Phase F — API contract (3–5 hours)

**Goal:** Know every endpoint and error shape.

Read [api-reference.md](api-reference.md) cover to cover. There is **no OpenAPI file** — this doc *is* the contract.

Cross-reference with `server/src/routes/*.js` for each resource:

- Health, Setup, Auth
- Employees, Documents, Departments, Positions
- Scan Inbox, Backups, Audit, Users
- Events (SSE stream)

**Error format (memorize):**

```json
{ "error": { "code": "VALIDATION", "message": "…" } }
```

Common codes: `UNAUTHORIZED`, `FORBIDDEN`, `PASSWORD_CHANGE_REQUIRED`, `RATE_LIMITED`, `BUSY`.

---

### Phase G — Electron desktop (1–2 hours)

**Goal:** Understand what the desktop app actually does (and does not do).

Read [electron-desktop.md](electron-desktop.md).

**Critical insight:** Electron does **not** run Express or talk to Postgres. It only:

1. Resolves `serverUrl` (env → `config.json` → default)
2. Probes `GET /api/v1/health`
3. Loads the server origin in `BrowserWindow`

IPC (`window.nscDesktop`) is limited to window chrome and Connect boot — not business APIs.

Files: `electron/main.js`, `electron/preload.js`, `electron/connection.html`.

---

### Phase H — Deployment & ops (2–3 hours)

**Goal:** Understand production, not just dev.

Read [PRODUCTION_SETUP.md](../PRODUCTION_SETUP.md) and [configuration.md](configuration.md).

Topics:

- TLS with mkcert on LAN
- `npm run build` → `npm start` (single origin on `:3443`)
- NSSM / process manager for Windows server
- Backup zip contents and **manual restore** procedure
- CORS when dev SPA (5173) hits LAN API

---

## 4. Feature-by-Feature Study Map

Use this when preparing for demos, defense, or code review.

| Feature | Start reading | Deep dive |
|---------|---------------|-----------|
| **First-run setup** | `setupWizard.js`, `routes/setup.js` | `app_settings` keys in schema doc |
| **Login / session** | `login.js`, `routes/auth.js` | `session` table, `passwordGate.js` |
| **Employees** | `employeeTable.js`, `routes/employees.js` | `employee_assignments` partial unique index |
| **201 File docs** | `documents.js`, `routes/documents.js` | Migration 002 versioning, `services/files.js` |
| **Scan inbox** | `scanInbox.js` (both) | Filesystem-first design in `file-storage.md` |
| **Trash / archive** | `trash.js`, `archivedEmployees.js` | Soft-delete tables in `data-flow.md` |
| **Users** | `settings.js`, `routes/users.js` | Role hierarchy, admin cannot edit superadmin |
| **Audit** | `settings.js` audit tab, `services/audit.js` | `audit_logs.meta` JSONB |
| **Backups** | `backup.js`, `services/backup.js` | `pg_dump`, `tar`, `BUSY` guard |
| **Live sync** | `liveSync.js`, `services/liveEvents.js` | SSE event types, single-process limitation |
| **Export** | `export.js` | Bulk data export for reporting |

---

## 5. Database Study Path

Migrations are the source of truth:

| File | What it introduces |
|------|-------------------|
| `db/migrations/001_initial_schema.sql` | Core tables, session, audit |
| `db/migrations/002_document_versioning.sql` | `version_number`, `replaces_id` |
| `db/migrations/003_employee_no_nullable.sql` | Optional employee numbers |

**Seed data:** `server/src/db/seed.js` — roles, document types, sample org, superadmin.

**Exercise:** Draw the ER diagram from memory. Include: `employees` → `employee_assignments` → `department_positions` → `departments` + `positions`, and `documents` → `document_types`.

**Conventions to remember:**

- IDs: ULID `CHAR(26)`
- Soft delete: `deleted_at` on employees/documents
- Max upload: 30 MB (DB check + env)

---

## 6. How to Study for Capstone Defense

If you are presenting this as a capstone project, study in three layers:

### Layer 1 — Problem & objectives (from CAPSTONE_PAPER Ch. 1–3)

- Pain points: fragmented storage, weak access control, backup gaps, scan friction
- Map each **specific objective** to an implemented module (Table 1 in the paper)

### Layer 2 — Design & implementation (Ch. 4 + technical docs)

- Three-tier architecture diagram
- Technology stack justification (LAN-hosted, no cloud lock-in)
- Security controls checklist (Table 5 in paper)

### Layer 3 — Evaluation & limitations (Ch. 5–6)

- Functional smoke tests per feature
- Known gaps from [development.md](development.md):
  - No automated tests
  - No OpenAPI
  - SSE hub is single-process only
  - No in-app restore

**Defense prep:** For each objective, prepare: *demo step → API endpoint → DB table → security control*.

---

## 7. Suggested Hands-On Exercises

These cement understanding better than passive reading.

| # | Exercise | Validates |
|---|----------|-----------|
| 1 | Add a console log in a route and trigger it from the UI | Full request path |
| 2 | Login as `viewer`; confirm write buttons hidden and API returns 403 | RBAC |
| 3 | Upload same document type twice; verify version increment | Document versioning |
| 4 | Open two browser tabs; change data in one; watch the other refresh | SSE live sync |
| 5 | Break DB connection; check `/health` returns `degraded` | Health probe |
| 6 | Disconnect Electron server; use Connect screen | Desktop boot flow |
| 7 | Create backup; inspect zip contents | Backup architecture |
| 8 | Read one migration SQL file and find matching route queries | Schema ↔ code link |

---

## 8. Reading Order Cheat Sheet

**Day 1 — Orientation**

```text
README.md → docs/README.md → docs/architecture.md → run locally
```

**Day 2 — Data & API**

```text
docs/data-flow.md → docs/database-schema.md → docs/api-reference.md (auth + employees sections)
→ trace employees.js end-to-end
```

**Day 3 — Security & frontend**

```text
docs/auth-and-rbac.md → main.js → authz.js → one component deep dive
```

**Day 4 — Files, scan, backup, desktop**

```text
docs/file-storage.md → docs/electron-desktop.md → PRODUCTION_SETUP.md
```

**Day 5 — Capstone / synthesis**

```text
CAPSTONE_PAPER.md (full) → re-run demo script → practice explaining architecture diagram
```

---

## 9. Mental Model: One Request, All Layers

When studying any feature, always ask these five questions:

1. **Which UI component** triggers it?
2. **Which `renderer/src/js/api/*.js` function** calls it?
3. **Which route** in `server/src/routes/` handles it?
4. **What SQL / filesystem** changes occur?
5. **What side effects** — audit log? SSE publish? Role check?

If you can answer all five for login, employee create, document upload, scan assign, and backup create, you understand the system core.

---

## 10. Common Pitfalls When Studying

| Pitfall | Reality |
|---------|---------|
| Thinking Electron embeds the server | It only loads a URL |
| Expecting JWT auth | Cookie sessions in Postgres |
| Looking for React/TypeScript | Vanilla JS everywhere |
| Assuming scan inbox is a DB table | It is a folder listing |
| Editing `renderer/src` and running `npm start` without rebuild | Stale `renderer/dist` is served — run `npm run build` or use `dev:client` |
| Trusting UI role checks alone | Server middleware is authoritative |

---

## 11. Study Checklist

Use this to track readiness:

- [ ] I can draw the three-tier architecture from memory
- [ ] I have run the app locally and completed the full demo walkthrough
- [ ] I can explain session auth vs. JWT and why cookies work in Electron
- [ ] I know all four roles and their capabilities
- [ ] I can trace a multipart upload to disk path + DB row
- [ ] I understand document versioning (`replaces_id`, `version_number`)
- [ ] I can explain soft-delete vs. permanent delete for employees and documents
- [ ] I know how SSE live sync works and its single-process limitation
- [ ] I can describe backup contents and restore procedure
- [ ] I have read `api-reference.md` for the resources I will demo
- [ ] I can articulate known limitations honestly (no tests, no in-app restore)

---

## 12. Where to Go Next

| Goal | Resource |
|------|----------|
| **Before official presentation** | [PRESENTATION_CHECKLIST.md](PRESENTATION_CHECKLIST.md) — feature tests, RBAC, demo script |
| Extend the system | [development.md](development.md) — extension points |
| LAN production deploy | [PRODUCTION_SETUP.md](../PRODUCTION_SETUP.md) |
| Full academic narrative | [CAPSTONE_PAPER.md](CAPSTONE_PAPER.md) |
| Quick doc index | [README.md](README.md) |
