import { useEffect, useState } from 'react';
import { scanInboxFileUrl } from '../../js/api/scanInbox.js';

export function fileKind(name = '') {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (/\.(jpe?g|png)$/.test(lower)) return 'image';
  return 'other'; // .doc / .docx can't be rendered in-app
}

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

/**
 * Renders a scan inbox file: PDFs in the built-in viewer, images with zoom,
 * and a download prompt for Word files.
 */
export function ScanFileViewer({ file }) {
  const kind = fileKind(file.name);
  const [fit, setFit] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFit(true);
    setZoom(1);
    setFailed(false);
  }, [file.name, file.modifiedAt]);

  const src = scanInboxFileUrl(file.name, { version: file.modifiedAt });
  const downloadHref = scanInboxFileUrl(file.name, { download: true });

  function step(dir) {
    setFit(false);
    setZoom((z) => {
      const i = ZOOM_STEPS.findIndex((s) => s >= z);
      const cur = i === -1 ? ZOOM_STEPS.length - 1 : i;
      return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, cur + dir))];
    });
  }

  if (failed) {
    return (
      <div className="scan-viewer scan-viewer-msg">
        <p>This file could not be loaded. It may have been moved or renamed.</p>
      </div>
    );
  }

  if (kind === 'pdf') {
    return (
      <div className="scan-viewer">
        <iframe
          key={src}
          className="scan-viewer-frame"
          title={`Preview of ${file.name}`}
          src={`${src}#toolbar=1&navpanes=0`}
        />
      </div>
    );
  }

  if (kind === 'image') {
    return (
      <div className="scan-viewer">
        <div className="scan-viewer-tools">
          <button type="button" className="btn btn-sm btn-edit" onClick={() => step(-1)} aria-label="Zoom out">
            −
          </button>
          <span className="scan-viewer-zoom">{fit ? 'Fit' : `${Math.round(zoom * 100)}%`}</span>
          <button type="button" className="btn btn-sm btn-edit" onClick={() => step(1)} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="btn btn-sm btn-edit" onClick={() => setFit(true)}>
            Fit
          </button>
          <button
            type="button"
            className="btn btn-sm btn-edit"
            onClick={() => {
              setFit(false);
              setZoom(1);
            }}
          >
            100%
          </button>
        </div>
        <div className="scan-viewer-scroll">
          <img
            key={src}
            src={src}
            alt={file.name}
            onError={() => setFailed(true)}
            style={
              fit
                ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
                : { width: `${zoom * 100}%`, maxWidth: 'none' }
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="scan-viewer scan-viewer-msg">
      <p style={{ fontWeight: 600, marginBottom: 6 }}>No preview for Word documents</p>
      <p style={{ marginBottom: 12 }}>Download the file to open it in Word.</p>
      <a className="btn btn-sm btn-edit" href={downloadHref}>
        Download
      </a>
    </div>
  );
}
