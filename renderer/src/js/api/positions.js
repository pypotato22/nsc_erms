import { api } from './client.js';

export function listPositions() {
  return api('/positions');
}

export function createPosition(data) {
  return api('/positions', { method: 'POST', body: JSON.stringify(data) });
}

export function updatePosition(id, data) {
  return api(`/positions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deletePosition(id) {
  return api(`/positions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
