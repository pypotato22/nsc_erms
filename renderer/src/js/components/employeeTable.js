import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { EmployeesPage } from '../../features/employees/EmployeesPage.jsx';

let mounted = false;
/** @type {null | {
 *   load: (q?: string) => void,
 *   resetPage: () => void,
 *   refreshFilters: () => Promise<void>,
 *   clearSearch: () => void,
 *   getQuery: () => string,
 * }} */
let api = null;
let _onSearchSync = () => {};
/** @type {null | string} */
let pendingLoad = null;
let pendingClear = false;
let pendingReset = false;
let pendingFilters = false;

function registerApi(next) {
  api = next;
  if (!api) return;
  if (pendingClear) {
    pendingClear = false;
    api.clearSearch();
  }
  if (pendingReset) {
    pendingReset = false;
    api.resetPage();
  }
  if (pendingFilters) {
    pendingFilters = false;
    api.refreshFilters();
  }
  if (pendingLoad !== null) {
    const q = pendingLoad;
    pendingLoad = null;
    api.load(q);
  }
}

function ensureMounted() {
  const host = document.getElementById('page-employees');
  if (!host) return;
  if (!mounted) {
    host.innerHTML = '';
    mounted = true;
  }
  mountIsland(
    host,
    createElement(EmployeesPage, {
      initialQuery: '',
      onSearchSync: _onSearchSync,
      registerApi,
    }),
  );
}

/**
 * @param {(q: string) => void} [onSearchSync]
 */
export function initEmployeeTable(onSearchSync) {
  if (typeof onSearchSync === 'function') {
    _onSearchSync = onSearchSync;
  }
}

export function resetEmployeePage() {
  if (api) api.resetPage();
  else pendingReset = true;
}

export function clearEmployeeSearch() {
  _onSearchSync('');
  if (api) api.clearSearch();
  else pendingClear = true;
}

export async function refreshFilterDropdowns() {
  ensureMounted();
  if (api?.refreshFilters) await api.refreshFilters();
  else pendingFilters = true;
}

export async function renderEmployeeTable(searchQuery = '') {
  ensureMounted();
  if (api?.load) api.load(searchQuery);
  else pendingLoad = searchQuery;
}
