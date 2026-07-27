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
/** Bumps on each open/close so stale PDF responses are ignored. */
let _loadSeq = 0;
/** @type {AbortController | null} */
let _pdfAbort = null;
/** @type {(() => object) | null} */
let _getPrefs = null;
/** @type {Promise<'pdf' | 'html'> | null} */
let _pdfLoadPromise = null;
/** @type {((outcome: 'pdf' | 'html') => void) | null} */
let _pdfLoadResolve = null;

function isHtmlPrintPreviewEnabled() {
  return _getPrefs?.().pdsHtmlPrintPreview !== false;
}

export function initPdsViewer(getPrefs) {
  if (typeof getPrefs === 'function') _getPrefs = getPrefs;

  getEl('pds-view-close')?.addEventListener('click', closePdsViewer);
  getEl('pds-view-cancel')?.addEventListener('click', closePdsViewer);
  getEl('pds-view-print')?.addEventListener('click', () => {
    void handlePrintClick();
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

async function handlePrintClick() {
  if (!_employee) return;

  if (_previewMode === 'pdf' && _pdfObjectUrl) {
    printPdfPreview(_pdfObjectUrl);
    return;
  }

  if (!isHtmlPrintPreviewEnabled()) {
    const printBtn = getEl('pds-view-print');
    if (printBtn) printBtn.disabled = true;
    try {
      const outcome = await waitForPdfLoad();
      if (outcome === 'pdf' && _pdfObjectUrl) {
        printPdfPreview(_pdfObjectUrl);
        return;
      }
      showToast(
        'Official PDF is not available. Enable HTML print preview in Settings or use Download Excel.',
        'error',
      );
    } finally {
      updatePrintButton();
    }
    return;
  }

  printPds(_employee);
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

    setPdfActionsVisible(false);

    // Always show the HTML preview immediately for fast open.
    showHtmlPreview(employee, {
      status: 'loading',
      message:
        'Showing layout preview. Generating official PDF from CS Form 212 Excel…',
    });
    updatePrintButton();
    void loadOfficialPdfInBackground(employee.id);
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : 'Could not open PDS.', 'error');
  }
}

/**
 * @param {object} employee
 * @param {{ status?: 'loading'|'error'|'info', message?: string } | null} [banner]
 */
function showHtmlPreview(employee, banner = null) {
  _previewMode = 'html';
  const body = getEl('pds-view-body');
  if (!body) return;
  const bannerHtml = banner?.message ? renderStatusBanner(banner.status || 'info', banner.message) : '';
  body.innerHTML = `${bannerHtml}${buildCs212Html(employee, { forPrint: false })}`;
}

/**
 * @param {'loading'|'error'|'info'} status
 * @param {string} message
 */
function updateStatusBanner(status, message) {
  const body = getEl('pds-view-body');
  if (!body || _previewMode !== 'html') return;
  let el = body.querySelector('[data-pds-status]');
  if (!el) {
    el = document.createElement('div');
    el.setAttribute('data-pds-status', '');
    body.prepend(el);
  }
  el.outerHTML = renderStatusBanner(status, message);
}

function renderStatusBanner(status, message) {
  const loading = status === 'loading';
  return `<div class="pds-view-banner${loading ? ' pds-view-banner-loading' : ''}" data-pds-status>${
    loading ? '<span class="pds-inline-spinner" aria-hidden="true"></span>' : ''
  }<span>${message}</span></div>`;
}

function beginPdfLoad() {
  _pdfLoadPromise = new Promise((resolve) => {
    _pdfLoadResolve = resolve;
  });
}

function finishPdfLoad(outcome) {
  _pdfLoadResolve?.(outcome);
  _pdfLoadResolve = null;
}

function waitForPdfLoad() {
  return _pdfLoadPromise || Promise.resolve(_previewMode === 'pdf' ? 'pdf' : 'html');
}

/**
 * @returns {Promise<'pdf' | 'html'>}
 */
async function loadOfficialPdfInBackground(employeeId) {
  cancelPdfLoad();
  beginPdfLoad();
  const seq = ++_loadSeq;
  const abort = new AbortController();
  _pdfAbort = abort;
  clearPdfObjectUrl();

  try {
    const res = await fetch(downloadPdsPdfUrl(employeeId), {
      credentials: 'include',
      signal: abort.signal,
    });
    if (seq !== _loadSeq) return 'html';

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.error?.code === 'MISSING_TOOL') {
        return handlePdfUnavailable(
          seq,
          'Official PDF needs Microsoft Excel (Windows, preferred) or LibreOffice on the API server. Showing HTML layout preview. Use Download Excel for the CSC file.',
        );
      }
      throw new ApiError(
        res.status,
        data?.error?.code || 'ERROR',
        data?.error?.message || 'PDF generation failed',
      );
    }

    const blob = await res.blob();
    if (seq !== _loadSeq) return 'html';

    clearPdfObjectUrl();
    _pdfObjectUrl = URL.createObjectURL(blob);
    _previewMode = 'pdf';
    getEl('pds-view-body').innerHTML = `
      <iframe class="pds-pdf-frame" title="Official PDS PDF" src="${_pdfObjectUrl}"></iframe>`;
    setPdfActionsVisible(true);
    updatePrintButton();
    finishPdfLoad('pdf');
    return 'pdf';
  } catch (err) {
    if (err?.name === 'AbortError' || seq !== _loadSeq) return 'html';
    if (err instanceof ApiError && (err.code === 'MISSING_TOOL' || err.status === 503)) {
      return handlePdfUnavailable(
        seq,
        'Official PDF needs Microsoft Excel (Windows, preferred) or LibreOffice on the API server. Showing HTML layout preview. Use Download Excel for the CSC file.',
      );
    }
    console.warn('PDS PDF preview failed:', err);
    return handlePdfUnavailable(
      seq,
      'Official PDF unavailable — showing HTML layout preview. You can still Download Excel.',
      err instanceof ApiError ? err.message : 'Official PDF unavailable; showing HTML preview.',
    );
  }
}

/**
 * @param {number} seq
 * @param {string} bannerMessage
 * @param {string} [toastMessage]
 * @returns {'html'}
 */
function handlePdfUnavailable(seq, bannerMessage, toastMessage) {
  if (seq !== _loadSeq) return 'html';
  if (isHtmlPrintPreviewEnabled() && _employee) {
    updateStatusBanner('info', bannerMessage);
  } else if (_employee) {
    showHtmlPreview(_employee, { status: 'info', message: bannerMessage });
  }
  updatePrintButton();
  finishPdfLoad('html');
  if (toastMessage) showToast(toastMessage, 'info');
  return 'html';
}

function cancelPdfLoad() {
  if (_pdfAbort) {
    _pdfAbort.abort();
    _pdfAbort = null;
  }
}

function updatePrintButton() {
  const btn = getEl('pds-view-print');
  if (!btn) return;

  if (_previewMode === 'pdf' && _pdfObjectUrl) {
    btn.textContent = 'Print PDF';
    btn.disabled = false;
    return;
  }

  if (!isHtmlPrintPreviewEnabled()) {
    btn.textContent = 'Print';
    btn.disabled = true;
    return;
  }

  btn.textContent = 'Print HTML preview';
  btn.disabled = false;
}

function setPdfActionsVisible(visible) {
  const btn = getEl('pds-view-download-pdf');
  if (btn) btn.hidden = !visible;
}

export function closePdsViewer() {
  _loadSeq += 1;
  cancelPdfLoad();
  finishPdfLoad('html');
  _pdfLoadPromise = null;
  getEl('pds-view-overlay')?.classList.remove('open');
  _employee = null;
  _previewMode = 'html';
  clearPdfObjectUrl();
  setPdfActionsVisible(false);
  const printBtn = getEl('pds-view-print');
  if (printBtn) printBtn.disabled = false;
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
  document.body.classList.add('printing-pds');

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    area.innerHTML = '';
    document.body.classList.remove('printing-pds');
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
        setTimeout(cleanup, 1500);
      }, 100);
    });
  });
}

function printPdfPreview(objectUrl) {
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
