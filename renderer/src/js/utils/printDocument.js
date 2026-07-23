import { downloadDocumentUrl } from '../api/documents.js';
import { escapeHtml } from './helpers.js';
import { showToast } from './toast.js';

function isDesktopApp() {
  return Boolean(window.nscDesktop?.isDesktop);
}

/**
 * Open the system print dialog for a stored document (PDF / image).
 * Word files cannot be printed in-browser — shows a toast instead.
 *
 * On Electron, shows a large document preview first; the user clicks
 * "Proceed to print" to open the OS print dialog.
 */
export async function printDocument(docId, mimeType = '', fileName = '') {
  const isPdf = mimeType === 'application/pdf' || /\.pdf$/i.test(fileName);
  const isImage =
    mimeType.startsWith('image/') || /\.(jpe?g|png)$/i.test(fileName);

  if (!isPdf && !isImage) {
    showToast('Download the file and print it from Word or another app.', 'info');
    return;
  }

  const res = await fetch(downloadDocumentUrl(docId), { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load file for printing.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const kind = isPdf ? 'pdf' : 'image';

  if (isDesktopApp()) {
    await showPrintPreview({ url, kind, fileName });
    return;
  }

  openSystemPrint(url, kind, fileName);
}

/**
 * Large in-app preview → user confirms → system print dialog.
 */
function showPrintPreview({ url, kind, fileName }) {
  return new Promise((resolve) => {
    document.getElementById('print-preview-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'print-preview-overlay';
    overlay.className = 'overlay open print-preview-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Document print preview');

    const title = escapeHtml(fileName || 'Document');
    const media =
      kind === 'pdf'
        ? `<iframe class="print-preview-frame" src="${url}" title="Document preview"></iframe>`
        : `<div class="print-preview-image-wrap"><img src="${url}" alt="${title}" /></div>`;

    overlay.innerHTML = `
      <div class="modal print-preview-modal">
        <button type="button" class="modal-close" data-pp-close aria-label="Close">×</button>
        <div class="print-preview-top">
          <h3>Print preview</h3>
          <p class="print-preview-filename">${title}</p>
        </div>
        <div class="print-preview-stage">${media}</div>
        <div class="modal-actions print-preview-actions">
          <button type="button" class="btn btn-cancel" data-pp-close>Cancel</button>
          <button type="button" class="btn btn-primary" data-pp-proceed>Proceed to print</button>
        </div>
      </div>
    `;

    let settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      resolve();
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') finish();
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish();
    });
    overlay.querySelectorAll('[data-pp-close]').forEach((btn) => {
      btn.addEventListener('click', finish);
    });
    overlay.querySelector('[data-pp-proceed]').addEventListener('click', () => {
      openSystemPrint(url, kind, fileName);
      // Keep preview open until user closes it, or close after launching print:
      finish();
    });

    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
  });
}

function openSystemPrint(url, kind, fileName) {
  if (kind === 'image') {
    printImage(url, fileName);
    return;
  }
  printPdf(url);
}

function printImage(url, fileName) {
  const w = window.open('', '_blank');
  if (!w) {
    showToast('Allow pop-ups to print documents.', 'error');
    return;
  }
  w.document.write(
    `<!DOCTYPE html><html><head><title>Print</title>
      <style>html,body{margin:0;padding:0}img{display:block;max-width:100%;margin:0 auto}</style>
      </head><body></body></html>`,
  );
  w.document.close();
  const img = w.document.createElement('img');
  img.src = url;
  img.alt = fileName || 'Document';
  img.onload = () => {
    w.focus();
    w.print();
  };
  w.onafterprint = () => w.close();
  w.document.body.appendChild(img);
}

function printPdf(url) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  iframe.src = url;
  document.body.appendChild(iframe);

  let printed = false;
  const cleanup = () => {
    iframe.remove();
  };
  const doPrint = () => {
    if (printed) return;
    printed = true;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      window.open(url, '_blank');
    }
    setTimeout(cleanup, 60_000);
  };

  iframe.onload = doPrint;
  setTimeout(doPrint, 800);
}
