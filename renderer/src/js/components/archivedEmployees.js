import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { ArchivedEmployeesPage } from '../../features/archived/ArchivedEmployeesPage.jsx';

let mounted = false;
let _getSearchQuery = () => '';

export function initArchivedEmployees(getSearchQuery) {
  if (typeof getSearchQuery === 'function') _getSearchQuery = getSearchQuery;
}

export async function renderArchivedEmployeesPage() {
  const host = document.getElementById('page-archived-employees');
  if (!host) return;
  if (!mounted) {
    host.innerHTML = '';
    mounted = true;
  }
  mountIsland(host, createElement(ArchivedEmployeesPage, { getSearchQuery: _getSearchQuery }));
}
