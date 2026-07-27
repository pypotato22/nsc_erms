# Official CS Form templates

| File | Source |
|------|--------|
| `CS-Form-212-Revised-2025.xlsx` | CSC Annex H-1 — CS Form No. 212 (Revised 2025) Personal Data Sheet |

Keep this folder deployed with the API server. The fill endpoint reads the template from disk and writes employee PDS data into it for download.

Cell mapping lives in `server/src/services/pdsExcel.js` (C1–C4). Form checkboxes (C1 sex/civil/citizenship, C4 Yes/No) are applied in `server/src/services/pdsExcelCheckboxes.js` by grafting filled cells into the intact template. After mapping changes, run:

```bash
npm run verify:pds-excel       # Filipino / Male / Married + all-No C4
npm run verify:pds-excel-yes   # Yes + details + date/status + PDF
npm run verify:pds-excel-dual  # Dual citizen + Other civil status + VML asserts
```

Sample outputs land in `tmp/`.

## PDF preview (Excel → PDF)

`GET /api/v1/employees/:id/pds-pdf` fills the Excel template, then converts to PDF.

Install **one** of these on the API server:

1. **Microsoft Excel** (Windows) — preferred. Used via COM first so CSC form checkboxes render correctly in the PDF.
2. **LibreOffice** — fallback when Excel is unavailable; set `SOFFICE_PATH` if `soffice` is not on PATH. LibreOffice may omit ActiveX/form checkbox ticks.

Without either tool, View PDS falls back to the HTML layout preview; Excel download still works.

Do not replace the template with unofficial “fixed” third-party copies unless you intentionally update the cell mapping in `server/src/services/pdsExcel.js`.
