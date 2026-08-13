import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import {
  PdsViewer,
  printHtmlPds,
  downloadOfficialPdsExcel as downloadExcelImpl,
  downloadOfficialPdsPdf as downloadPdfImpl,
} from '../../features/pds-viewer/PdsViewer.jsx';

let mounted = false;
let _getPrefs = () => ({});
let open = false;
/** @type {object | string | number | null} */
let employeeOrId = null;

function remount() {
  const host = document.getElementById('pds-view-overlay');
  if (!host) return;
  if (!mounted) {
    host.innerHTML = '';
    mounted = true;
    host.addEventListener('click', (e) => {
      if (e.target === host) closePdsViewer();
    });
  }
  host.classList.toggle('open', open);
  mountIsland(
    host,
    createElement(PdsViewer, {
      open,
      employeeOrId,
      getPrefs: _getPrefs,
      onClose: closePdsViewer,
    }),
  );
}

export function initPdsViewer(getPrefs) {
  if (typeof getPrefs === 'function') _getPrefs = getPrefs;
  remount();
}

export async function openPdsViewer(nextEmployeeOrId) {
  employeeOrId = nextEmployeeOrId;
  open = true;
  remount();
}

export function closePdsViewer() {
  open = false;
  employeeOrId = null;
  remount();
}

export function printPds(employee) {
  printHtmlPds(employee);
}

export function downloadOfficialPdsExcel(employeeId) {
  downloadExcelImpl(employeeId);
}

export function downloadOfficialPdsPdf(employeeId) {
  downloadPdfImpl(employeeId);
}
