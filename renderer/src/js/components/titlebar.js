import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { Titlebar } from '../../layouts/Titlebar.jsx';

/**
 * Mount React titlebar into #desktop-titlebar (Electron only).
 */
export function initDesktopTitlebar() {
  const desktop = window.nscDesktop;
  if (!desktop?.isDesktop) return;

  const bar = document.getElementById('desktop-titlebar');
  if (!bar) return;

  bar.innerHTML = '';
  bar.hidden = false;
  bar.removeAttribute('aria-hidden');
  document.body.classList.add('desktop-shell');
  mountIsland(bar, createElement(Titlebar));
}
