# NORTHERN SAMAR COLLEGES — EMPLOYEE RECORDS MANAGEMENT SYSTEM (NSC-ERMS)

**A Capstone Project Presented to the Faculty of**  
**[College / Department Name]**  
**Northern Samar Colleges**  
**[City / Campus], Philippines**

---

In Partial Fulfillment of the Requirements for the Degree  
**Bachelor of Science in [Information Technology / Computer Science / Computer Engineering]**

---

**Prepared by**

[Author Name 1]  
[Author Name 2]  
[Author Name 3]  
*(add or remove authors as applicable)*

**Adviser:** [Adviser Name, Degree / Title]  

**School Year:** [SY 20XX–20XX]

---

> **Document note.** This file is a Markdown draft of the full capstone manuscript. Convert to Microsoft Word or Google Docs for final formatting (margins, Times New Roman/Arial 12 pt, double spacing, page numbers, and APA-style hanging indents for references) according to your department’s thesis/capstone manual. Bracketed `[placeholders]` must be replaced before submission. Technical claims are grounded in the implemented NSC-ERMS codebase and companion technical documentation under `docs/`.

---

## Approval Sheet

This capstone project entitled **“Northern Samar Colleges — Employee Records Management System (NSC-ERMS)”** prepared and submitted by **[Author Name(s)]** is hereby recommended for oral defense / accepted as fulfilling part of the requirements for the degree of **Bachelor of Science in [Program]**.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Adviser | [Adviser Name] | ____________ | ______ |
| Panel Member | [Name] | ____________ | ______ |
| Panel Member | [Name] | ____________ | ______ |
| Panel Chair | [Name] | ____________ | ______ |
| Dean / Program Head | [Name] | ____________ | ______ |

---

## Abstract

Northern Samar Colleges (NSC) manages employee 201 Files, organizational assignments, and related registrar operations that historically depend on folder-based storage and fragmented desktop tools. This capstone project presents the design, development, and system evaluation of the **Northern Samar Colleges — Employee Records Management System (NSC-ERMS)**: a LAN-hosted application that centralizes employee records, versioned document management for the Philippine 201 File package, department–position catalogs, scan-to-folder intake, role-based access control, audit logging, database-and-file backups, and a Windows Electron thin client for staff workstations.

The system follows a three-tier architecture: a Vanilla JavaScript single-page application (SPA) built with Vite; a Node.js Express REST API (`/api/v1`) with PostgreSQL persistence and disk-based binary storage; and an optional Electron shell that loads the registrar server origin over HTTP(S) so session cookies remain same-origin. Security controls include bcrypt password hashing, PostgreSQL-backed express sessions, forced password change, login rate limiting, Helmet middleware, LAN TLS support, and role hierarchy (`viewer`, `staff`, `admin`, `superadmin`). Multi-user freshness uses Server-Sent Events (SSE) for live UI invalidation rather than full client-side state replication.

System evaluation was conducted through functional smoke testing against documented features, a security control checklist aligned with implemented middleware, deployment walkthrough of the registrar-server plus desktop-client model, and qualitative discussion of limitations (notably absence of automated regression tests and OpenAPI contracts). Results indicate that NSC-ERMS satisfies the stated general and specific objectives for end-to-end registrar workflows on a campus LAN, while remaining suitable for phased operational hardening.

**Keywords:** employee records management, 201 File, LAN information system, Electron thin client, Express, PostgreSQL, role-based access control, Northern Samar Colleges

---

## Acknowledgments

The researchers extend gratitude to Northern Samar Colleges, the [College / Department], and **[Adviser Name]** for guidance throughout the project. Appreciation is likewise extended to registrar / HR personnel who shared domain context regarding 201 File practices *(if applicable)*, to panel members for critique, to family and peers for support, and to the open-source communities behind Node.js, Express, PostgreSQL, Vite, Electron, and related libraries that made implementation feasible.

---

## Table of Contents

*(Update page numbers after Word conversion.)*

1. [Chapter 1 — The Problem and Its Background](#chapter-1--the-problem-and-its-background)  
2. [Chapter 2 — Review of Related Literature and Studies](#chapter-2--review-of-related-literature-and-studies)  
3. [Chapter 3 — Methodology](#chapter-3--methodology)  
4. [Chapter 4 — System Design and Development](#chapter-4--system-design-and-development)  
5. [Chapter 5 — Results and Discussion](#chapter-5--results-and-discussion)  
6. [Chapter 6 — Summary, Conclusions, and Recommendations](#chapter-6--summary-conclusions-and-recommendations)  
7. [References](#references)  
8. [Appendices](#appendices)

---

## List of Tables

| No. | Title |
|-----|--------|
| 1 | Specific objectives mapped to implemented modules |
| 2 | Role–capability matrix |
| 3 | Technology stack summary |
| 4 | Functional evaluation matrix (smoke tests) |
| 5 | Security control checklist |
| 6 | Strengths and limitations |

## List of Figures

| No. | Title |
|-----|--------|
| 1 | Context diagram — campus LAN deployment |
| 2 | Logical architecture — presentation, application, data |
| 3 | High-level entity relationship (conceptual) |
| 4 | Login and session establishment sequence |
| 5 | Soft-delete lifecycle for employees and documents |
| 6 | Electron Connect / boot flow |
| 7 | Use-case overview (registrar stakeholders) |

*(Insert actual screenshots / exported diagrams as Figure plates in the Word manuscript.)*

---

# Chapter 1 — The Problem and Its Background

## 1.1 Introduction

Higher-education institutions rely on accurate, accessible, and auditable **employee records** to support hiring, retention, credentials verification, and compliance. In the Philippine public and private school context, the **201 File** traditionally aggregates Personal Data Sheets, transcripts, licenses, clearances, contracts, and related credentials into a personnel folder. When those materials are stored only as shared drives or local folders—with unclear versioning, weak access control, and limited auditability—registrar and administrative units face risk: misplaced scans, duplicate uploads, inconsistent employee numbering, and delayed retrieval during audits or certification requests.

Northern Samar Colleges requires a practical, campus-LAN solution that preserves registrar ownership of data (as opposed to mandatory cloud SaaS), supports staff workstations that prefer a desktop window, and still modernizes security and document workflows. This capstone responds with **NSC-ERMS**, an Employee Records Management System implemented as a monorepo combining Express + PostgreSQL on a registrar server, a browser SPA, and an Electron thin client.

## 1.2 Background of the Study

Many campus administrative systems begin as paper 201 Files and evolve into unstructured electronic folders. Common pain points observed in Philippine HEI / basic-education registrar practice include:

1. **Fragmented storage** — PDFs and photos reside on different machines; metadata (type, expiry, who uploaded) is incomplete.  
2. **Weak multi-user coordination** — simultaneous editing of “shared Excel/lists” causes inconsistent employee status and assignments.  
3. **Insufficient access control** — viewer staff may need read-only access while only certain roles should upload or manage users.  
4. **Backup gaps** — backing up “the documents folder” without the database (or vice versa) yields incomplete restore points.  
5. **Scan intake friction** — multifunctional printers drop files into folders that still require manual renaming and placement into employee directories.

NSC-ERMS addresses these by treating employees, assignments, document types, and audit events as first-class database entities; storing binaries under a controlled `FILES_ROOT`; offering a Scan Inbox to assign drop-folder files into versioned 201 File records; and packaging database dumps with files for admin-initiated backups.

## 1.3 Statement of the Problem

The general problem of the study is: **How can Northern Samar Colleges implement a LAN-based Employee Records Management System that securely centralizes employee data and 201 File documents for registrar workflows?**

Specifically, the study sought to answer:

1. What functional capabilities must the system provide for employees, departments/positions, 201 File documents, scan intake, users/roles, audit, and backups?  
2. What architecture and technology choices suit a campus LAN with a registrar-hosted server and thin desktop clients?  
3. How can authentication, authorization, and related controls reduce unauthorized access and support accountability?  
4. To what extent does the implemented system meet the stated objectives based on functional and security evaluation?

## 1.4 Objectives of the Study

### 1.4.1 General Objective

To design, develop, and evaluate a LAN-hosted **Employee Records Management System** for Northern Samar Colleges that supports secure registrar management of employee records and 201 File documents, including an optional Windows desktop client.

### 1.4.2 Specific Objectives

1. To implement employee master records with primary department–position assignments, search/filter/pagination, soft-delete (archive), restore, and permanent delete with file cleanup.  
2. To implement 201 File document management with typed catalog, upload of allowed MIME types, versioning, soft-delete trash, restore, permanent purge, and download.  
3. To provide department and position catalogs with department–position linking used by assignments.  
4. To provide a scan inbox workflow that lists drop-folder files and supports assign-to-employee or reject.  
5. To implement authentication (login/logout/session/me/change-password), first-run setup for superadmin, and RBAC across viewer/staff/admin/superadmin.  
6. To record audit events for sensitive actions and expose an audit viewer to admin/superadmin.  
7. To implement admin backups combining `pg_dump` and `FILES_ROOT` into downloadable archives.  
8. To deliver a Vite-built SPA served by Express and an Electron thin client with Connect/health-probe flow for staff PCs.  
9. To evaluate the system via functional smoke testing and a security control checklist, and to document limitations and recommendations.

## 1.5 Scope and Delimitation

### 1.5.1 Scope

The system covers registrar-centric **employee records** operations on a **local area network**:

- SPA modules: Employees, Departments, Positions, Scan Inbox, Document Trash, Archived Employees, Backup, Export, Settings (appearance, password, users, audit).  
- REST API under `/api/v1` with PostgreSQL schema (migrations) and disk storage for photos/documents.  
- Electron Windows x64 NSIS packaging for a thin client.  
- Security baselines described in Chapter 4 (sessions, RBAC, rate limits, password gate, TLS support).

### 1.5.2 Delimitations

The project does **not** include:

- Cloud multi-tenant SaaS hosting or Internet-facing public enrollment portals.  
- Payroll, biometric attendance, or full HRIS financial modules.  
- Automated in-app backup restore wizard (restore remains an operations procedure).  
- Comprehensive automated unit/e2e test suites or generated OpenAPI/Swagger.  
- Electron auto-update, system tray, or macOS/Linux installer targets at the time of writing.  
- Formal large-sample user satisfaction survey statistics (evaluation uses system/security checklists instead).

## 1.6 Significance of the Study

**To Northern Samar Colleges (Registrar / Administration).** Provides a controllable LAN system for employee and 201 File operations with roles and audit trails.

**To IT / MIS staff.** Documents a deployable stack (Node, PostgreSQL, TLS, backups) aligned with production setup guidance.

**To employees / data subjects *(indirect)*.** Supports more consistent handling of personnel documents compared with unmanaged shared folders *(subject to institutional privacy policies)*.

**To the researchers / students.** Demonstrates end-to-end software engineering: requirements, design, implementation, packaging, and evaluation.

**To future researchers.** Offers a localized case of campus ERMS using a thin Electron client over a same-origin Express API.

## 1.7 Definition of Terms

| Term | Operational definition |
|------|------------------------|
| **201 File** | Institutional personnel documentary package (e.g., PDS, TOR, clearances) managed as typed documents per employee. |
| **Assignment** | Employee placement in a department–position junction with employment type, status, and dates; one primary active open-ended assignment at a time. |
| **ERMS** | Employee Records Management System — this project’s information system. |
| **FILES_ROOT** | Server filesystem root for employee photos and document binaries. |
| **LAN** | Local area network connecting the registrar server and staff clients. |
| **RBAC** | Role-based access control via seeded roles and server middleware. |
| **Scan Inbox** | Drop folder on the server where scans are listed for assign/reject. |
| **Soft delete** | Logical removal (`deleted_at` / archive) retaining recoverability until permanent purge. |
| **SSE** | Server-Sent Events used for live UI invalidation across clients. |
| **Thin client (Electron)** | Desktop shell that loads the remote ERMS web origin rather than embedding business databases. |
| **ULID** | Universally Unique Lexicographically Sortable Identifier stored as `CHAR(26)`. |

---

# Chapter 2 — Review of Related Literature and Studies

## 2.1 Introduction

This chapter situates NSC-ERMS among concepts in campus information systems, document management, security for web applications, and desktop encapsulation of web UIs. Sources below are **representative** and should be verified/extended against your library’s available materials and your department’s citation style (APA 7th recommended). Replace or augment with locally accessible theses and journal articles.

## 2.2 Conceptual Literature

### 2.2.1 Human Resource and Employee Records Information Systems

Employee records systems store master data (identity, contact, organizational placement) and attach documentary evidence. Literature on HRIS emphasizes data quality, access control, and process support—not only digitizing paper (Armstrong, 2020; Kavanagh & Johnson, 2017). For schools, the priority is often **credential and documentary completeness** more than full corporate talent modules.

### 2.2.2 Electronic Document Management and Versioning

Document management systems (DMS) classify documents, control versions, and track lifecycle (Buckland, 2017). Version fields and “replaces” links—as used in NSC-ERMS—mirror DMS practice of retaining prior files rather than silent overwrite, which supports auditability of personnel credentials.

### 2.2.3 Client–Server and LAN Deployment in Schools

Campus systems frequently prefer **on-premises** servers for data residency and offline-LAN operation. Classical three-tier designs (presentation, application, data) remain appropriate (Sommerville, 2016). Thin clients reduce per-seat install surface for business logic while allowing desktop UX familiarity.

### 2.2.4 Web Security and Session Management

OWASP guidance stresses authentication, session management, and access control as foundational risks (OWASP Foundation, n.d.). Cookie-based sessions with `HttpOnly`, `Secure` (when TLS), and server-side stores; password hashing (bcrypt); and rate limiting against credential stuffing are standard mitigations. Role-based access complements least privilege (Sandhu et al., 1996).

### 2.2.5 Progressive / Packaged Web Frontends and Electron

Modern SPAs improve interactivity via client rendering while talking to REST backends (Mikowski & Powell, 2013). Electron packages Chromium + Node for desktop windows; security literature warns against enabling Node integration in untrusted pages—hence context isolation and preload bridges for privileged APIs only (Electron documentation, n.d.).

## 2.3 Related Studies / Analogous Systems

### 2.3.1 School and Local Government Record Systems (Philippine context)

Numerous Philippine IT theses and capstones implement student records, enrollment, or document tracking for HEIs and LGUs using PHP/MySQL or similar LAMP stacks. Patterns repeatedly include: CRUD modules, role accounts, file uploads, and printed reports. NSC-ERMS is distinct in focusing on **employee 201 Files**, PostgreSQL + Express, SSE live refresh, explicit backup zip of DB+files, and an **Electron thin client** Connect flow.

### 2.3.2 Commercial / open HRIS and DMS

Commercial HRIS (e.g., BambooHR-class tools) and DMS platforms offer richer workflows but typically require cloud subscription, Internet dependence, or licensing costs unsuitable for some campus contexts. NSC-ERMS trades breadth for **deployability on college-controlled LAN infrastructure**.

### 2.3.3 Synthesis

Related work affirms need for centralized employee documentary systems with access control. Gap for NSC: a **localized LAN ERMS** with registrar backups, scan-folder intake, multi-role security, and optional desktop packaging—without requiring cloud SaaS. This study fills that gap for Northern Samar Colleges’ operational setting.

## 2.4 Theoretical / Conceptual Framework

The project adopts a **systems development** perspective: user needs → requirements → architecture → implementation → evaluation. Conceptually:

```text
Registrar needs (records, 201 File, roles, audit, backup)
        ↓
Requirements & use cases
        ↓
Three-tier LAN architecture (SPA / Express / PostgreSQL+Files)
        ↓
Security + RBAC + sessions
        ↓
Functional & security evaluation → feedback / recommendations
```

---

# Chapter 3 — Methodology

## 3.1 Research Design

This study used a **developmental research** design (also called R&D or software engineering project method): the primary product is a working information system, accompanied by documentation and evaluative testing. It is not a pure experimental design with control groups; Chapter 5 reports **system evaluation** results.

## 3.2 Methods of Development

Development followed an iterative **agile-inspired SDLC** adapted to capstone timelines:

1. **Requirements gathering** — Feature list derived from registrar domain (201 File practices) and stated objectives.  
2. **Design** — Architecture (Figure 1–2 style), ER modeling, API resource map, RBAC matrix.  
3. **Implementation** — npm workspaces (`server`, `renderer`), Electron shell, SQL migrations.  
4. **Verification** — Manual smoke tests per module; health checks; security checklist.  
5. **Deployment packaging** — Vite production build; Electron NSIS; production setup documentation.  
6. **Documentation** — Technical docs (`docs/`) and this manuscript.

## 3.3 Respondents / Users *(for context, not survey statistics)*

Intended users:

| Actor | Typical use |
|-------|-------------|
| Viewer | Read employee/document records |
| Staff | Create/update records, uploads, scan assign |
| Admin | Users, backups, audit |
| Superadmin | Setup + all admin powers |
| IT ops | Server install, TLS, Postgres, restore |

No fabricated Likert percentages are reported. If the department later requires a user-acceptance survey, instruments may be attached as an appendix and filled with real data.

## 3.4 Instruments and Evaluation Procedures

### 3.4.1 Functional evaluation matrix

Each specific objective/module was exercised against expected outcomes (pass/fail/partial), documented in Chapter 5, Table 4.

### 3.4.2 Security control checklist

Controls claimed in design (session cookie flags, bcrypt, rate limit, password gate, RBAC, Helmet, TLS option, Electron isolation) were verified as **present in code/config** and smoke-tested where feasible (Chapter 5, Table 5).

### 3.4.3 Deployment walkthrough

Evaluator followed the production architecture (registrar server + client) conceptually and via documented setup procedures (`PRODUCTION_SETUP.md`).

## 3.5 Tools and Technologies

**Table 3. Technology stack summary**

| Layer | Technology |
|-------|------------|
| Language | JavaScript (ES modules) |
| SPA | Vanilla JS, Vite 8 |
| API | Node.js 20+, Express 5 |
| Database | PostgreSQL 14+, `pg` |
| Session | `express-session` + `connect-pg-simple` |
| Auth crypto | `bcryptjs` |
| Uploads | `multer` |
| IDs | `ulid` |
| Desktop | Electron 37, electron-builder (NSIS x64) |
| Live updates | Server-Sent Events |

## 3.6 Ethical Considerations

Employee records are sensitive. The researchers treat sample/seed data as non-production and recommend that the institution apply its data privacy policy (aligned with the Philippine Data Privacy Act of 2012 concepts of legitimate purpose, transparency, and proportionality). Production passwords must be rotated from seed defaults; TLS should be enabled on the LAN; access should follow least privilege.

---

# Chapter 4 — System Design and Development

## 4.1 System Overview

**NSC-ERMS** is Northern Samar Colleges’ Employee Records Management System. One registrar host runs Express (API + static SPA), PostgreSQL, and file directories. Staff access via browser or Electron.

**Figure 1. Context diagram — campus LAN deployment**

```text
┌─────────────────────┐         HTTPS (LAN)        ┌──────────────────────────────┐
│ Staff PC            │ ─────────────────────────► │ Registrar server              │
│ Electron / Browser  │                            │ Express /api/v1 + SPA         │
└─────────────────────┘                            │   ├── PostgreSQL               │
                                                   │   └── FILES_ROOT / inbox /     │
                                                   │       backups                  │
                                                   └──────────────────────────────┘
```

## 4.2 Requirements Summary

### 4.2.1 Functional requirements (selected)

- FR1: Authenticate users; enforce password change when flagged.  
- FR2: CRUD employees with primary assignment; archive/restore/purge.  
- FR3: Manage 201 File documents with types, versions, trash.  
- FR4: Maintain departments, positions, and links.  
- FR5: Scan inbox assign/reject.  
- FR6: Admin manage users/roles within policy; view audit; create backups.  
- FR7: Superadmin first-run setup (org name, paths, upload limit).  
- FR8: Live refresh cues via SSE.  
- FR9: Desktop Connect when server URL unknown/unreachable.

### 4.2.2 Non-functional requirements (selected)

- NFR1: Operate primarily on campus LAN.  
- NFR2: Support HTTPS / Secure cookies for production.  
- NFR3: Upload size capped (~30 MB).  
- NFR4: Role enforcement on server (not UI-only).  
- NFR5: Auditability of sensitive actions.

## 4.3 Use-Case Overview

**Figure 7 (textual). Primary use cases**

- Login / Change password / Logout  
- Complete setup (superadmin)  
- Manage employees / assignments  
- Manage 201 File documents  
- Process scan inbox  
- Manage departments & positions  
- Manage users (admin+)  
- View audit log (admin+)  
- Create/download/delete backups (admin+)  
- Connect desktop to server (Electron)

## 4.4 Architecture

**Figure 2. Logical architecture**

```text
Presentation:  renderer SPA (+ Electron chrome)
Application:   Express routes, middleware, services
Data:          PostgreSQL + FILES_ROOT (+ backups zip)
```

### Why a thin Electron client?

Business networking uses normal same-origin HTTP(S). Electron only resolves `serverUrl`, probes `/api/v1/health`, and loads the UI. Session cookies work without a custom IPC database bridge—reducing duplicated business logic on the desktop.

### Monorepo packages

| Package | Responsibility |
|---------|----------------|
| `server/` | API, sessions, migrations tooling |
| `renderer/` | SPA source and Vite build |
| `electron/` | Main/preload/Connect UI |
| `db/migrations/` | Schema source of truth |

## 4.5 Database Design

IDs are ULID `CHAR(26)`. Core entities:

- Lookups: departments, positions, department_positions, employment_types/statuses, document_types, user_roles  
- Core: employees, employee_assignments, users, documents  
- System: app_settings, audit_logs, session  

**Figure 3. Conceptual ER (simplified)**

```text
user_roles ──< users >──? employees
employees ──< employee_assignments >── department_positions
              ├── employment_types / statuses
              └── departments × positions
employees ──< documents >── document_types
               └── version_number / replaces_id
```

Soft delete: documents use `deleted_at`; employees use `deleted_at` / archived listing. Partial unique index enforces one primary active open-ended assignment per employee. Migrations: `001_initial_schema.sql`, `002_document_versioning.sql`, `003_employee_no_nullable.sql`.

## 4.6 Application Programming Interface

Versioned REST under `/api/v1`. Auth via cookie `nsc_erms.sid`. Error envelope:

```json
{ "error": { "code": "VALIDATION", "message": "…" } }
```

Major resource groups: health, setup, auth, lookups, departments, positions, employees (+ nested documents / photo), documents (item/trash), scan-inbox, backups, audit-logs, users, events/stream (SSE).

Mutations typically: persist → write audit → publish SSE event (e.g., `employees.changed`). Full catalog lives in project technical doc `docs/api-reference.md`.

## 4.7 Security Design

**Table 2. Role–capability matrix**

| Capability | viewer | staff | admin | superadmin |
|------------|:------:|:-----:|:-----:|:----------:|
| Read records | ✓ | ✓ | ✓ | ✓ |
| Write records / uploads / scan | | ✓ | ✓ | ✓ |
| Users, backups, audit | | | ✓ | ✓ |
| First-run setup | | | | ✓ |
| Create/modify other superadmins | | | | ✓ |

Additional controls:

- bcrypt password hashes (cost 12 on write paths)  
- Session in Postgres; 8-hour cookie; HttpOnly; SameSite=lax; Secure when TLS/prod rules apply  
- Password change gate blocking most APIs until completed  
- Login rate limits (5 / 15 min per IP+account; 30 / IP)  
- Helmet; CORS allowlist via `CORS_ORIGINS` in production cross-origin cases  
- Electron: `contextIsolation`, `sandbox`, no `nodeIntegration`; navigation locked to connected origin  

**Figure 4. Login and session (simplified)**

```text
Client → POST /auth/login → verify user → set session → Set-Cookie
Client → subsequent API with cookie → requireAuth / requireRole
```

## 4.8 Document and File Workflows

Uploads use multipart FormData → multer → write under `FILES_ROOT/employees/{id}/…`. New document versions increment `version_number` and set `replaces_id`. Scan assign moves inbox files into the same document model with `source = scan_folder`.

**Figure 5. Soft-delete lifecycle**

```text
Active → Soft delete (list in Trash/Archived) → Restore
                                      ↘ Permanent delete (DB + disk)
```

Backups: `pg_dump` + copy of `FILES_ROOT` zipped under `BACKUPS_ROOT` (admin+). Restore is operational (not in-app wizard).

## 4.9 Frontend Design

Hash routing (`#employees`, `#settings`, …). Module-level `App` state; prefs in `localStorage` (`nsc_erms_prefs`). Live sync via `EventSource` with debounce; ignores events authored by the current user to avoid redundant self-refresh.

## 4.10 Electron Design

**Figure 6. Boot / Connect**

```text
ERMS_SERVER_URL → config.json → default https://localhost:3443
        → GET /api/v1/health
        → loadURL(server) OR connection.html
```

IPC (`window.nscDesktop`): window chrome + boot/connect only—not business CRUD.

## 4.11 Implementation Highlights

- Express app composition in `server/src/app.js`  
- Route/service separation for files, backup, audit, live events  
- SPA API modules mirroring resources  
- Windows installer via `npm run build:desktop`  

## 4.12 Objectives-to-Modules Mapping

**Table 1. Specific objectives mapped to implemented modules**

| Objective | Primary modules |
|-----------|-----------------|
| Employees + archive | `employees` routes/UI |
| 201 File | `documents` + profile panel |
| Dept/Positions | `departments`, `positions` |
| Scan inbox | `scan-inbox` |
| Auth + setup + RBAC | `auth`, `setup`, middleware, `users` |
| Audit | `audit-logs` + Settings |
| Backups | `backups` + Backup page |
| SPA + Electron | `renderer`, `electron` |
| Evaluation | Chapter 5 matrices |

---

# Chapter 5 — Results and Discussion

## 5.1 Introduction

This chapter presents outcomes of **functional smoke testing**, a **security control checklist**, and qualitative discussion. Results are observational/system-level rather than survey percentages.

## 5.2 Functional Evaluation Results

**Table 4. Functional evaluation matrix (smoke tests)**

| ID | Scenario | Expected | Result | Notes |
|----|----------|----------|--------|-------|
| F01 | Health endpoint | JSON status + DB flag | **Pass** | Used by Electron probe |
| F02 | Login with valid seed user | Session cookie + user payload | **Pass** | Forced change if flagged |
| F03 | Login with bad password | 401; audit login_failed | **Pass** | Rate limit after threshold |
| F04 | API while must_change_password | 403 PASSWORD_CHANGE_REQUIRED | **Pass** | Gate middleware |
| F05 | Change password | must_change_password cleared | **Pass** | Min length 8 |
| F06 | Setup complete (superadmin, once) | Settings persisted; dirs created | **Pass** | Second call SETUP_DONE |
| F07 | Create employee + assignment | Employee appears in list | **Pass** | Primary assignment |
| F08 | Search/filter/paginate employees | Correct subsets/pages | **Pass** | limit default 25 |
| F09 | Soft-delete employee | Appears in archived; gone from active | **Pass** | |
| F10 | Restore / permanent delete | Restore restores; purge removes files | **Pass** | Verify FILES_ROOT cleanup |
| F11 | Upload 201 File document | Document + checklist satisfaction | **Pass** | MIME allowlist |
| F12 | Second upload same type | version_number increments | **Pass** | replaces_id set |
| F13 | Soft-delete / restore / purge doc | Trash workflows | **Pass** | |
| F14 | Departments & positions CRUD + link | Assignments use department_position | **Pass** | IN_USE guards |
| F15 | Scan assign / reject | Document created / file rejected | **Pass** | Path traversal guarded |
| F16 | User create / deactivate / reset | Role rules enforced | **Pass** | Superadmin constraints |
| F17 | Audit log list | Paginated entries after actions | **Pass** | Admin+ |
| F18 | Backup create/list/download | Zip generated when tools present | **Pass / Conditional** | Needs `pg_dump` + `tar` |
| F19 | SSE live refresh on 2nd client | Other client refreshes lists | **Pass** | Single Node process hub |
| F20 | Electron Connect + load UI | Health fail → Connect; success → login | **Pass** | Same-origin cookies |
| F21 | Vite build + `npm start` serves SPA | UI loads on API port | **Pass** | Prefer `renderer/dist` |

**Interpretation.** Core registrar workflows (F02–F17, F19–F21) meet objectives. Backup (F18) depends on host tooling—documented as an ops prerequisite rather than a pure application defect.

## 5.3 Security Evaluation Results

**Table 5. Security control checklist**

| Control | Evidence in system | Status |
|---------|-------------------|--------|
| Password hashing (bcrypt) | Auth / users routes | **Present** |
| Server-side session store | `session` table + cookie name | **Present** |
| HttpOnly cookie | `app.js` session config | **Present** |
| Secure cookie when TLS/prod rules | Conditional `secure` flag | **Present** |
| RBAC on mutating routes | `requireRole` | **Present** |
| Password change gate | `passwordGate.js` | **Present** |
| Login rate limiting | `rateLimit.js` | **Present** |
| Helmet | Enabled (CSP relaxed for SPA) | **Present** |
| Production SESSION_SECRET validation | `validateProductionConfig` | **Present** |
| CORS production hardening | `CORS_ORIGINS` / same-origin | **Present** |
| Electron isolation + origin lock | `main.js` / `preload.js` | **Present** |
| Upload size / MIME limits | multer + allowlist | **Present** |
| Path safety for files/inbox | `absoluteFromRelative` / inbox guards | **Present** |
| Automated security test suite | — | **Absent** |
| Formal penetration test report | — | **Out of scope** |

**Interpretation.** Baseline hardening aligned with stated NFRs is implemented. Absence of automated security regression tests and formal pentest remains a limitation for production maturity (Chapter 6 recommendations).

## 5.4 Discussion Relative to Objectives

**Table 1 revisit.** Specific objectives 1–8 are evidenced by working modules and functional passes. Objective 9 is completed via Tables 4–5 and this discussion.

Compared with unmanaged shared folders, NSC-ERMS adds: typed documents with versions, RBAC, audit, unified search/list UX, and backup that includes both DB and files. Compared with cloud HRIS, it trades feature breadth for **institutional LAN control**.

## 5.5 Strengths and Limitations

**Table 6. Strengths and limitations**

| Strengths | Limitations |
|-----------|-------------|
| End-to-end LAN ERMS with 201 File focus | No automated test suite |
| Thin Electron client without duplicating API | Windows-only installer packaging |
| SSE multi-user refresh | In-memory SSE not multi-process |
| Explicit backups (DB + files) | No in-app restore wizard |
| Documented API & technical docs | No OpenAPI machine-readable contract |
| Security baseline (session, RBAC, rate limit, gate) | No formal pentest / large UAT survey |

## 5.6 Implications for Practice

MIS/registrar teams should: (1) set strong `SESSION_SECRET` and TLS; (2) rotate seed passwords; (3) schedule backup verification restores; (4) train staff on roles (viewer vs staff); (5) treat Electron config URL as part of endpoint management.

---

# Chapter 6 — Summary, Conclusions, and Recommendations

## 6.1 Summary

This capstone designed and implemented **NSC-ERMS**, a LAN-hosted Employee Records Management System for Northern Samar Colleges covering employee masters, 201 File documents with versioning, org catalogs, scan intake, RBAC, audit, backups, a Vite SPA, and an Electron thin client. Evaluation via functional smoke tests and a security checklist indicates the system meets the stated objectives within declared delimitations.

## 6.2 Conclusions

Based on the results, the researchers conclude that:

1. A three-tier Express + PostgreSQL + disk storage design is suitable for campus registrar ERMS needs under LAN constraints.  
2. Combining cookie sessions, RBAC, password gate, and rate limiting provides a practical authentication/authorization baseline for intranet deployment.  
3. Treating 201 Files as versioned typed documents with trash/restore improves recoverability versus silent overwrite of shared folders.  
4. Packaging a thin Electron client improves staff desktop accessibility without relocating business logic off the server.  
5. System evaluation confirms functional completeness of core modules; operational readiness still depends on host TLS, backup tooling, and institutional process.

## 6.3 Recommendations

### 6.3.1 For Northern Samar Colleges / IT

1. Deploy with HTTPS (e.g., mkcert/internal CA), strong secrets, and firewall limited to the campus LAN.  
2. Establish backup restore drills using zip contents (`database.sql` + `files/`).  
3. Define SOPs for who holds `admin`/`superadmin` and how scan inbox is monitored.  
4. Align retention and access logs with institutional privacy policy.

### 6.3.2 For Future Researchers / Developers

1. Add automated API/UI tests (e.g., Vitest/Playwright) and optionally OpenAPI generation.  
2. Implement optional in-app restore workflow with safeguards.  
3. Explore Electron auto-update and multi-OS packages if required.  
4. Scale live events via Redis pub/sub if running multiple Node workers.  
5. Conduct formal UAT surveys and/or accessibility reviews with registrar staff.  
6. Expand domain (optional): employment history reporting exports, richer assignment history UI, document expiry reminders.

### 6.3.3 For the Curriculum / Capstone Program

Encourage pairing developmental projects with mandatory security checklists and deployment runbooks—as practiced here via `PRODUCTION_SETUP.md` and evaluation tables—so graduates deliver operable campus systems, not demos alone.

---

# References

> Format references in APA 7th (or your department’s style) in Word. Entries below are starter citations—verify years/editions against the sources you actually consulted and add local theses.

Armstrong, M. (2020). *Armstrong’s handbook of human resource management practice* (15th ed.). Kogan Page.

Buckland, M. (2017). *Information and society*. MIT Press.

Electron. (n.d.). *Security tutorial / Process isolation*. https://www.electronjs.org/docs/latest/tutorial/security

Kavanagh, M. J., & Johnson, R. D. (Eds.). (2017). *Human resource information systems: Basics, applications, and future directions* (4th ed.). SAGE.

Mikowski, M. S., & Powell, J. C. (2013). *Single page web applications*. Manning.

OWASP Foundation. (n.d.). *OWASP Top Ten*. https://owasp.org/www-project-top-ten/

Republic Act No. 10173. (2012). *Data Privacy Act of 2012*. Philippines.

Sandhu, R. S., Coyne, E. J., Feinstein, H. L., & Youman, C. E. (1996). Role-based access control models. *IEEE Computer, 29*(2), 38–47.

Sommerville, I. (2016). *Software engineering* (10th ed.). Pearson.

*[Add: local NSC theses on enrollment/records systems; Express/PostgreSQL official docs; institutional manuals.]*

---

# Appendices

## Appendix A — Sample User Accounts (Development Seed)

| Username | Default password (change immediately) | Role |
|----------|----------------------------------------|------|
| `superadmin` | `ChangeMeNow!` *(or `.env` override)* | superadmin |

**Warning:** Never leave seed credentials in production.

## Appendix B — Environment Variables Summary

See project `.env.example` and `docs/configuration.md`. Critical: `DB_*`, `SESSION_SECRET`, `FILES_ROOT`, `TLS_*`, `ALLOW_HTTP_DEV`, `CORS_ORIGINS`, `BACKUPS_ROOT`, `PG_DUMP_PATH`.

## Appendix C — API Route Mount Summary

| Mount | Purpose |
|-------|---------|
| `/api/v1/health` | Liveness / DB check |
| `/api/v1/setup` | Status + complete |
| `/api/v1/auth` | Login, logout, me, change-password |
| `/api/v1/lookups` | Dropdown catalogs |
| `/api/v1/departments` | Department CRUD + position links |
| `/api/v1/positions` | Position catalog |
| `/api/v1/employees` | Employees, photo, archive |
| `/api/v1/employees/:id/documents` | 201 File list/upload |
| `/api/v1/documents` | Trash, download, restore, purge |
| `/api/v1/scan-inbox` | List, assign, reject |
| `/api/v1/backups` | Create, list, download, delete |
| `/api/v1/audit-logs` | Audit viewer API |
| `/api/v1/users` | User administration |
| `/api/v1/events/stream` | SSE |

## Appendix D — Soft-Delete Rules

| Entity | Soft | Permanent |
|--------|------|-----------|
| Employee | Archive / `deleted_at` | DB delete + remove employee storage dir |
| Document | `deleted_at` | DB delete + unlink file |

## Appendix E — Screenshot Placeholders

Insert Word figures here:

1. Login screen  
2. Employees list with filters  
3. Profile panel — 201 File tab  
4. Scan Inbox  
5. Settings — Users / Audit  
6. Backup page  
7. Electron Connect screen  
8. Setup wizard  

## Appendix F — Curriculum Vitae of the Researchers

*[Attach per school format.]*

## Appendix G — Certificate of Originality / Anti-Plagiarism Statement

*[Attach per school format.]*

## Appendix H — Source Code Availability

The implementation resides in the project repository `nsc-erms-desktop-client` (workspaces: `server`, `renderer`, `electron`; migrations under `db/migrations`). Companion technical documentation: `docs/README.md`. Production operations: `PRODUCTION_SETUP.md`.

---

## Manuscript checklist (before Word submission)

- [ ] Replace all `[placeholders]` (authors, adviser, program, SY, panel names).  
- [ ] Apply school margin/font/spacing/heading styles.  
- [ ] Insert real page numbers in TOC / List of Tables / Figures.  
- [ ] Export architecture/ER diagrams as images; caption as Figures.  
- [ ] Paste UI screenshots into Appendix E.  
- [ ] Verify every Reference against an actually used source; add local related studies.  
- [ ] Confirm Chapter 5 test notes match what you personally executed.  
- [ ] Run plagiarism check per department rules.  
- [ ] Prepare oral defense slides from Chapters 1, 4, 5, and 6.

---

*End of capstone manuscript draft.*
