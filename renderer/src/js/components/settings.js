import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { SettingsPage } from '../../features/settings/SettingsPage.jsx';
import { setCurrentRole } from '../utils/authz.js';

let mounted = false;
let _getPrefs = null;
let _savePrefs = null;
let _getCurrentUser = () => null;

export function initSettings(getPrefs, savePrefs, getCurrentUser) {
  _getPrefs = getPrefs;
  _savePrefs = savePrefs;
  if (typeof getCurrentUser === 'function') {
    _getCurrentUser = getCurrentUser;
  }
}

export async function renderSettingsPage() {
  const host = document.getElementById('page-settings');
  if (!host) return;

  const user = _getCurrentUser();
  if (user?.roleCode) {
    setCurrentRole(user.roleCode);
  }

  if (!mounted) {
    host.innerHTML = '';
    mounted = true;
  }
  mountIsland(
    host,
    createElement(SettingsPage, {
      getPrefs: _getPrefs,
      savePrefs: _savePrefs,
      getCurrentUser: _getCurrentUser,
    }),
  );
}
