/**
 * Custom frameless window chrome — only active when preload exposes window.nscDesktop.
 */

function setMaximizedUi(maximized) {
  const btn = document.getElementById('tb-max');
  const root = document.getElementById('desktop-titlebar');
  if (!btn || !root) return;
  root.dataset.maximized = maximized ? '1' : '0';
  btn.setAttribute('aria-label', maximized ? 'Restore' : 'Maximize');
  btn.title = maximized ? 'Restore' : 'Maximize';
}

export function initDesktopTitlebar() {
  const desktop = window.nscDesktop;
  if (!desktop?.isDesktop) return;

  const bar = document.getElementById('desktop-titlebar');
  if (!bar) return;

  document.body.classList.add('desktop-shell');
  bar.hidden = false;
  bar.removeAttribute('aria-hidden');

  document.getElementById('tb-min')?.addEventListener('click', () => {
    desktop.minimize();
  });
  document.getElementById('tb-max')?.addEventListener('click', async () => {
    const maximized = await desktop.maximizeToggle();
    setMaximizedUi(Boolean(maximized));
  });
  document.getElementById('tb-close')?.addEventListener('click', () => {
    desktop.close();
  });

  bar.addEventListener('dblclick', async (event) => {
    if (event.target.closest('.tb-controls')) return;
    const maximized = await desktop.maximizeToggle();
    setMaximizedUi(Boolean(maximized));
  });

  desktop.isMaximized?.().then((maximized) => setMaximizedUi(Boolean(maximized)));
  desktop.onMaximizeChange?.(setMaximizedUi);
}
