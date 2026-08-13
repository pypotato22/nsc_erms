import { createElement } from 'react';
import { mountIsland } from '../../shared/lib/mountIsland.js';
import { LoginPage } from '../../features/auth/LoginPage.jsx';
import { normalizeUser } from '../../features/auth/normalizeUser.js';

export { normalizeUser };

/**
 * Mount React Login into #login-screen (replaces static markup).
 */
export function initLogin(onSuccess) {
  const host = document.getElementById('login-screen');
  if (!host) throw new Error('login-screen missing');
  host.innerHTML = '';
  mountIsland(host, createElement(LoginPage, { onSuccess }));
}

/** @deprecated Prefer React LoginPage submit; kept for any stray callers. */
export async function attemptLogin() {
  throw new Error('attemptLogin is retired; use React LoginPage');
}
