import { useState } from 'react';
import { login as apiLogin } from '../../js/api/auth.js';
import { ApiError } from '../../js/api/client.js';
import { normalizeUser } from './normalizeUser.js';
import logoUrl from '../../../school_logo.jpg';

export function LoginPage({ onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e?.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Enter username and password.');
      return;
    }
    setBusy(true);
    try {
      const { user } = await apiLogin(username.trim(), password);
      setPassword('');
      onSuccess?.(normalizeUser(user));
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Unable to reach the server. Is the API running?';
      setError(message);
      setPassword('');
      setTimeout(() => setError((cur) => (cur === message ? '' : cur)), 4000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-box">
      <div className="login-logo">
        <img src={logoUrl} alt="Northern Samar Colleges" width={72} height={72} />
      </div>
      <h1>Northern Samar Colleges</h1>
      <p>Employee Records Management System</p>
      <form onSubmit={submit}>
        <div className="login-field">
          <label htmlFor="login-user">Username</label>
          <input
            id="login-user"
            type="text"
            autoComplete="username"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="login-field">
          <label htmlFor="login-pass">Password</label>
          <input
            id="login-pass"
            type="password"
            autoComplete="current-password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="login-err" id="login-err">
          {error}
        </div>
        <button id="login-btn" className="login-btn" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
