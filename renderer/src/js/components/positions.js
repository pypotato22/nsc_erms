import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { PositionsPage } from '../../features/positions/PositionsPage.jsx';

let mounted = false;

export function initPositions() {
  /* React owns events after first render */
}

export async function renderPositionsPage() {
  const host = document.getElementById('page-positions');
  if (!host) return;
  if (!mounted) {
    host.innerHTML = '';
    mounted = true;
  }
  mountIsland(host, createElement(PositionsPage));
}
