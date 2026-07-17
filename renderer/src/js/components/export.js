import { listEmployees } from '../api/employees.js';
import { ApiError } from '../api/client.js';
import { getEl, getToday, escapeHtml } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';

export function initExport() {
  getEl('export-csv-btn').addEventListener('click', () => {
    exportToCSV().catch((err) => {
      showToast(err instanceof ApiError ? err.message : 'Export failed.', 'error');
    });
  });
  getEl('export-pdf-btn').addEventListener('click', () => {
    exportToPDF().catch((err) => {
      showToast(err instanceof ApiError ? err.message : 'Export failed.', 'error');
    });
  });
}

async function exportToCSV() {
  const { employees } = await listEmployees({ all: true });
  const headers = [
    'Employee No',
    'First Name',
    'Last Name',
    'Email',
    'Contact',
    'Address',
    'Position',
    'Department',
    'Status',
    'Start Date',
  ];
  const rows = employees.map((e) => [
    e.employeeNo,
    e.firstName,
    e.lastName,
    e.email,
    e.contactNumber,
    e.address,
    e.assignment?.positionName,
    e.assignment?.departmentName,
    e.assignment?.employmentStatusName,
    e.assignment?.startDate,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `NSC-ERMS_${getToday()}.csv`;
  a.click();
  showToast('CSV exported.', 'success');
}

async function exportToPDF() {
  const { employees } = await listEmployees({ all: true });
  const rows = employees
    .map(
      (e) =>
        `<tr><td>${escapeHtml(e.firstName)} ${escapeHtml(e.lastName)}</td><td>${escapeHtml(e.email)}</td><td>${escapeHtml(e.assignment?.positionName ?? '—')}</td><td>${escapeHtml(e.assignment?.departmentName ?? '—')}</td><td>${escapeHtml(e.assignment?.employmentStatusName ?? '—')}</td><td>${escapeHtml(e.assignment?.startDate ? String(e.assignment.startDate).slice(0, 10) : '—')}</td></tr>`,
    )
    .join('');
  getEl('print-area').innerHTML = `
    <style>
      @page{size:A4;margin:18mm;}
      body{font-family:'DM Sans',Arial;font-size:10pt;}
      h2{color:#062b6e;border-bottom:3px solid #062b6e;padding-bottom:8px;margin-bottom:14px;letter-spacing:-.5px;}
      table{width:100%;border-collapse:collapse;}
      th{background:#062b6e;color:#fff;padding:8px 10px;text-align:left;font-size:9pt;}
      td{padding:7px 10px;border-bottom:1px solid #e2e8f0;}
      tr:nth-child(even) td{background:#f8fafc;}
    </style>
    <h2>NSC-ERMS — Employee Report</h2>
    <p style="color:#4b5875;font-size:9pt;">Generated: ${new Date().toLocaleString('en-PH')} · ${employees.length} employee(s)</p>
    <table style="margin-top:14px">
      <thead><tr><th>Name</th><th>Email</th><th>Position</th><th>Department</th><th>Status</th><th>Start Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  window.print();
}
