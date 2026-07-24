import {
  getEmployee,
  downloadPdsExcelUrl,
  downloadPdsPdfUrl,
} from '../api/employees.js';
import { ApiError } from '../api/client.js';
import { getEl } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { buildCs212Html } from '../utils/pdsFormHtml.js';

let _employee = null;
/** @type {string | null} */
let _pdfObjectUrl = null;
/** @type {'pdf' | 'html'} */
let _previewMode = 'html';

export function initPdsViewer() {
  getEl('pds-view-close')?.addEventListener('click', closePdsViewer);
  getEl('pds-view-cancel')?.addEventListener('click', closePdsViewer);
  getEl('pds-view-print')?.addEventListener('click', () => {
    if (!_employee) return;
    if (_previewMode === 'pdf' && _pdfObjectUrl) {
      printPdfPreview(_pdfObjectUrl);
      return;
    }
    printPds(_employee);
  });
  getEl('pds-view-download-excel')?.addEventListener('click', () => {
    if (!_employee?.id) return;
    downloadOfficialPdsExcel(_employee.id);
  });
  getEl('pds-view-download-pdf')?.addEventListener('click', () => {
    if (!_employee?.id) return;
    downloadOfficialPdsPdf(_employee.id);
  });
  getEl('pds-view-overlay')?.addEventListener('click', (e) => {
    if (e.target === getEl('pds-view-overlay')) closePdsViewer();
  });
}

export async function openPdsViewer(employeeOrId) {
  try {
    let employee = employeeOrId;
    if (typeof employeeOrId === 'string' || typeof employeeOrId === 'number') {
      const res = await getEmployee(employeeOrId);
      employee = res.employee;
    } else if (employeeOrId?.id && !employeeOrId.pds) {
      const res = await getEmployee(employeeOrId.id);
      employee = res.employee;
    }
    _employee = employee;
    const name = [employee.firstName, employee.middleName, employee.lastName, employee.nameExtension]
      .filter(Boolean)
      .join(' ');
    getEl('pds-view-title').textContent = `PDS — ${name || 'Employee'}`;
    getEl('pds-view-overlay').classList.add('open');

    const body = getEl('pds-view-body');
    body.innerHTML =
      '<div class="pds-view-loading">Generating official PDF from CS Form 212 Excel…</div>';
    setPdfActionsVisible(false);

    const pdfOk = await tryLoadOfficialPdf(employee.id);
    if (!pdfOk) {
      _previewMode = 'html';
      body.innerHTML = `
        <div class="pds-view-banner">
          Official PDF preview needs <strong>LibreOffice</strong> or <strong>Microsoft Excel</strong> on the API server.
          Showing HTML layout preview instead. Use <strong>Download official Excel</strong> for the CSC file.
        </div>
        ${buildCs212Html(employee, { forPrint: false })}`;
      getEl('pds-view-print').textContent = 'Print HTML preview';
    }
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : 'Could not open PDS.', 'error');
  }
}

async function tryLoadOfficialPdf(employeeId) {
  clearPdfObjectUrl();
  try {
    const res = await fetch(downloadPdsPdfUrl(employeeId), { credentials: 'include' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.error?.code === 'MISSING_TOOL') {
        return false;
      }
      throw new ApiError(
        res.status,
        data?.error?.code || 'ERROR',
        data?.error?.message || 'PDF generation failed',
      );
    }
    const blob = await res.blob();
    _pdfObjectUrl = URL.createObjectURL(blob);
    _previewMode = 'pdf';
    getEl('pds-view-body').innerHTML = `
      <iframe class="pds-pdf-frame" title="Official PDS PDF" src="${_pdfObjectUrl}"></iframe>`;
    setPdfActionsVisible(true);
    getEl('pds-view-print').textContent = 'Print PDF';
    return true;
  } catch (err) {
    if (err instanceof ApiError && (err.code === 'MISSING_TOOL' || err.status === 503)) {
      return false;
    }
    console.warn('PDS PDF preview failed:', err);
    showToast(
      err instanceof ApiError ? err.message : 'Official PDF unavailable; showing HTML preview.',
      'info',
    );
    return false;
  }
}

function setPdfActionsVisible(visible) {
  const btn = getEl('pds-view-download-pdf');
  if (btn) btn.hidden = !visible;
}

export function closePdsViewer() {
  getEl('pds-view-overlay')?.classList.remove('open');
  _employee = null;
  _previewMode = 'html';
  clearPdfObjectUrl();
  setPdfActionsVisible(false);
}

function clearPdfObjectUrl() {
  if (_pdfObjectUrl) {
    URL.revokeObjectURL(_pdfObjectUrl);
    _pdfObjectUrl = null;
  }
}

export function printPds(employee) {
  const area = getEl('print-area');
  if (!area) return;
  area.innerHTML = buildCs212Html(employee, { forPrint: true });

  const cleanup = () => {
    area.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  const imgs = [...area.querySelectorAll('img')];
  const ready = imgs.length
    ? Promise.all(
        imgs.map(
          (img) =>
            img.complete
              ? Promise.resolve()
              : new Promise((resolve) => {
                  img.onload = () => resolve();
                  img.onerror = () => resolve();
                }),
        ),
      )
    : Promise.resolve();

  ready.then(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
      }, 100);
    });
  });
}

function printPdfPreview(objectUrl) {
  // Hidden iframe — avoids Electron opening a new BrowserWindow via window.open
  const existing = document.getElementById('pds-print-frame');
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'pds-print-frame';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = 'PDS print';
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  iframe.src = objectUrl;
  document.body.appendChild(iframe);

  let printed = false;
  const cleanup = () => {
    setTimeout(() => iframe.remove(), 60_000);
  };
  const doPrint = () => {
    if (printed) return;
    printed = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      showToast('Could not open print dialog for PDF.', 'error');
    }
    cleanup();
  };

  iframe.onload = () => setTimeout(doPrint, 250);
  setTimeout(doPrint, 1200);
}

/** Download filled official CS Form 212 Excel (Annex H-1). */
export function downloadOfficialPdsExcel(employeeId) {
  const a = document.createElement('a');
  a.href = downloadPdsExcelUrl(employeeId);
  a.download = '';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Downloading official PDS Excel…', 'info');
}

export function downloadOfficialPdsPdf(employeeId) {
  const a = document.createElement('a');
  a.href = downloadPdsPdfUrl(employeeId);
  a.download = '';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Downloading official PDS PDF…', 'info');
}
