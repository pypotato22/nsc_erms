# API reference

REST JSON API under `/api/v1`. There is **no OpenAPI/Swagger file** in the repo; this document is the contract, derived from [`server/src/routes/`](../server/src/routes/) and [`server/src/app.js`](../server/src/app.js).

Base URL examples:

- Local: `http://localhost:3443/api/v1`
- LAN TLS: `https://erms.local:3443/api/v1`

All browser/Electron SPA calls use **same-origin** or Vite-proxied `/api/v1…` with `credentials: 'include'`.

## Conventions

### Authentication

Cookie session name: **`nsc_erms.sid`** (httpOnly, `sameSite=lax`, 8h, `Secure` when TLS/`production` without HTTP-dev). Set by `POST /auth/login`.

| Guard | Meaning |
|-------|---------|
| Public | No session |
| Auth | `requireAuth` — any logged-in active session |
| Write | `staff`, `admin`, or `superadmin` |
| Manage | `admin` or `superadmin` |
| Superadmin | `superadmin` only |

If `must_change_password` is true, only health, setup status, and auth endpoints (including change-password) are allowed. Others return `403` / `PASSWORD_CHANGE_REQUIRED`. See [auth-and-rbac.md](auth-and-rbac.md).

### Errors

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Human-readable reason"
  }
}
```

Common codes: `VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `PASSWORD_CHANGE_REQUIRED`, `SETUP_DONE`, `BUSY`, `IN_USE`, `MISSING_TOOL`, `COMMAND_FAILED`, `INTERNAL_ERROR`.

Generic 500 responses hide the internal message except for `MISSING_TOOL` and `COMMAND_FAILED`.

### IDs

Resource IDs are ULID strings (26 chars) unless noted.

---

## Health

### `GET /health`

**Auth:** Public

```json
{
  "status": "ok",
  "service": "nsc-erms",
  "time": "2026-07-19T10:00:00.000Z",
  "database": "up"
}
```

`status` is `degraded` and `database` is `down` if Postgres check fails. Used by Electron Connect probe.

---

## Setup

### `GET /setup/status`

**Auth:** Public

```json
{
  "setupCompleted": false,
  "hasSuperadmin": true,
  "orgName": null,
  "filesRoot": "C:\\nsc-erms-files",
  "scanInboxPath": null,
  "maxUploadBytes": 31457280
}
```

### `POST /setup/complete`

**Auth:** Superadmin. Fails if setup already done (`SETUP_DONE`).

**Body:**

| Field | Required | Notes |
|-------|----------|-------|
| `orgName` | yes | Non-empty string |
| `filesRoot` | no | Defaults to config `FILES_ROOT` |
| `scanInboxPath` | no | Defaults to `{filesRoot}/inbox` |
| `maxUploadBytes` | no | 1…31457280 |

Creates dirs (`employees`, inbox, `processed`, `failed`), writes `app_settings`, returns `{ ok, setupCompleted, orgName, filesRoot, scanInboxPath, maxUploadBytes }`.

---

## Auth

### `POST /auth/login`

**Auth:** Public. Rate limits: 5 / 15 min per IP+username; 30 / 15 min per IP.

**Body:** `{ "username": "…", "password": "…" }`

**Response:** `{ "user": PublicUser }`

### `POST /auth/logout`

Destroys session; clears cookie. `{ "ok": true }`. Audited when a user was logged in.

### `GET /auth/me`

**Auth:** Required. `{ "user": PublicUser }`

### `POST /auth/change-password`

**Auth:** Required.

**Body:** `{ "currentPassword", "newPassword" }` — new password min 8 chars.

Sets `must_change_password = false`. `{ "ok": true }`

### PublicUser shape

```json
{
  "id": "01…",
  "username": "superadmin",
  "displayName": "System Superadmin",
  "role": { "id": "…", "code": "superadmin", "name": "…" },
  "employeeId": null,
  "mustChangePassword": true,
  "lastLogin": "…"
}
```

---

## Lookups

All require **Auth**. Snake_case fields in most list payloads (except document types, which are camelCase).

| Method | Path | Response key |
|--------|------|--------------|
| GET | `/lookups/departments` | `{ departments: [{ id, name, description, is_active }] }` |
| GET | `/lookups/positions` | `{ positions: [{ id, name, is_active }] }` |
| GET | `/lookups/departments/:departmentId/positions` | `{ positions: [{ department_position_id, position_id, position_name, department_id, department_name }] }` |
| GET | `/lookups/employment-types` | `{ employmentTypes: [{ id, name }] }` |
| GET | `/lookups/employment-statuses` | `{ employmentStatuses: [{ id, name }] }` |
| GET | `/lookups/document-types` | `{ documentTypes: [{ id, name, description, isRequired }] }` |

---

## Departments

**Auth:** All endpoints require auth. Mutations: **Write**.

### `GET /departments`

Active departments with `employeeCount` and nested `positions`:

```json
{
  "departments": [
    {
      "id": "…",
      "name": "…",
      "description": "…",
      "is_active": true,
      "created_at": "…",
      "updated_at": "…",
      "employeeCount": 3,
      "positions": [
        { "departmentPositionId": "…", "positionId": "…", "name": "Dean" }
      ]
    }
  ]
}
```

### `POST /departments`

**Body:** `{ "name", "description?", "positionIds?": ["positionULID", …] }`

**201:** `{ "department": { id, name, description, is_active, employeeCount, positions } }`

### `PATCH /departments/:id`

**Body:** partial `{ name?, description?, positionIds? }` — syncing `positionIds` activates/inserts links and deactivates removals (fails with `IN_USE` if active assignments exist).

### `DELETE /departments/:id`

Soft-deactivates department when safe (implementation in route — blocks when in use).

SSE: `departments.changed`.

---

## Positions

**Auth:** Auth; mutations **Write**.

### `GET /positions`

```json
{
  "positions": [
    {
      "id": "…",
      "name": "…",
      "isActive": true,
      "createdAt": "…",
      "updatedAt": "…",
      "departmentCount": 2,
      "employeeCount": 5
    }
  ]
}
```

### `POST /positions`

**Body:** `{ "name" }` (max 80 chars). **201:** `{ "position": … }`

### `PATCH /positions/:id`

**Body:** `{ "name" }`

### `DELETE /positions/:id`

Deactivates when not in use.

SSE: `positions.changed`.

---

## Employees

**Auth:** Auth; mutations **Write**.

### Employee DTO (`mapEmployee`)

```json
{
  "id": "…",
  "employeeNo": "E-001",
  "firstName": "…",
  "middleName": "",
  "lastName": "…",
  "nameExtension": "",
  "email": "",
  "contactNumber": "",
  "address": "",
  "profilePicturePath": "employees/…/photo.jpg",
  "photoUrl": "/api/v1/employees/{id}/photo",
  "remarks": "",
  "assignment": {
    "id": "…",
    "departmentPositionId": "…",
    "departmentId": "…",
    "departmentName": "…",
    "positionId": "…",
    "positionName": "…",
    "employmentTypeId": "…",
    "employmentTypeName": "…",
    "employmentStatusId": "…",
    "employmentStatusName": "…",
    "startDate": "2024-01-15",
    "endDate": null,
    "isPrimary": true
  }
}
```

`assignment` is `null` if no primary active open-ended assignment.

### `GET /employees`

Query:

| Param | Default | Notes |
|-------|---------|-------|
| `q` | | Search name, email, employee no, dept, position |
| `departmentId` | | Filter |
| `statusId` | | Employment status id |
| `page` | 1 | |
| `limit` | 25 | Max 100 |
| `all` | | `1`/`true` — no pagination limit |
| `sort` | `name` | `name`, `employeeNo`, `contact`, `position`, `department`, `status`, `startDate`, `createdAt` |
| `dir` | `asc` | `asc` \| `desc` |

**Response:** `{ employees, page, limit, total, totalPages, sort, dir }`

### `GET /employees/trash`

Archived / soft-deleted employees. Pagination: `page`, `limit`, `all`.

### `GET /employees/:id`

`{ "employee": Employee }`

### `GET /employees/:id/assignments`

List of assignment rows for the employee (history / all assignments — see route).

### `POST /employees`

**Body (required):** `firstName`, `lastName`, `departmentPositionId`, `employmentTypeId`, `employmentStatusId`, `startDate`  
**Optional:** `email`, `employeeNo`, `contactNumber`, `address`

Creates employee + primary assignment in a transaction. **201:** `{ "employee" }`  
Conflict on duplicate `employeeNo` → `409 CONFLICT`.

### `PATCH /employees/:id`

Same fields as create (required set for identity + assignment update). Updates employee and primary assignment.

### `DELETE /employees/:id`

Soft-delete / archive.

### `POST /employees/:id/restore`

Restore from trash.

### `DELETE /employees/:id/permanent`

Hard delete + remove employee storage directory.

### `POST /employees/:id/photo`

**Write.** Multipart field `file` (image). Updates `profile_picture_path`.

### `GET /employees/:id/photo`

Streams the photo file (auth required).

SSE: `employees.changed` with `action` like `created` / updates / deletes.

---

## Documents (201 File)

Nested under employee for list/upload; item ops under `/documents`.

### Document DTO (`mapDoc`)

```json
{
  "id": "…",
  "employeeId": "…",
  "documentTypeId": "…",
  "documentTypeName": "Personal Data Sheet",
  "documentTypeRequired": true,
  "fileName": "pds.pdf",
  "storedName": "01…_pds.pdf",
  "fileSize": 12345,
  "mimeType": "application/pdf",
  "source": "upload",
  "versionNumber": 2,
  "replacesId": "…",
  "issuedDate": null,
  "expiryDate": null,
  "remarks": null,
  "uploadedAt": "…",
  "uploadedBy": "…"
}
```

Allowed MIME: PDF, JPEG/PNG, DOC, DOCX.

### `GET /employees/:employeeId/documents`

**Auth.**

```json
{
  "documents": [ /* mapDoc */ ],
  "checklist": [
    { "id": "…", "name": "…", "isRequired": true, "satisfied": false }
  ]
}
```

### `POST /employees/:employeeId/documents`

**Write.** Multipart:

| Field | Required |
|-------|----------|
| `file` | yes |
| `documentTypeId` | yes |
| `displayName` | no |
| `remarks` | no |
| `issuedDate` / `expiryDate` | no (expiry ≥ issued) |

Increments version vs latest same type. **201:** `{ "document" }`

### `GET /documents/trash`

Paginated soft-deleted documents (see route for query params).

### `GET /documents/:id/download`

Streams file (auth).

### `DELETE /documents/:id`

Soft-delete (**Write**).

### `POST /documents/:id/restore`

**Write.**

### `DELETE /documents/:id/permanent`

**Write.** Removes row + file.

SSE: `documents.changed`.

---

## Scan inbox

**Auth;** assign/reject **Write**. `fileName` path segment should be URL-encoded.

### `GET /scan-inbox`

`{ "inboxPath": "…", "files": [ /* filesystem metadata from service */ ] }`

### `POST /scan-inbox/:fileName/assign`

**Body:** `{ "employeeId", "documentTypeId", "displayName?", "remarks?", "issuedDate?", "expiryDate?" }`

Creates document with `source: scan_folder`. Returns document payload (see route). Publishes `scan.changed` and document events.

### `POST /scan-inbox/:fileName/reject`

**Body:** `{ "reason?" }` — default `"Rejected by user"`. `{ "ok": true }`

---

## Backups

**Auth:** Manage (`admin` / `superadmin`).

### `GET /backups`

```json
{
  "backupsRoot": "…",
  "busy": false,
  "backups": [ /* list from disk metadata */ ]
}
```

### `POST /backups`

Creates `pg_dump` + FILES_ROOT zip. **201:** `{ "backup": meta }`  
`409 BUSY` if another backup runs; `503 MISSING_TOOL` / `COMMAND_FAILED` if `pg_dump`/`tar` fails.

### `GET /backups/:id/download`

File download (audited).

### `DELETE /backups/:id`

`{ "ok": true }`

Restore is **ops-only** (zip contains `README.txt`, `database.sql`, `files/`) — not an API.

---

## Audit logs

### `GET /audit-logs`

**Manage.**

Query: `page`, `limit` (default 25, max 100), `action`, `q` (search action/entity/user/ip).

```json
{
  "logs": [
    {
      "id": "…",
      "action": "employee.create",
      "entityType": "employee",
      "entityId": "…",
      "meta": {},
      "ip": "…",
      "createdAt": "…",
      "actor": { "id": "…", "username": "…", "displayName": "…" }
    }
  ],
  "page": 1,
  "limit": 25,
  "total": 100,
  "totalPages": 4
}
```

---

## Users

**Auth:** Manage. Extra rules: only **superadmin** may create/modify/delete/reset **superadmin** accounts. Admin role assignments limited to admin/staff/viewer.

### `GET /users/roles`

`{ "roles": [{ id, code, name, description }] }` ordered superadmin → viewer.

### `GET /users`

`{ "users": [ AdminUser ] }`

### AdminUser

```json
{
  "id": "…",
  "username": "…",
  "displayName": "…",
  "isActive": true,
  "mustChangePassword": false,
  "lastLogin": null,
  "employeeId": null,
  "role": { "id": "…", "code": "staff", "name": "…" }
}
```

### `POST /users`

**Body:** `displayName`, `username` (3–32 `[a-z0-9._-]`), `password` (min 8), `roleCode?` (default `staff`), `employeeId?`

**201:** `{ "user" }`. Username conflict → `409`.

### `PATCH /users/:id`

**Body:** any of `isActive`, `displayName`, `roleCode`. Cannot deactivate self or last superadmin.

### `POST /users/:id/reset-password`

Only when target is **inactive**. **Body:** `{ "password" }` (min 8). Sets `must_change_password = true`; clears their sessions.

### `DELETE /users/:id`

Only when inactive; cannot delete self or last superadmin. `{ "ok": true }`

---

## Events (SSE)

### `GET /events/stream`

**Auth.** `Content-Type: text/event-stream`. Comment heartbeats (`: ping`) every 25s.

Named events (see [data-flow.md](data-flow.md)):

- `employees.changed`
- `documents.changed`
- `scan.changed`
- `departments.changed`
- `positions.changed`

Data line is JSON. Example:

```text
event: employees.changed
data: {"action":"created","employeeId":"01…","actorUserId":"01…"}
```

Use `EventSource` with cookies (same-origin). Multi-process / multi-server deployments do **not** share this in-memory hub.

---

## Client modules (SPA)

| Module | Covers |
|--------|--------|
| `renderer/src/js/api/client.js` | Shared fetch + `ApiError` |
| `auth.js` | login, logout, me, changePassword |
| `employees.js` | CRUD, trash, restore |
| `documents.js` | docs, photo, download URLs |
| `departments.js` / `positions.js` | catalogs |
| `users.js` | user admin |
| `setup.js` | setup status/complete |
| `scanInbox.js` | list/assign/reject |
| `backups.js` | list/create/download |
| `audit.js` | audit list |

For role semantics beyond this reference, see [auth-and-rbac.md](auth-and-rbac.md).
