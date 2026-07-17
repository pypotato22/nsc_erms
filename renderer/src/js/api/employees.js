import { api } from './client.js';

export function listEmployees(params = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.departmentId) qs.set('departmentId', params.departmentId);
  if (params.statusId) qs.set('statusId', params.statusId);
  if (params.all) qs.set('all', '1');
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return api(`/employees${query ? `?${query}` : ''}`);
}

export function getEmployee(id) {
  return api(`/employees/${id}`);
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
