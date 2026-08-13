import { createElement } from 'react';
import { getSetupStatus } from '../api/setup.js';
import { getEl } from '../utils/helpers.js';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { SetupWizard } from '../../features/auth/SetupWizard.jsx';

let _onComplete = null;
let _status = null;
let _mounted = false;

function renderWizard() {
  const host = getEl('setup-screen');
  if (!host) return;
  if (!_mounted) {
    host.innerHTML = '';
    _mounted = true;
  }
  mountIsland(
    host,
    createElement(SetupWizard, {
      status: _status,
      onComplete: () => {
        hideSetupWizard();
        _onComplete?.();
      },
    }),
  );
}

export function initSetupWizard(onComplete) {
  _onComplete = onComplete;
}

export async function checkSetupNeeded() {
  return getSetupStatus();
}

export function showSetupWizard(status) {
  _status = status || {};
  getEl('setup-screen').style.display = 'flex';
  getEl('login-screen').style.display = 'none';
  getEl('app').style.display = 'none';
  renderWizard();
}

export function hideSetupWizard() {
  getEl('setup-screen').style.display = 'none';
}
