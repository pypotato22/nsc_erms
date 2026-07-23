# Official CS Form templates

| File | Source |
|------|--------|
| `CS-Form-212-Revised-2025.xlsx` | CSC Annex H-1 — CS Form No. 212 (Revised 2025) Personal Data Sheet |

Keep this folder deployed with the API server. The fill endpoint reads the template from disk and writes employee PDS data into it for download.

## PDF preview (Excel → PDF)

`GET /api/v1/employees/:id/pds-pdf` fills the Excel template, then converts to PDF.

Install **one** of these on the API server:

1. **LibreOffice** (recommended) — ensures `soffice` is on PATH, or set `SOFFICE_PATH` to `soffice.exe`
2. **Microsoft Excel** (Windows only) — used via COM if LibreOffice is not found

Without either tool, View PDS falls back to the HTML layout preview; Excel download still works.

Do not replace the template with unofficial “fixed” third-party copies unless you intentionally update the cell mapping in `server/src/services/pdsExcel.js`.
