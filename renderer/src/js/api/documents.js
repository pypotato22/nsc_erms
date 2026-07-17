import { api } from './client.js';

export function listDocumentTypes() {
  return api('/lookups/document-types');
}

export function listEmployeeDocuments(employeeId) {
  return api(`/employees/${employeeId}/documents`);
}

export async function uploadEmployeeDocument(
  employeeId,
  { file, documentTypeId, displayName, remarks, issuedDate, expiryDate },
) {
  const form = new FormData();
  form.append('file', file);
  form.append('documentTypeId', documentTypeId);
  if (displayName) form.append('displayName', displayName);
  if (remarks) form.append('remarks', remarks);
  if (issuedDate) form.append('issuedDate', issuedDate);
  if (expiryDate) form.append('expiryDate', expiryDate);

  const res = await fetch(`/api/v1/employees/${employeeId}/documents`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Upload failed');
    err.status = res.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

export function deleteDocument(documentId) {
  return api(`/documents/${documentId}`, { method: 'DELETE' });
}

export function restoreDocument(documentId) {
  return api(`/documents/${documentId}/restore`, { method: 'POST', body: '{}' });
}

export function listTrashDocuments() {
  return api('/documents/trash');
}

export function permanentDeleteDocument(documentId) {
  return api(`/documents/${documentId}/permanent`, { method: 'DELETE' });
}

export function downloadDocumentUrl(documentId) {
  return `/api/v1/documents/${documentId}/download`;
}

export async function uploadEmployeePhoto(employeeId, file) {
  const form = new FormData();
  form.append('photo', file);
  const res = await fetch(`/api/v1/employees/${employeeId}/photo`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Photo upload failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

export function employeePhotoUrl(employeeId) {
  return `/api/v1/employees/${employeeId}/photo`;
}
