import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getFingerprintStatus } from '../../js/api/documents.js';

/** Mirrors the server's capture timeout (server/electron fingerprint/session.js). */
export const CAPTURE_TIMEOUT_S = 25;

function FingerprintGlyph() {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M32 8c-11 0-20 8-20 19v8" />
      <path d="M32 14c-8 0-14 6-14 13v10c0 4-1 8-3 11" />
      <path d="M32 20c-4.5 0-8 3.2-8 7.5V38c0 6-2 10-5 14" />
      <path d="M32 26c-1.7 0-3 1.2-3 3v9c0 7-1.6 12-4 16" />
      <path d="M38 29v9c0 6-1.2 11-3 15" />
      <path d="M44 24v14c0 5-1 9-2.5 13" />
      <path d="M50 28v9c0 3-.6 6-1.5 8.5" />
      <path d="M32 8c11 0 20 8 20 19" />
    </svg>
  );
}

/**
 * In-app dialog shown while the right thumb is captured. Stays on top of the
 * main window (so it can't be closed or clicked past), shows that the reader
 * is active, then previews the captured print.
 *
 * phase: 'waiting' | 'done' | 'error'
 */
export function ThumbCaptureDialog({ phase, startedAt, message, previewSrc, onCancel, onRetry, onDone }) {
  const [reader, setReader] = useState({ state: 'checking', label: 'Checking reader…' });
  const [left, setLeft] = useState(CAPTURE_TIMEOUT_S);
  const [closeBlocked, setCloseBlocked] = useState(false);

  // Is the U.are.U 4500 actually plugged in and visible to Windows?
  useEffect(() => {
    let alive = true;
    getFingerprintStatus()
      .then((s) => {
        if (!alive) return;
        setReader(
          s?.available
            ? { state: 'ok', label: `${s.reader || 'U.are.U 4500'} connected` }
            : { state: 'bad', label: s?.message || 'Fingerprint reader not detected' },
        );
      })
      .catch(() => alive && setReader({ state: 'unknown', label: 'Reader status unavailable' }));
    return () => {
      alive = false;
    };
  }, []);

  // Countdown while the reader is waiting for a finger.
  useEffect(() => {
    if (phase !== 'waiting') return undefined;
    const tick = () => setLeft(Math.max(0, CAPTURE_TIMEOUT_S - Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [phase, startedAt]);

  // Esc cancels the capture instead of closing the form behind the dialog.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (phase === 'waiting') onCancel();
      else onDone();
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [phase, onCancel, onDone]);

  // The desktop shell tells us if someone tried to close the app mid-capture.
  useEffect(() => {
    const off = window.nscDesktop?.onThumbCloseBlocked?.(() => {
      setCloseBlocked(true);
      setTimeout(() => setCloseBlocked(false), 4000);
    });
    return () => off?.();
  }, []);

  const pct = Math.round((left / CAPTURE_TIMEOUT_S) * 100);

  return createPortal(
    <div className="overlay open thumb-dlg-overlay" role="presentation">
      <div className="modal thumb-dlg" role="dialog" aria-modal="true" aria-labelledby="thumb-dlg-title">
        <button
          type="button"
          className="modal-close"
          aria-label={phase === 'waiting' ? 'Cancel capture' : 'Close'}
          title={phase === 'waiting' ? 'Cancel capture' : 'Close'}
          onClick={phase === 'waiting' ? onCancel : onDone}
        >
          ×
        </button>
        <h3 id="thumb-dlg-title">Right thumb capture</h3>

        <div className={`thumb-reader thumb-reader-${reader.state}`}>
          <span className="thumb-dot" aria-hidden="true" />
          <span>{reader.label}</span>
        </div>

        {phase === 'waiting' && (
          <>
            <div className="thumb-scan" aria-hidden="true">
              <span className="thumb-ring" />
              <span className="thumb-ring thumb-ring-2" />
              <div className="thumb-glyph">
                <FingerprintGlyph />
                <span className="thumb-sweep" />
              </div>
            </div>
            <p className="thumb-status" role="status" aria-live="polite">
              <strong>Scanner is active.</strong> Place your right thumb flat on the reader and hold still.
            </p>
            <div className="thumb-timer" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </div>
            <p className="thumb-sub">{left > 0 ? `Waiting for your thumb… ${left}s` : 'Still waiting for the reader…'}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-cancel" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <div className="thumb-preview-box">
              <img src={previewSrc} alt="Captured right thumb" />
            </div>
            <p className="thumb-status" role="status">
              <strong>Right thumb captured.</strong> Check that the print is clear. Retake it if it looks faint or cut off.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-cancel" onClick={onRetry}>
                Retake
              </button>
              <button type="button" className="btn btn-primary" onClick={onDone} autoFocus>
                Use this print
              </button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="thumb-glyph thumb-glyph-error" aria-hidden="true">
              <FingerprintGlyph />
            </div>
            <p className="thumb-status thumb-status-error" role="alert">
              {message || 'The right thumb was not captured.'}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-cancel" onClick={onDone}>
                Close
              </button>
              <button type="button" className="btn btn-primary" onClick={onRetry} autoFocus>
                Try again
              </button>
            </div>
          </>
        )}

        {closeBlocked && (
          <p className="thumb-sub thumb-warn" role="alert">
            Finish or cancel the capture before closing the app.
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
