import { useCallback, useEffect, useState } from 'react';
import {
  listTrashDocuments,
  restoreDocument,
  permanentDeleteDocument,
  downloadDocumentUrl,
} from '../../js/api/documents.js';
import { ApiError } from '../../js/api/client.js';
import { formatFileSize } from '../../js/utils/helpers.js';
import { printDocument } from '../../js/utils/printDocument.js';
import { showToast } from '../../js/utils/toast.js';
import { canWrite } from '../../js/utils/authz.js';
import { refreshOpenDocsTabForLiveSync } from '../../js/components/documents.js';

const PAGE_SIZE = 25;

export function TrashPage() {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const writable = canWrite();

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const data = await listTrashDocuments({ page: p, limit: PAGE_SIZE });
      setDocuments(data.documents || []);
      setPage(data.page || 1);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      const badge = document.getElementById('trash-badge');
      if (badge) badge.textContent = String(data.total ?? (data.documents?.length || 0));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to load trash.', 'error');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load(page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onRestore(id) {
    try {
      await restoreDocument(id);
      showToast('Document restored.', 'success');
      await load(page);
      refreshOpenDocsTabForLiveSync?.();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Restore failed.', 'error');
    }
  }

  async function onPurge(id) {
    if (!confirm('Permanently delete this document? This cannot be undone.')) return;
    try {
      await permanentDeleteDocument(id);
      showToast('Document permanently deleted.', 'success');
      await load(page);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Delete failed.', 'error');
    }
  }

  return (
    <>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontSize: '0.9286rem', color: 'var(--text-2)' }}>
          Soft-deleted documents. Restore or delete permanently.
        </p>
        <button type="button" className="btn btn-sm btn-edit" onClick={() => load(1).then(() => setPage(1))}>
          Refresh
        </button>
      </div>
      <div className="card" style={{ padding: '8px 14px' }}>
        <div className="bk-list">
          {loading && <div className="empty">Loading trash…</div>}
          {!loading && !documents.length && (
            <div className="empty" style={{ padding: '28px 0', textAlign: 'center' }}>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>Trash is empty</p>
            </div>
          )}
          {documents.map((doc) => {
            const when = doc.deletedAt ? new Date(doc.deletedAt).toLocaleString('en-PH') : '—';
            const size = typeof doc.fileSize === 'number' ? formatFileSize(doc.fileSize) : doc.fileSize;
            const emp = doc.employee;
            return (
              <div className="bk-item" style={{ alignItems: 'flex-start' }} key={doc.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="bk-name">
                    {doc.fileName}{' '}
                    <span style={{ fontSize: '0.7143rem', background: 'var(--bg-subtle)', color: 'var(--blue-700)', padding: '1px 7px', borderRadius: 99, fontWeight: 700, marginLeft: 5 }}>
                      v{doc.versionNumber}
                    </span>
                  </div>
                  <div className="bk-meta">
                    {emp?.lastName}, {emp?.firstName}
                    {emp?.employeeNo ? ` (${emp.employeeNo})` : ''} · {doc.documentTypeName} · {size} · deleted {when}
                  </div>
                </div>
                <div className="bk-acts">
                  <button type="button" className="btn btn-sm btn-edit" onClick={() => window.open(downloadDocumentUrl(doc.id), '_blank')}>
                    Download
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-edit"
                    onClick={() =>
                      printDocument(doc.id, doc.mimeType || '', doc.fileName || '').catch((err) =>
                        showToast(err.message || 'Print failed.', 'error'),
                      )
                    }
                  >
                    Print
                  </button>
                  {writable && (
                    <>
                      <button type="button" className="btn btn-sm btn-edit" onClick={() => onRestore(doc.id)}>
                        Restore
                      </button>
                      <button type="button" className="btn btn-sm btn-del" onClick={() => onPurge(doc.id)}>
                        Delete forever
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="pager" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <button type="button" className="btn btn-sm" disabled={!total || page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </button>
          <span style={{ fontSize: '0.8571rem', color: 'var(--text-3)' }}>
            {total === 0 ? 'Trash empty' : `Page ${page} of ${totalPages} · ${total} item(s)`}
          </span>
          <button type="button" className="btn btn-sm" disabled={!total || page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </div>
    </>
  );
}
