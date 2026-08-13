import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getEmployee,
  downloadPdsExcelUrl,
  downloadPdsPdfUrl,
} from '../../js/api/employees.js';
import { ApiError } from '../../js/api/client.js';
import { showToast } from '../../js/utils/toast.js';
import { buildCs212Html } from '../../js/utils/pdsFormHtml.js';

function employeeDisplayName(employee) {
  return [employee?.firstName, employee?.middleName, employee?.lastName, employee?.nameExtension]
    .filter(Boolean)
    .join(' ');
}

export function printHtmlPds(employee) {
  const area = document.getElementById('print-area');
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
        imgs.map((img) =>
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

/**
 * Modal contents for #pds-view-overlay (host toggles .open).
 */
export function PdsViewer({ open, employeeOrId, getPrefs, onClose, registerApi }) {
  const [employee, setEmployee] = useState(null);
  const [previewMode, setPreviewMode] = useState('html');
  const [pdfUrl, setPdfUrl] = useState(null);
  const [banner, setBanner] = useState(null);
  const [printBusy, setPrintBusy] = useState(false);
  const loadSeq = useRef(0);
  const abortRef = useRef(null);
  const pdfResolveRef = useRef(null);
  const pdfPromiseRef = useRef(null);
  const previewModeRef = useRef('html');
  const pdfUrlRef = useRef(null);
  const openToken = useRef(0);

  previewModeRef.current = previewMode;
  pdfUrlRef.current = pdfUrl;

  const htmlPrintEnabled = getPrefs?.()?.pdsHtmlPrintPreview !== false;

  const clearPdf = useCallback(() => {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    setPdfUrl(null);
    pdfUrlRef.current = null;
  }, []);

  const cancelPdfLoad = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const beginPdfLoad = useCallback(() => {
    pdfPromiseRef.current = new Promise((resolve) => {
      pdfResolveRef.current = resolve;
    });
  }, []);

  const finishPdfLoad = useCallback((outcome) => {
    pdfResolveRef.current?.(outcome);
    pdfResolveRef.current = null;
  }, []);

  const waitForPdfLoad = useCallback(
    () => pdfPromiseRef.current || Promise.resolve(previewModeRef.current === 'pdf' ? 'pdf' : 'html'),
    [],
  );

  const loadOfficialPdf = useCallback(
    async (employeeId) => {
      cancelPdfLoad();
      beginPdfLoad();
      const seq = ++loadSeq.current;
      const abort = new AbortController();
      abortRef.current = abort;
      clearPdf();

      const unavailable = (bannerMessage, toastMessage) => {
        if (seq !== loadSeq.current) return 'html';
        setBanner({ status: 'info', message: bannerMessage });
        setPreviewMode('html');
        finishPdfLoad('html');
        if (toastMessage) showToast(toastMessage, 'info');
        return 'html';
      };

      try {
        const res = await fetch(downloadPdsPdfUrl(employeeId), {
          credentials: 'include',
          signal: abort.signal,
        });
        if (seq !== loadSeq.current) return 'html';

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data?.error?.code === 'MISSING_TOOL') {
            return unavailable(
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
        if (seq !== loadSeq.current) return 'html';

        clearPdf();
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
        pdfUrlRef.current = url;
        setPreviewMode('pdf');
        setBanner(null);
        finishPdfLoad('pdf');
        return 'pdf';
      } catch (err) {
        if (err?.name === 'AbortError' || seq !== loadSeq.current) return 'html';
        if (err instanceof ApiError && (err.code === 'MISSING_TOOL' || err.status === 503)) {
          return unavailable(
            'Official PDF needs Microsoft Excel (Windows, preferred) or LibreOffice on the API server. Showing HTML layout preview. Use Download Excel for the CSC file.',
          );
        }
        console.warn('PDS PDF preview failed:', err);
        return unavailable(
          'Official PDF unavailable — showing HTML layout preview. You can still Download Excel.',
          err instanceof ApiError ? err.message : 'Official PDF unavailable; showing HTML preview.',
        );
      }
    },
    [beginPdfLoad, cancelPdfLoad, clearPdf, finishPdfLoad],
  );

  useEffect(() => {
    if (!open || employeeOrId == null) return;
    const token = ++openToken.current;
    (async () => {
      try {
        let emp = employeeOrId;
        if (typeof employeeOrId === 'string' || typeof employeeOrId === 'number') {
          const res = await getEmployee(employeeOrId);
          emp = res.employee;
        } else if (employeeOrId?.id && !employeeOrId.pds) {
          const res = await getEmployee(employeeOrId.id);
          emp = res.employee;
        }
        if (token !== openToken.current) return;
        setEmployee(emp);
        setPreviewMode('html');
        setBanner({
          status: 'loading',
          message: 'Showing layout preview. Generating official PDF from CS Form 212 Excel…',
        });
        clearPdf();
        void loadOfficialPdf(emp.id);
      } catch (err) {
        if (token !== openToken.current) return;
        showToast(err instanceof ApiError ? err.message : 'Could not open PDS.', 'error');
        onClose();
      }
    })();
  }, [open, employeeOrId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) return;
    loadSeq.current += 1;
    openToken.current += 1;
    cancelPdfLoad();
    finishPdfLoad('html');
    pdfPromiseRef.current = null;
    setEmployee(null);
    setPreviewMode('html');
    setBanner(null);
    setPrintBusy(false);
    clearPdf();
  }, [open, cancelPdfLoad, clearPdf, finishPdfLoad]);

  useEffect(() => {
    registerApi?.({
      printPds: printHtmlPds,
      downloadExcel: downloadOfficialPdsExcel,
      downloadPdf: downloadOfficialPdsPdf,
    });
    return () => registerApi?.(null);
  }, [registerApi]);

  async function handlePrint() {
    if (!employee) return;
    if (previewMode === 'pdf' && pdfUrl) {
      printPdfPreview(pdfUrl);
      return;
    }
    if (!htmlPrintEnabled) {
      setPrintBusy(true);
      try {
        const outcome = await waitForPdfLoad();
        if (outcome === 'pdf' && pdfUrlRef.current) {
          printPdfPreview(pdfUrlRef.current);
          return;
        }
        showToast(
          'Official PDF is not available. Enable HTML print preview in Settings or use Download Excel.',
          'error',
        );
      } finally {
        setPrintBusy(false);
      }
      return;
    }
    printHtmlPds(employee);
  }

  if (!open) return null;

  const title = `PDS — ${employeeDisplayName(employee) || 'Employee'}`;
  const printLabel =
    previewMode === 'pdf' && pdfUrl
      ? 'Print PDF'
      : htmlPrintEnabled
        ? 'Print HTML preview'
        : 'Print';
  const printDisabled = printBusy || (previewMode !== 'pdf' && !htmlPrintEnabled);

  return (
    <div className="modal pds-view-modal">
      <button
        id="pds-view-close"
        className="modal-close"
        type="button"
        aria-label="Close"
        onClick={onClose}
      >
        ×
      </button>
      <div className="pds-view-top">
        <div>
          <p className="pds-form-eyebrow">CS Form No. 212 · Revised 2025</p>
          <h3 id="pds-view-title">{title}</h3>
        </div>
      </div>
      <div id="pds-view-body" className="pds-view-body">
        {previewMode === 'pdf' && pdfUrl ? (
          <iframe className="pds-pdf-frame" title="Official PDS PDF" src={pdfUrl} />
        ) : (
          <>
            {banner?.message && (
              <div
                className={`pds-view-banner${banner.status === 'loading' ? ' pds-view-banner-loading' : ''}`}
                data-pds-status=""
              >
                {banner.status === 'loading' && (
                  <span className="pds-inline-spinner" aria-hidden="true" />
                )}
                <span>{banner.message}</span>
              </div>
            )}
            {employee && (
              <div
                dangerouslySetInnerHTML={{
                  __html: buildCs212Html(employee, { forPrint: false }),
                }}
              />
            )}
          </>
        )}
      </div>
      <div className="modal-actions pds-view-actions">
        <button id="pds-view-cancel" className="btn btn-cancel" type="button" onClick={onClose}>
          Close
        </button>
        <div className="pds-nav-btns">
          <button
            id="pds-view-download-excel"
            className="btn btn-cancel"
            type="button"
            onClick={() => employee?.id && downloadOfficialPdsExcel(employee.id)}
          >
            Download Excel
          </button>
          <button
            id="pds-view-download-pdf"
            className="btn btn-cancel"
            type="button"
            hidden={!(previewMode === 'pdf' && pdfUrl)}
            onClick={() => employee?.id && downloadOfficialPdsPdf(employee.id)}
          >
            Download PDF
          </button>
          <button
            id="pds-view-print"
            className="btn btn-primary"
            type="button"
            disabled={printDisabled}
            onClick={() => void handlePrint()}
          >
            {printLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
