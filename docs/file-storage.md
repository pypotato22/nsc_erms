# File storage, scan inbox, and backups

On-disk data lives under paths from env / `app_settings`. Metadata and session/audit stay in PostgreSQL.

## FILES_ROOT

Configured by `FILES_ROOT` (default project `storage/`) and optionally overridden at setup as `files_root` in `app_settings`. Resolved at runtime via [`services/settings.js`](../server/src/services/settings.js) → consumers in [`services/files.js`](../server/src/services/files.js).

### Layout

```text
FILES_ROOT/
  employees/
    {employeeId}/
      photo.jpg          # or .png — profile photo
      documents/
        {documentId}_{sanitizedOriginalName}
  inbox/                 # default scan inbox when SCAN_INBOX_PATH empty
    processed/
    failed/
```

Relative paths stored in DB (e.g. `employees/01…/documents/01…_file.pdf`) use forward slashes. `absoluteFromRelative` rejects path traversal outside the root.

### Uploads

| Kind | Writer | Notes |
|------|--------|-------|
| Document | `writeEmployeeDocument` | Stored name `{ulid}_{safeOriginal}` |
| Photo | `writeEmployeePhoto` | Fixed `photo{ext}` under employee dir |
| Size | `MAX_UPLOAD_BYTES` / `max_upload_bytes` | Default **31457280** (30 MB); DB check matches |
| MIME (documents) | Route allowlist | PDF, JPEG/PNG, DOC, DOCX |

Permanent employee delete calls `removeEmployeeStorage` (recursive employee folder). Permanent document delete calls `removeStoredFile`.

Filename sanitization: non `[a-zA-Z0-9._-]` → `_`, basename only, max 180 chars.

## Scan inbox

Not a pending-files table. Staff/MFPs drop scans into the inbox directory (`SCAN_INBOX_PATH` or `{FILES_ROOT}/inbox`).

[`services/scanInbox.js`](../server/src/services/scanInbox.js) + [`routes/scanInbox.js`](../server/src/routes/scanInbox.js):

| Action | Effect |
|--------|--------|
| List | Enumerate inbox files + return `inboxPath` |
| Assign | Claim file → employee document storage + `documents` row (`source: scan_folder`, version bump) |
| Reject | Move with reason under failed/processed |

Setup (`POST /setup/complete`) ensures `filesRoot`, `employees`, inbox, `processed`, `failed` exist and are writable.

## Backups

Admin/superadmin only. Implementation: [`services/backup.js`](../server/src/services/backup.js).

### Create

1. Guard single in-flight job (`BUSY` if busy).
2. Run **`pg_dump`** (PATH or `PG_DUMP_PATH`) into a staging SQL file.
3. Copy **`FILES_ROOT`** tree.
4. Zip with **`tar`** (Windows 10+ includes it) under `BACKUPS_ROOT` (default `./backups`).
5. Write metadata; audit `backup.create`.

Zip typically contains `README.txt` (restore notes), `database.sql`, and `files/`.

### List / download / delete

Filesystem inventory under `BACKUPS_ROOT`; download streams the zip; delete removes archive files.

### Restore

**Not an API.** Ops restores Postgres from `database.sql` and overlays `files/` onto `FILES_ROOT` per the zip README / [PRODUCTION_SETUP.md](../PRODUCTION_SETUP.md).

Common failure codes: `MISSING_TOOL` (pg_dump/tar not found), `COMMAND_FAILED`, `BUSY`.

## Settings vs env

| Concern | Env (`.env`) | Runtime preference |
|---------|--------------|--------------------|
| Files root | `FILES_ROOT` | `app_settings.files_root` after setup |
| Scan path | `SCAN_INBOX_PATH` | `app_settings.scan_inbox_path` |
| Max upload | `MAX_UPLOAD_BYTES` | `app_settings.max_upload_bytes` |
| Backups dir | `BACKUPS_ROOT` | Config only (not typically in setup wizard) |
| pg_dump | `PG_DUMP_PATH` | Optional absolute path |

Prefer absolute Windows paths in production (e.g. `C:\nsc-erms-files`).
