import {
  listTrashDocuments,
  restoreDocument,
  permanentDeleteDocument,
  downloadDocumentUrl,
} from '../api/documents.js';
import { ApiError } from '../api/client.js';
import { getEl, setHTML, escapeHtml, formatFileSize } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';

export function initTrash() {
  getEl('trash-refresh')?.addEventListener('click', () => {
    renderTrashPage().catch(showErr);
  });
}

export async function renderTrashPage() {
  setHTML('trash-list', '<div class="empty">Loading trash…</div>');
  try {
    const { documents } = await listTrashDocuments();
    const badge = document.getElementById('trash-badge');
    if (badge) badge.textContent = String(documents.length);

    if (!documents.length) {
      setHTML(
        'trash-list',
        `<div class="empty" style="padding:28px 0;text-align:center;">
          <p style="font-weight:600;margin-bottom:6px;">Trash is empty</p>
          <p style="font-size:12px;color:var(--text-3);">Soft-deleted 201 File documents appear here. Restore or delete permanently.</p>
        </div>`,
      );
      return;
    }

    setHTML(
      'trash-list',
      documents
        .map((doc) => {
          const when = doc.deletedAt
            ? new Date(doc.deletedAt).toLocaleString('en-PH')
            : '—';
          const size =
            typeof doc.fileSize === 'number'
              ? formatFileSize(doc.fileSize)
              : doc.fileSize;
          const emp = doc.employee;
          return `
        <div class="bk-item" style="align-items:flex-start;">
          <div style="flex:1;min-width:0;">
            <div class="bk-name">${escapeHtml(doc.fileName)}
              <span style="font-size:10px;background:var(--bg-subtle);color:var(--blue-700);padding:1px 7px;border-radius:99px;font-weight:700;margin-left:5px;">v${doc.versionNumber}</span>
            </div>
            <div class="bk-meta">
              ${escapeHtml(emp?.lastName || '')}, ${escapeHtml(emp?.firstName || '')} (${escapeHtml(emp?.employeeNo || '')})
              · ${escapeHtml(doc.documentTypeName)}
              · ${escapeHtml(size)}
              · deleted ${escapeHtml(when)}
            </div>
          </div>
          <div class="bk-acts">
            <button class="btn btn-sm btn-edit" data-trash-download="${doc.id}">Download</button>
            <button class="btn btn-sm btn-edit" data-trash-restore="${doc.id}">Restore</button>
            <button class="btn btn-sm btn-del" data-trash-purge="${doc.id}">Delete forever</button>
          </div>
        </div>`;
        })
        .join(''),
    );

    document.querySelectorAll('[data-trash-download]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.open(downloadDocumentUrl(btn.dataset.trashDownload), '_blank');
      });
    });

    document.querySelectorAll('[data-trash-restore]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await restoreDocument(btn.dataset.trashRestore);
          showToast('Document restored to 201 File.', 'success');
          await renderTrashPage();
        } catch (err) {
          showErr(err);
        }
      });
    });

    document.querySelectorAll('[data-trash-purge]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (
          !confirm(
            'Permanently delete this document and remove the file from disk? This cannot be undone.',
          )
        ) {
          return;
        }
        try {
          await permanentDeleteDocument(btn.dataset.trashPurge);
          showToast('Permanently deleted.', 'success');
          await renderTrashPage();
        } catch (err) {
          showErr(err);
        }
      });
    });
  } catch (err) {
    setHTML(
      'trash-list',
      `<div class="empty" style="color:var(--error)">${escapeHtml(err.message || 'Failed to load trash')}</div>`,
    );
  }
}

function showErr(err) {
  showToast(err instanceof ApiError ? err.message : err.message || 'Error', 'error');
}
