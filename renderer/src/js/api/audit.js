import { api } from './client.js';

export function listAuditLogs(params = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.action) qs.set('action', params.action);
  if (params.q) qs.set('q', params.q);
  const query = qs.toString();
  return api(`/audit-logs${query ? `?${query}` : ''}`);
}
