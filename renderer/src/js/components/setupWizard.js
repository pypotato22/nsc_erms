import { getSetupStatus, completeSetup } from '../api/setup.js';
import { ApiError } from '../api/client.js';
import { getEl } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';

let _onComplete = null;

export function initSetupWizard(onComplete) {
  _onComplete = onComplete;
  getEl('setup-finish-btn').addEventListener('click', handleFinish);

  getEl('browse-setup-files')?.addEventListener('click', () => {
    browseSetupFolder('setup-files', 'Select files root folder').catch(() => {});
  });
  getEl('browse-setup-inbox')?.addEventListener('click', () => {
    browseSetupFolder('setup-inbox', 'Select scan inbox folder').catch(() => {});
  });
  getEl('browse-setup-backups')?.addEventListener('click', () => {
    browseSetupFolder('setup-backups', 'Select backup folder').catch(() => {});
  });
}

export async function checkSetupNeeded() {
  const status = await getSetupStatus();
  return status;
}

function canPickDesktopFolder() {
  return Boolean(window.nscDesktop?.isDesktop && typeof window.nscDesktop.pickFolder === 'function');
}

function syncSetupBrowseUi() {
  const show = canPickDesktopFolder();
  document.querySelectorAll('#setup-screen .desktop-folder-btn').forEach((btn) => {
    btn.hidden = !show;
  });
  document.querySelectorAll('#setup-screen .desktop-only-hint').forEach((el) => {
    el.hidden = !show;
  });
}

async function browseSetupFolder(inputId, title) {
  if (!canPickDesktopFolder()) return;
  const input = getEl(inputId);
  const result = await window.nscDesktop.pickFolder({
    title,
    defaultPath: input?.value?.trim() || undefined,
  });
  if (result?.canceled || !result?.path) return;
  if (input) input.value = result.path;
}

export function showSetupWizard(status) {
  getEl('setup-screen').style.display = 'flex';
  getEl('login-screen').style.display = 'none';
  getEl('app').style.display = 'none';
  getEl('setup-org').value = status.orgName || 'Northern Samar Colleges';
  getEl('setup-files').value =
    status.filesRoot || status.filesRootHint || 'C:\\nsc-erms-files';
  getEl('setup-inbox').value =
    status.scanInboxPath || status.scanInboxHint || 'C:\\nsc-erms-files\\inbox';
  getEl('setup-backups').value =
    status.backupsRoot ||
    status.backupsRootHint ||
    'C:\\nsc-erms-backups';
  getEl('setup-max').value = String(status.maxUploadBytes || 31457280);
  getEl('setup-err').textContent = '';
  syncSetupBrowseUi();
}

export function hideSetupWizard() {
  getEl('setup-screen').style.display = 'none';
}

async function handleFinish() {
  const errEl = getEl('setup-err');
  const btn = getEl('setup-finish-btn');
  const orgName = getEl('setup-org').value.trim();
  const filesRoot = getEl('setup-files').value.trim();
  const scanInboxPath = getEl('setup-inbox').value.trim();
  const backupsRoot = getEl('setup-backups').value.trim();
  const maxUploadBytes = Number(getEl('setup-max').value);

  errEl.textContent = '';
  if (!orgName || !filesRoot || !scanInboxPath || !backupsRoot) {
    errEl.textContent = 'Organization name and all paths are required.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await completeSetup({
      orgName,
      filesRoot,
      scanInboxPath,
      backupsRoot,
      maxUploadBytes,
    });
    hideSetupWizard();
    showToast('Setup complete.', 'success');
    _onComplete?.();
  } catch (err) {
    errEl.textContent =
      err instanceof ApiError ? err.message : 'Setup failed.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Finish setup';
  }
}
