import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { ExportPage } from '../../features/export/ExportPage.jsx';

/** @type {HTMLElement | null} */
let mountedHost = null;

/** Mounts once per host element; the shell can hand us a fresh host after logout. */
export function initExport() {
  const host = document.getElementById('page-export');
  if (!host || host === mountedHost) return;
  host.innerHTML = '';
  mountedHost = host;
  mountIsland(host, createElement(ExportPage));
}
