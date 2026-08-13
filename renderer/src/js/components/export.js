import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { ExportPage } from '../../features/export/ExportPage.jsx';

let mounted = false;

export function initExport() {
  const host = document.getElementById('page-export');
  if (!host || mounted) return;
  host.innerHTML = '';
  mounted = true;
  mountIsland(host, createElement(ExportPage));
}
