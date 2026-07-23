# Official CS Form templates

| File | Source |
|------|--------|
| `CS-Form-212-Revised-2025.xlsx` | CSC Annex H-1 — CS Form No. 212 (Revised 2025) Personal Data Sheet |

Keep this folder deployed with the API server. The fill endpoint reads the template from disk and writes employee PDS data into it for download.

Do not replace with unofficial “fixed” third-party copies unless you intentionally update the cell mapping in `server/src/services/pdsExcel.js`.
