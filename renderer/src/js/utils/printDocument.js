import { downloadDocumentUrl } from '../api/documents.js';
import { showToast } from './toast.js';

/**
 * Open the system print dialog for a stored document (PDF / image).
 * Word files cannot be printed in-browser — shows a toast instead.
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

  if (isImage) {
    const w = window.open('', '_blank');
    if (!w) {
      URL.revokeObjectURL(url);
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
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  iframe.src = url;
  document.body.appendChild(iframe);

  let printed = false;
  const cleanup = () => {
    iframe.remove();
    URL.revokeObjectURL(url);
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
  // PDF plugins often skip iframe onload
  setTimeout(doPrint, 800);
}
