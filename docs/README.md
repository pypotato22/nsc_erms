# NSC-ERMS technical documentation

Northern Samar Colleges — **Employee Records Management System** (ERMS). Full-stack LAN app: Express + PostgreSQL server, Vanilla JS SPA, and a thin Electron desktop shell.

This folder is the technical reference for **developers** and **API/desktop integrators**. Operational LAN deploy steps stay in [PRODUCTION_SETUP.md](../PRODUCTION_SETUP.md). Quick start stays in the [root README](../README.md).

## Audiences

| Audience | Start here |
|----------|------------|
| New to the project | [STUDY_GUIDE.md](STUDY_GUIDE.md) — phased learning path |
| New developers | [development.md](development.md) → [architecture.md](architecture.md) → [frontend.md](frontend.md) |
| API / integrator | [api-reference.md](api-reference.md) → [auth-and-rbac.md](auth-and-rbac.md) → [data-flow.md](data-flow.md) |
| Desktop packagers | [electron-desktop.md](electron-desktop.md) → [configuration.md](configuration.md) |
| DB / schema work | [database-schema.md](database-schema.md) → [file-storage.md](file-storage.md) |

## Document index

| Doc | Contents |
|-----|----------|
| [STUDY_GUIDE.md](STUDY_GUIDE.md) | Full learning path: phases, exercises, checklist, defense prep |
| [architecture.md](architecture.md) | System design, packages, entry points, deploy model |
| [data-flow.md](data-flow.md) | UI → API → DB/files → SSE refresh; soft-delete paths |
| [database-schema.md](database-schema.md) | Tables, relationships, migrations, conventions |
| [api-reference.md](api-reference.md) | REST + SSE catalog, DTOs, errors (no OpenAPI file in repo) |
| [auth-and-rbac.md](auth-and-rbac.md) | Sessions, roles, password gate, rate limits |
| [electron-desktop.md](electron-desktop.md) | Thin client, IPC, Connect flow, packaging |
| [frontend.md](frontend.md) | SPA routing, modules, client state |
| [file-storage.md](file-storage.md) | FILES_ROOT, scan inbox, backups, uploads |
| [configuration.md](configuration.md) | `.env`, TLS/CORS, Electron config |
| [development.md](development.md) | Setup, scripts, extension points, known gaps |
| [CAPSTONE_PAPER.md](CAPSTONE_PAPER.md) | Full capstone manuscript draft (convert to Word) |

## Stack at a glance

- **Language:** JavaScript (ES modules) — no TypeScript
- **SPA:** Vanilla JS + Vite (`renderer/`)
- **API:** Node 20+ · Express 5 · `/api/v1/*` (`server/`)
- **DB:** PostgreSQL 14+ · SQL migrations (`db/migrations/`) · `pg` (no ORM)
- **Auth:** `express-session` + cookie `nsc_erms.sid` · Postgres session store
- **Live updates:** Server-Sent Events (`/api/v1/events/stream`)
- **Desktop:** Electron 37 thin client (`electron/`) — loads LAN server origin

```text
Staff PC (browser or Electron)
        │  HTTPS (LAN)
        ▼
Registrar Express (SPA + /api/v1)
        ├── PostgreSQL (records, sessions, audit)
        └── Disk (FILES_ROOT, scan inbox, backups)
```
