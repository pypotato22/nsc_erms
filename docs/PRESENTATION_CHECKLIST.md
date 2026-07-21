# Pre-Presentation Checklist — NSC-ERMS

Use this document before your **official demo**, **oral defense**, or **capstone panel presentation**. Work through each section in order. Record pass/fail and notes in the **Result** column.

Related docs: [STUDY_GUIDE.md](STUDY_GUIDE.md) · [CAPSTONE_PAPER.md](CAPSTONE_PAPER.md) Ch. 5 · [PRODUCTION_SETUP.md](../PRODUCTION_SETUP.md)

---

## How to use this checklist

1. **1 week before** — Complete environment setup and full functional pass (Sections 1–4).
2. **2–3 days before** — RBAC matrix, security checks, dry-run demo script (Sections 5–7).
3. **1 day before** — Presentation materials, backup plan, final smoke test (Sections 8–10).
4. **Day of** — Day-of checklist only (Section 11).

**Test accounts to prepare:**

| Username | Role | Purpose |
|----------|------|---------|
| `superadmin` (or your superadmin) | superadmin | Setup, users, full demo |
| `demo_admin` | admin | Users/backups without superadmin powers |
| `demo_staff` | staff | Write records, no admin tools |
| `demo_viewer` | viewer | Read-only verification |

Create test users in **Settings → Users** if they do not exist. Use known passwords and reset `must_change_password` only if needed for the demo flow.

---

## 1. Environment readiness

Complete before any feature testing.

### 1.1 Server / database

- [ ] PostgreSQL service is running
- [ ] `.env` configured (`DB_*`, `SESSION_SECRET`, `FILES_ROOT`, `BACKUPS_ROOT`)
- [ ] Migrations applied: `npm run migrate`
- [ ] Seed or production data loaded as intended
- [ ] `GET /api/v1/health` returns `"status": "ok"` and `"database": "up"`
- [ ] `FILES_ROOT` exists and is writable (uploads, inbox, employee folders)
- [ ] Scan inbox path exists (default `{FILES_ROOT}/inbox` or `SCAN_INBOX_PATH`)
- [ ] `pg_dump` on PATH (or `PG_DUMP_PATH` set) — required for backup demo
- [ ] `tar` available (Windows 10+ built-in) — required for backup zip

### 1.2 Application build

- [ ] Dependencies installed: `npm install`
- [ ] Production UI built: `npm run build` (if using `npm start`, not Vite dev)
- [ ] API starts without errors: `npm start` or `npm run dev:server`
- [ ] SPA loads at server URL (e.g. `http://localhost:3443` or LAN HTTPS URL)
- [ ] No stale UI: after renderer changes, rebuilt `renderer/dist` or using `dev:client`

### 1.3 Presentation environment (choose one)

**Option A — Local demo (lab / classroom)**

- [ ] `npm run dev:server` + `npm run dev:client` OR `npm run build` + `npm start`
- [ ] Browser bookmarked to SPA URL
- [ ] Sample employee data and documents pre-loaded

**Option B — LAN production-style demo**

- [ ] TLS cert installed and trusted on demo laptop(s) — see [PRODUCTION_SETUP.md](../PRODUCTION_SETUP.md)
- [ ] Windows Firewall allows port `3443` (or your `PORT`)
- [ ] Fixed hostname/IP documented (e.g. `https://erms.local:3443`)
- [ ] Electron `config.json` or Connect screen tested against LAN URL

**Option C — Desktop client demo**

- [ ] `npm run build:desktop` completed (or installed NSIS build on demo PC)
- [ ] `electron/config.json` or exe-side `config.json` points to running server
- [ ] Connect screen tested when server is stopped (fallback narrative ready)

---

## 2. Functional test matrix

Run as **superadmin** or **staff** unless the scenario specifies another role. Mark **Pass**, **Fail**, or **Skip** (with reason).

| ID | Scenario | Steps | Expected result | Result | Notes |
|----|----------|-------|-----------------|--------|-------|
| **F01** | Health endpoint | `GET /api/v1/health` (browser or curl) | JSON with `status`, `database: up` | | |
| **F02** | Valid login | Login with correct credentials | Redirect to app; session cookie set | | |
| **F03** | Invalid login | Wrong password 1× | 401; no session | | |
| **F04** | Rate limit | Wrong password 6+ times (same user/IP) | 429 `RATE_LIMITED` | | Optional; may lock account briefly |
| **F05** | Forced password change | Login as user with `must_change_password` | Change-password screen; most APIs blocked | | |
| **F06** | Change password | Submit new password (≥ 8 chars) | Success; full app access | | |
| **F07** | Setup wizard | First run as superadmin (if not completed) | Org name, paths saved; dirs created | | Skip if setup already done |
| **F08** | Setup guard | Call setup complete again | `SETUP_DONE` error | | |
| **F09** | Create department | Settings/Departments → add department | Appears in list; active | | |
| **F10** | Create position | Positions → add position | Appears in list | | |
| **F11** | Link dept–position | Assign position to department | Link visible; usable in employee form | | |
| **F12** | Create employee | New employee + primary assignment | Listed on Employees page | | |
| **F13** | Employee search | Search by name or employee no. | Correct subset shown | | |
| **F14** | Employee filter | Filter by department/status | Correct subset shown | | |
| **F15** | Pagination | More than one page of employees | Page next/prev works (12 or 25 per page) | | |
| **F16** | Profile photo | Upload employee photo | Photo displays in profile | | |
| **F17** | Upload document | Profile → 201 File → upload PDF/image | Document listed; file on disk under `FILES_ROOT` | | |
| **F18** | Document checklist | View 201 File checklist | Required types shown; satisfaction updates | | |
| **F19** | Document versioning | Upload second file for same document type | `version_number` increments; older version retained | | |
| **F20** | Download document | Download from profile | File opens correctly | | |
| **F21** | Soft-delete document | Delete document | Removed from profile; appears in Trash | | |
| **F22** | Restore document | Trash → restore | Back on employee profile | | |
| **F23** | Permanent delete document | Trash → permanent delete | Gone from DB and disk | | |
| **F24** | Archive employee | Delete employee (soft) | Gone from active list; in Archived Employees | | |
| **F25** | Restore employee | Archived → restore | Back on active list | | |
| **F26** | Permanent delete employee | Archived → permanent delete | Row removed; employee folder removed from disk | | |
| **F27** | Scan inbox list | Drop file in inbox folder → refresh Scan Inbox | File appears in list | | |
| **F28** | Scan assign | Assign inbox file to employee + type | Document on profile; file moved from inbox | | |
| **F29** | Scan reject | Reject inbox file with reason | File removed from inbox; in failed/processed area | | |
| **F30** | Create user (admin) | Settings → Users → add staff/viewer | User can login | | |
| **F31** | Deactivate user | Deactivate test user | Login fails / user inactive | | |
| **F32** | Reset password (admin) | Admin resets user password | User must change password on next login | | |
| **F33** | Audit log | Perform sensitive action → Settings → Audit | Entry appears with action, actor, time | | |
| **F34** | Backup create | Backup page → Create | Zip listed; contains `database.sql` + `files/` | | |
| **F35** | Backup download | Download backup zip | File saves; opens; README present | | |
| **F36** | Backup delete | Delete old backup | Removed from list | | |
| **F37** | Export | Export page → export data | File downloads (CSV/JSON as implemented) | | |
| **F38** | Live sync (SSE) | Two browsers; edit in tab A | Tab B refreshes list without manual reload | | |
| **F39** | Logout | Logout | Session cleared; login screen | | |
| **F40** | Settings appearance | Toggle dark mode / font size | Persists after reload (`nsc_erms_prefs`) | | |
| **F41** | Electron health probe | Launch desktop client with server up | Loads login (no Connect screen) | | |
| **F42** | Electron Connect | Launch with server down or wrong URL | Connect screen; enter URL → login | | |
| **F43** | Production SPA serve | `npm run build` + `npm start` → open `:3443` | UI loads from same origin as API | | |

**Sign-off:** ___ / 43 scenarios passed · Tester: __________ · Date: __________

---

## 3. Role-based access (RBAC) matrix

Log in as each role and verify **UI hides/disables** write actions **and** direct API calls return **403** where applicable.

| Action | viewer | staff | admin | superadmin |
|--------|:------:|:-----:|:-----:|:----------:|
| View employees / documents | ☐ | ☐ | ☐ | ☐ |
| Create/edit employee | ☐ deny | ☐ allow | ☐ allow | ☐ allow |
| Upload / delete documents | ☐ deny | ☐ allow | ☐ allow | ☐ allow |
| Scan inbox assign/reject | ☐ deny | ☐ allow | ☐ allow | ☐ allow |
| Departments / positions write | ☐ deny | ☐ allow | ☐ allow | ☐ allow |
| Manage users | ☐ deny | ☐ deny | ☐ allow | ☐ allow |
| Create/modify superadmin users | ☐ deny | ☐ deny | ☐ deny* | ☐ allow |
| Backup create/download/delete | ☐ deny | ☐ deny | ☐ allow | ☐ allow |
| View audit log | ☐ deny | ☐ deny | ☐ allow | ☐ allow |
| Setup wizard complete | ☐ deny | ☐ deny | ☐ deny | ☐ allow |

\*Admin may be blocked from editing other superadmin accounts — confirm matches your seed/policy.

**Quick API spot-check (optional):** While logged in as `viewer`, attempt `POST /api/v1/employees` via browser DevTools or curl with session cookie → expect `403 FORBIDDEN`.

---

## 4. Security control verification

Verify controls are **present and demonstrable**. Aligns with CAPSTONE_PAPER Table 5.

| ID | Control | How to verify | Status |
|----|---------|---------------|--------|
| S01 | bcrypt password hashing | Users table has `password_hash`; not plain text | ☐ |
| S02 | Server-side sessions | Cookie `nsc_erms.sid`; row in `session` table | ☐ |
| S03 | HttpOnly cookie | DevTools → Application → Cookies → HttpOnly flag | ☐ |
| S04 | Secure cookie (TLS/prod) | `Secure` flag when HTTPS / production mode | ☐ |
| S05 | Session timeout | Document 8-hour maxAge; optional: note in defense | ☐ |
| S06 | RBAC on routes | viewer cannot mutate via UI or API | ☐ |
| S07 | Password change gate | APIs return `PASSWORD_CHANGE_REQUIRED` until changed | ☐ |
| S08 | Login rate limiting | Repeated failures → 429 | ☐ |
| S09 | Helmet middleware | Response headers present (check Network tab) | ☐ |
| S10 | Production SESSION_SECRET | `.env` uses 32+ char secret in prod config | ☐ |
| S11 | CORS (if cross-origin dev) | `CORS_ORIGINS` set when SPA on :5173 | ☐ |
| S12 | Upload size limit | File > 30 MB rejected | ☐ |
| S13 | MIME allowlist | Unsupported type rejected on upload | ☐ |
| S14 | Path traversal guard | Document paths stay under `FILES_ROOT` | ☐ |
| S15 | Audit on auth failures | Failed login appears in audit (admin view) | ☐ |
| S16 | Electron isolation | `contextIsolation`; no `nodeIntegration` in preload | ☐ |
| S17 | Electron origin lock | Cannot navigate window to external site | ☐ |

**Honest limitations to state if asked:**

- No automated unit/e2e test suite in repo
- No formal penetration test report
- SSE hub is single Node process (not multi-instance)
- Backup restore is manual ops, not in-app wizard

---

## 5. Recommended demo script (15–25 minutes)

Practice this flow until smooth. Adjust order to match your panel objectives.

| Order | Segment | Time | What to show | Talking point |
|-------|---------|------|--------------|-----------------|
| 1 | **Intro** | 1–2 min | Architecture diagram (browser/Electron → Express → PG + disk) | LAN-hosted; registrar owns data |
| 2 | **Login + security** | 2 min | Login → (optional) forced password change | Session cookie, not JWT |
| 3 | **Employees** | 3 min | Search, create, open profile | Primary assignment, soft-delete |
| 4 | **201 File** | 4 min | Upload document → checklist → second version | Versioning, typed 201 File |
| 5 | **Scan inbox** | 2 min | Pre-dropped scan → assign to employee | MFP drop-folder workflow |
| 6 | **Org catalogs** | 1 min | Departments + positions | Links drive assignments |
| 7 | **Trash / archive** | 2 min | Restore one item | Soft-delete lifecycle |
| 8 | **RBAC** | 2 min | Quick login as viewer — read only | Server enforces roles |
| 9 | **Audit + backup** | 3 min | Audit entry; create backup; show zip contents | Accountability + DB+files together |
| 10 | **Live sync** | 1 min | Second tab refreshes | SSE invalidation |
| 11 | **Electron** (optional) | 2 min | Desktop window + Connect screen | Thin client, same origin |
| 12 | **Q&A prep** | — | Limitations slide ready | No cloud lock-in; ops prerequisites |

**Pre-stage before demo:**

- [ ] One employee with photo and at least 2 document types uploaded
- [ ] One file waiting in scan inbox
- [ ] One item in document Trash (for quick restore)
- [ ] Backup list non-empty OR accept live backup create (~30–60 s)

---

## 6. Presentation materials checklist

### 6.1 Slides / manuscript

- [ ] Title slide (project name, authors, institution, SY)
- [ ] Problem statement + objectives (Ch. 1)
- [ ] Architecture diagram (3-tier + deployment)
- [ ] ER / data model (simplified)
- [ ] Role–capability matrix (Table 2 in capstone)
- [ ] Technology stack summary
- [ ] Demo screenshots (Employees, 201 File, Scan Inbox, Backup, Electron)
- [ ] Functional test summary (pass count from Section 2)
- [ ] Security checklist summary (Section 4)
- [ ] Strengths vs. limitations (honest)
- [ ] Recommendations / future work
- [ ] Thank you / Q&A slide

### 6.2 Live demo assets

- [ ] Demo machine charged / plugged in
- [ ] Network cable or stable Wi‑Fi (for LAN demo)
- [ ] Browser zoom readable for projector (125–150%)
- [ ] Desktop client installed (if showing Electron)
- [ ] mkcert CA trusted on demo machine (if HTTPS)
- [ ] Backup sample zip to open offline if live backup fails

### 6.3 Documentation handouts (if required)

- [ ] [CAPSTONE_PAPER.md](CAPSTONE_PAPER.md) or Word export
- [ ] [PRODUCTION_SETUP.md](../PRODUCTION_SETUP.md) excerpt for IT
- [ ] [api-reference.md](api-reference.md) or one-page API summary

---

## 7. Dry-run checklist

Complete at least **one full dry-run** with a peer or adviser.

- [ ] Full demo script (Section 5) completed without blocking errors
- [ ] Each slide matches what is shown on screen
- [ ] Transitions between features are rehearsed (no hunting for menus)
- [ ] Time kept within panel limit (practice with timer)
- [ ] Q&A: can explain Electron thin client vs. embedded server
- [ ] Q&A: can explain session auth vs. JWT
- [ ] Q&A: can explain backup contents and manual restore
- [ ] Q&A: can explain document versioning (`replaces_id`)
- [ ] Q&A: can explain known gaps (no automated tests, single-process SSE)
- [ ] Peer feedback recorded and critical issues fixed

---

## 8. Fallback plans (if live demo fails)

| Failure | Fallback |
|---------|----------|
| Database down | Show `/health` degraded JSON + architecture slide; use screenshots/video |
| Server won't start | Pre-recorded demo video or screenshot walkthrough in Appendix E |
| TLS / certificate error | Switch to HTTP dev mode only if allowed; else use browser on trusted machine |
| Backup create fails (`pg_dump` missing) | Show pre-created backup zip; explain ops prerequisite |
| Scan inbox empty | Manually copy file into inbox folder during break |
| Electron won't connect | Demo in browser; explain Electron is optional thin shell |
| Projector resolution | Increase browser zoom; use dark mode off for contrast |
| Rate limit locked account | Use alternate test user prepared in advance |

- [ ] Fallback video or screenshot deck prepared
- [ ] Pre-created backup zip on USB / local disk
- [ ] Secondary test user credentials written down (not only superadmin)

---

## 9. Manuscript / capstone alignment

Before submission or defense, confirm written claims match what you tested.

- [ ] Chapter 5 Table 4 (functional matrix) matches your Section 2 results
- [ ] Chapter 5 Table 5 (security) matches Section 4
- [ ] All `[placeholders]` replaced in [CAPSTONE_PAPER.md](CAPSTONE_PAPER.md)
- [ ] Screenshots in appendix match current UI (not outdated build)
- [ ] Objectives-to-modules table (Table 1) maps to demo script segments
- [ ] Limitations section mentions: no automated tests, no in-app restore, backup tooling deps

---

## 10. One day before presentation

- [ ] Re-run critical path: F02, F12, F17, F19, F28, F34, F38, F41 (8 tests minimum)
- [ ] Confirm PostgreSQL service set to auto-start (production demo)
- [ ] Clear browser cache or use fresh profile if session issues occurred
- [ ] Copy latest `renderer/dist` to server if not using dev mode
- [ ] Print or save this checklist with filled Result columns
- [ ] Sleep / charge devices / confirm venue HDMI or screen mirror

---

## 11. Day-of presentation (final 30 minutes)

- [ ] PostgreSQL running
- [ ] ERMS API running (`npm start` or service)
- [ ] Health check green
- [ ] Login works with demo superadmin
- [ ] Demo employee and documents visible
- [ ] Scan inbox file in place
- [ ] Slides open on presenter machine
- [ ] Browser on correct URL; sidebar and login tested once
- [ ] Phone on silent; close unrelated apps/notifications
- [ ] Water / notes ready; team roles assigned (presenter vs. clicker vs. backup)

---

## 12. Post-presentation (optional)

- [ ] Archive test results (filled checklist PDF or copy in repo `docs/`)
- [ ] Note panel questions you could not answer → update manuscript or README
- [ ] File bug fixes for any failures discovered during testing
- [ ] Tag release or snapshot commit if defense version must be preserved

---

## Quick reference — default credentials (development only)

| Item | Default |
|------|---------|
| Superadmin username | `superadmin` |
| Superadmin password | `ChangeMeNow!` (override via `.env` `SEED_SUPERADMIN_*`) |
| API port | `3443` |
| Vite dev port | `5173` |
| Session cookie | `nsc_erms.sid` |
| Max upload | 30 MB |

**Do not use default passwords in a public or production demo.** Create dedicated demo accounts with strong passwords.

---

*Last updated for NSC-ERMS codebase layout (`server/`, `renderer/`, `electron/`, `db/migrations/`).*
