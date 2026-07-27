import { api } from './client.js';

export function getStorageSettings() {
  return api('/settings/storage');
}

export function validateStorageSettings(body) {
  return api('/settings/storage/validate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateStorageSettings(body) {
  return api('/settings/storage', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
