import { api } from './client.js';

export function listEmployees(params = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.departmentId) qs.set('departmentId', params.departmentId);
  if (params.statusId) qs.set('statusId', params.statusId);
  if (params.all) qs.set('all', '1');
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.sort) qs.set('sort', params.sort);
  if (params.dir) qs.set('dir', params.dir);
  const query = qs.toString();
  return api(`/employees${query ? `?${query}` : ''}`);
}

export function getEmployee(id) {
  return api(`/employees/${id}`);
}

export function listEmployeeAssignments(id) {
  return api(`/employees/${encodeURIComponent(id)}/assignments`);
}

export function createEmployee(data) {
  return api('/employees', { method: 'POST', body: JSON.stringify(data) });
}

export function updateEmployee(id, data) {
  return api(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteEmployee(id) {
  return api(`/employees/${id}`, { method: 'DELETE' });
}

export function listArchivedEmployees(params = {}) {
  const qs = new URLSearchParams();
  if (params.all) qs.set('all', '1');
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return api(`/employees/trash${query ? `?${query}` : ''}`);
}

export function restoreEmployee(id) {
  return api(`/employees/${id}/restore`, { method: 'POST', body: '{}' });
}

export function permanentDeleteEmployee(id) {
  return api(`/employees/${id}/permanent`, { method: 'DELETE' });
}

export function downloadPdsExcelUrl(id) {
  return `/api/v1/employees/${encodeURIComponent(id)}/pds-excel`;
}

export function downloadPdsPdfUrl(id) {
  return `/api/v1/employees/${encodeURIComponent(id)}/pds-pdf`;
}
