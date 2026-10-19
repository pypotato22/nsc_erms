import { api } from './client.js';

export function listScanInbox() {
  return api('/scan-inbox');
}

export function assignScanInboxFile(fileName, payload) {
  return api(`/scan-inbox/${encodeURIComponent(fileName)}/assign`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function rejectScanInboxFile(fileName, reason) {
  return api(`/scan-inbox/${encodeURIComponent(fileName)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function renameScanInboxFile(fileName, newName) {
  return api(`/scan-inbox/${encodeURIComponent(fileName)}/rename`, {
    method: 'POST',
    body: JSON.stringify({ newName }),
  });
}

/** URL that streams an inbox file (inline for preview, or as a download). */
export function scanInboxFileUrl(fileName, { download = false, version = '' } = {}) {
  const qs = new URLSearchParams();
  if (download) qs.set('download', '1');
  if (version) qs.set('v', String(version));
  const q = qs.toString();
  return `/api/v1/scan-inbox/${encodeURIComponent(fileName)}/file${q ? `?${q}` : ''}`;
}
