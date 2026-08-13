import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { ChangePasswordModal } from '../../features/auth/ChangePasswordModal.jsx';

let _onDone = null;
let _forced = false;
let _open = false;

function render() {
  const host = document.getElementById('pw-react-host') || ensureHost();
  mountIsland(
    host,
    createElement(ChangePasswordModal, {
      open: _open,
      forced: _forced,
      onDone: () => {
        _open = false;
        _forced = false;
        render();
        _onDone?.();
      },
      onCancel: () => {
        if (_forced) return;
        hideChangePassword();
      },
    }),
  );
}

function ensureHost() {
  let host = document.getElementById('pw-react-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'pw-react-host';
    document.body.appendChild(host);
  }
  return host;
}

export function initChangePassword(onDone) {
  _onDone = onDone;
  render();
}

export function showChangePassword(forced = false) {
  _forced = Boolean(forced);
  _open = true;
  render();
}

export function hideChangePassword() {
  _open = false;
  _forced = false;
  render();
}
