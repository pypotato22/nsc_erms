import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { onAppEvent } from '../../shared/lib/appEvents.js';
import { DocumentsTab } from '../../features/documents/DocumentsTab.jsx';

let mounted = false;
let reloadKey = 0;
let _emp = null;
let subscribed = false;
/** @type {(() => void) | null} */
let _onHeaderRefresh = null;

/**
 * @param {() => void} [onHeaderRefresh] Called after documents change so the
 *   profile panel header can refresh without this module importing it.
 */
export function initDocuments(onHeaderRefresh) {
  if (typeof onHeaderRefresh === 'function') _onHeaderRefresh = onHeaderRefresh;
  if (subscribed) return;
  subscribed = true;
  onAppEvent('documents.refresh', (payload) => {
    refreshOpenDocsTabForLiveSync(payload).catch(() => {});
  });
}

export async function renderTabDocs(emp) {
  if (!emp) return;
  const host = document.getElementById('tab-docs');
  if (!host) return;
  if (!mounted) {
    host.innerHTML = '';
    mounted = true;
  }
  _emp = emp;
  reloadKey += 1;
  mountIsland(
    host,
    createElement(DocumentsTab, {
      employee: emp,
      reloadKey,
      onHeaderRefresh: () => _onHeaderRefresh?.(),
    }),
  );
}

/**
 * Live-sync: refresh the open Documents tab when documents change for that employee.
 * @param {{ employeeId?: string }} [payload]
 */
export async function refreshOpenDocsTabForLiveSync(payload = {}) {
  if (!_emp?.id) return;
  const empId = payload.employeeId;
  if (empId && String(empId) !== String(_emp.id)) return;

  const panel = document.getElementById('panel');
  const tab = document.getElementById('tab-docs');
  if (!panel?.classList.contains('open') || !tab?.classList.contains('active')) {
    return;
  }

  try {
    await renderTabDocs(_emp);
    _onHeaderRefresh?.();
  } catch {
    /* ignore */
  }
}
