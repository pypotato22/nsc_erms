import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { DepartmentsPage } from '../../features/departments/DepartmentsPage.jsx';

let mounted = false;

export function initDepartments() {}

export async function renderDepartmentPage() {
  const host = document.getElementById('page-departments');
  if (!host) return;
  if (!mounted) {
    host.innerHTML = '';
    mounted = true;
  }
  mountIsland(host, createElement(DepartmentsPage));
}
