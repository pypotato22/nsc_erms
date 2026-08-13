import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { TrashPage } from '../../features/trash/TrashPage.jsx';

let mounted = false;

export function initTrash() {}

export async function renderTrashPage() {
  const host = document.getElementById('page-trash');
  if (!host) return;
  if (!mounted) {
    host.innerHTML = '';
    mounted = true;
  }
  mountIsland(host, createElement(TrashPage));
}
