import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { BackupPage } from '../../features/backup/BackupPage.jsx';

let mounted = false;

export function initBackup() {}

export async function renderBackupPage() {
  const host = document.getElementById('page-backup');
  if (!host) return;
  if (!mounted) {
    host.innerHTML = '';
    mounted = true;
  }
  mountIsland(host, createElement(BackupPage));
}
