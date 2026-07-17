import { api } from './client.js';

export function listDepartments() {
  return api('/departments');
}

export function createDepartment(data) {
  return api('/departments', { method: 'POST', body: JSON.stringify(data) });
}

export function updateDepartment(id, data) {
  return api(`/departments/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteDepartment(id) {
  return api(`/departments/${id}`, { method: 'DELETE' });
}

export function getDepartmentPositions(departmentId) {
  return api(`/lookups/departments/${departmentId}/positions`);
}

export {
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
} from './positions.js';

export function listEmploymentTypes() {
  return api('/lookups/employment-types');
}

export function listEmploymentStatuses() {
  return api('/lookups/employment-statuses');
}
