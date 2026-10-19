import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatFileSize } from '../../js/utils/helpers.js';
import { scanInboxFileUrl } from '../../js/api/scanInbox.js';
import { ScanFileViewer } from './ScanFileViewer.jsx';

/** Full-size preview of an inbox file with prev/next and quick actions. */
export function ScanPreviewModal({
  files,
  name,
  writable,
  suspended,
  onSelect,
  onClose,
  onRename,
  onAssign,
  onReject,
}) {
  const index = files.findIndex((f) => f.name === name);
  const file = files[index];
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < files.length - 1;

  useEffect(() => {
    if (suspended) return undefined;
    function onKey(e) {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasPrev) onSelect(files[index - 1].name);
      else if (e.key === 'ArrowRight' && hasNext) onSelect(files[index + 1].name);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [suspended, hasPrev, hasNext, index, files, onSelect, onClose]);

  if (!file) return null;

  return createPortal(
    <div className="overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal scan-preview-modal">
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <h3 className="scan-preview-title" title={file.name}>
              {file.name}
            </h3>
            <div className="bk-meta">
              {formatFileSize(file.size)} · {new Date(file.modifiedAt).toLocaleString('en-PH')} ·{' '}
              {index + 1} of {files.length}
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close preview">
            ×
          </button>
        </div>

        <div className="scan-preview-body">
          <button
            type="button"
            className="scan-nav scan-nav-prev"
            disabled={!hasPrev}
            onClick={() => onSelect(files[index - 1].name)}
            aria-label="Previous file"
          >
            ‹
          </button>
          <ScanFileViewer file={file} />
          <button
            type="button"
            className="scan-nav scan-nav-next"
            disabled={!hasNext}
            onClick={() => onSelect(files[index + 1].name)}
            aria-label="Next file"
          >
            ›
          </button>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <a
            className="btn btn-sm btn-edit"
            href={scanInboxFileUrl(file.name, { download: true })}
          >
            Download
          </a>
          <div className="bk-acts">
            {writable && (
              <>
                <button type="button" className="btn btn-sm btn-edit" onClick={() => onRename(file.name)}>
                  Rename
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-edit"
                  disabled={file.tooLarge}
                  onClick={() => onAssign(file.name)}
                >
                  Assign
                </button>
                <button type="button" className="btn btn-sm btn-del" onClick={() => onReject(file.name)}>
                  Reject
                </button>
              </>
            )}
            <button type="button" className="btn btn-cancel" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
