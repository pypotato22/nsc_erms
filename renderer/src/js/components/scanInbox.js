import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { ScanInboxPage } from '../../features/scan-inbox/ScanInboxPage.jsx';

let mounted = false;

export function initScanInbox() {}

export async function renderScanInboxPage() {
  const host = document.getElementById('page-scan-inbox');
  if (!host) return;
  if (!mounted) {
    host.innerHTML = '';
    mounted = true;
  }
  mountIsland(host, createElement(ScanInboxPage));
}
