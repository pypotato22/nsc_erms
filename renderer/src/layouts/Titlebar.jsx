import { useEffect, useState } from 'react';

/**
 * Electron frameless window chrome contents (mounted into #desktop-titlebar).
 * No-ops visually when not in Electron (bridge skips mount).
 */
export function Titlebar() {
  const desktop = typeof window !== 'undefined' ? window.nscDesktop : null;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!desktop?.isDesktop) return undefined;
    const bar = document.getElementById('desktop-titlebar');
    if (bar) bar.dataset.maximized = maximized ? '1' : '0';
  }, [desktop, maximized]);

  useEffect(() => {
    if (!desktop?.isDesktop) return undefined;
    desktop.isMaximized?.().then((m) => setMaximized(Boolean(m)));
    const off = desktop.onMaximizeChange?.((m) => setMaximized(Boolean(m)));
    return () => {
      if (typeof off === 'function') off();
    };
  }, [desktop]);

  if (!desktop?.isDesktop) return null;

  return (
    <>
      <div
        className="tb-drag"
        aria-hidden="true"
        onDoubleClick={async (event) => {
          if (event.target.closest('.tb-controls')) return;
          const next = await desktop.maximizeToggle();
          setMaximized(Boolean(next));
        }}
      />
      <div className="tb-controls">
        <button type="button" className="tb-btn" title="Minimize" aria-label="Minimize" onClick={() => desktop.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1 5h8" stroke="currentColor" stroke-width="1.2" fill="none" />
          </svg>
        </button>
        <button
          type="button"
          className="tb-btn"
          id="tb-max"
          title={maximized ? 'Restore' : 'Maximize'}
          aria-label={maximized ? 'Restore' : 'Maximize'}
          onClick={async () => {
            const next = await desktop.maximizeToggle();
            setMaximized(Boolean(next));
          }}
        >
          {maximized ? (
            <svg className="tb-icon-restore" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M3 3.5h5.5V9H3z" stroke="currentColor" stroke-width="1.1" fill="none" />
              <path d="M2 6.5V1.5h5.5" stroke="currentColor" stroke-width="1.1" fill="none" />
            </svg>
          ) : (
            <svg className="tb-icon-max" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="1.5" y="1.5" width="7" height="7" rx="0.5" stroke="currentColor" stroke-width="1.2" fill="none" />
            </svg>
          )}
        </button>
        <button type="button" className="tb-btn" id="tb-close" title="Close" aria-label="Close" onClick={() => desktop.close()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.2" fill="none" />
          </svg>
        </button>
      </div>
    </>
  );
}
