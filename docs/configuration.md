# Configuration

## Server environment (`.env`)

Loaded from the **project root** by [`server/src/config.js`](../server/src/config.js) via `dotenv`. Template: [`.env.example`](../.env.example).

| Variable | Default / notes |
|----------|-----------------|
| `NODE_ENV` | `development` / `production` |
| `PORT` | `3443` |
| `DB_HOST` | `localhost` |
| `DB_PORT` | `5432` |
| `DB_NAME` | `nsc_erms` |
| `DB_USER` / `DB_PASSWORD` | Required for discrete config |
| `DATABASE_URL` | Alternative if `DB_USER`/`DB_NAME` unset |
| `SESSION_SECRET` | Required; production ≥ 32 chars, not example defaults |
| `TLS_CERT_PATH` / `TLS_KEY_PATH` | PEM paths for HTTPS; empty → HTTP when allowed |
| `ALLOW_HTTP_DEV` | `true` allows HTTP; production should be `false` with TLS |
| `FILES_ROOT` | Absolute path recommended; else `storage/` under project |
| `MAX_UPLOAD_BYTES` | `31457280` |
| `BACKUPS_ROOT` | Default `<project>/backups` |
| `PG_DUMP_PATH` | Optional full path to `pg_dump.exe` |
| `SCAN_INBOX_PATH` | Empty → `{FILES_ROOT}/inbox` |
| `SEED_SUPERADMIN_USERNAME` | `superadmin` |
| `SEED_SUPERADMIN_PASSWORD` | `ChangeMeNow!` |
| `SEED_SUPERADMIN_DISPLAY_NAME` | `System Superadmin` |
| `CORS_ORIGINS` | Comma-separated origins; empty → see CORS rules below |

`DB_*` is preferred over `DATABASE_URL` when `DB_USER` and `DB_NAME` are set.

### Production validation

`validateProductionConfig` (when `NODE_ENV=production`):

- Rejects weak/default session secrets.
- Requires `SESSION_SECRET.length >= 32`.
- Warns if `ALLOW_HTTP_DEV` with no TLS.

## TLS and cookies

| Situation | Listener | Session `secure` cookie |
|-----------|----------|-------------------------|
| Cert + key set | HTTPS | true |
| Production, no HTTP-dev | Prefer TLS | true when secure path applies |
| Dev HTTP (`ALLOW_HTTP_DEV`) | HTTP | false (unless cert present) |

LAN HTTPS with mkcert: see [README](../README.md) / [PRODUCTION_SETUP.md](../PRODUCTION_SETUP.md).

## CORS

[`createCorsOptions`](../server/src/config.js):

1. If `CORS_ORIGINS` non-empty → allowlisted origins + credentials.
2. Else if production → reject browser Origins (same-origin / no Origin only). Set `CORS_ORIGINS` when Vite on `:5173` talks to the API host.
3. Else (development) → allow `localhost` / `127.0.0.1` (any port); other origins echo (dev-friendly).

Same-origin `npm start` (SPA + API on `:3443`) usually needs **no** `CORS_ORIGINS`.

## Electron configuration

| Source | Location |
|--------|----------|
| Env override | `ERMS_SERVER_URL` |
| Dev file | `electron/config.json` (gitignored; copy from `config.example.json`) |
| Packaged | `config.json` next to `NSC-ERMS.exe` |
| Default | `https://localhost:3443` |

Example:

```json
{
  "serverUrl": "https://erms.local:3443"
}
```

For local HTTP API: `"serverUrl": "http://localhost:3443"`.

Packaged builds ship `config.example.json` as an extra file; live `config.json` is not baked into the installer contents list.

## Client-only prefs

SPA `localStorage` key `nsc_erms_prefs`: `{ darkMode, fontSize }` — not server config.

## Related docs

- Ops deploy checklist: [PRODUCTION_SETUP.md](../PRODUCTION_SETUP.md)
- File paths behavior: [file-storage.md](file-storage.md)
- Desktop Connect: [electron-desktop.md](electron-desktop.md)
