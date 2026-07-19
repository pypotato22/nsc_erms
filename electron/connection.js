(function () {
  const desktop = window.nscDesktop;
  if (!desktop) {
    document.body.innerHTML =
      '<p style="padding:2rem;font-family:system-ui">Desktop bridge unavailable.</p>';
    return;
  }

  const form = document.getElementById('connect-form');
  const hostInput = document.getElementById('host-input');
  const statusEl = document.getElementById('connect-status');
  const checkingPanel = document.getElementById('checking-panel');
  const checkingText = document.getElementById('checking-text');
  const connectBtn = document.getElementById('connect-btn');
  const btnLabel = connectBtn.querySelector('.btn-label');
  const btnSpinner = connectBtn.querySelector('.btn-spinner');
  const schemeBtns = [...document.querySelectorAll('.scheme-btn')];
  const titlebar = document.getElementById('desktop-titlebar');

  let scheme = 'https';

  function setScheme(next) {
    scheme = next === 'http' ? 'http' : 'https';
    schemeBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.scheme === scheme);
    });
  }

  function setMaximizedUi(maximized) {
    titlebar.dataset.maximized = maximized ? '1' : '0';
    const btn = document.getElementById('tb-max');
    if (!btn) return;
    btn.setAttribute('aria-label', maximized ? 'Restore' : 'Maximize');
    btn.title = maximized ? 'Restore' : 'Maximize';
  }

  function showStatus(message, kind) {
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      statusEl.className = 'connect-status';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = `connect-status ${kind || 'info'}`;
  }

  function setBusy(busy) {
    connectBtn.disabled = busy;
    hostInput.disabled = busy;
    schemeBtns.forEach((btn) => {
      btn.disabled = busy;
    });
    btnLabel.textContent = busy ? 'Connecting…' : 'Connect';
    btnSpinner.hidden = !busy;
  }

  function showChecking(url) {
    checkingPanel.hidden = false;
    form.hidden = true;
    showStatus('', 'info');
    checkingText.textContent = url
      ? `Checking ${url}…`
      : 'Checking saved server…';
  }

  function showForm(state) {
    checkingPanel.hidden = true;
    form.hidden = false;
    applySavedUrl(state?.lastUrl || '');
    if (state?.error) {
      showStatus(state.error, 'error');
    } else {
      showStatus(
        'Enter the ERMS server address (HTTP or HTTPS) to continue.',
        'info',
      );
    }
    hostInput.focus();
    hostInput.select();
  }

  /**
   * Build a normalized server origin from scheme + host field, or a pasted full URL.
   */
  function buildServerUrl() {
    const raw = hostInput.value.trim();
    if (!raw) throw new Error('Enter a server address.');

    if (/^https?:\/\//i.test(raw)) {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only http:// and https:// are supported.');
      }
      setScheme(parsed.protocol === 'http:' ? 'http' : 'https');
      return `${parsed.protocol}//${parsed.host}`;
    }

    const host = raw.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!host) throw new Error('Enter a server address.');
    return `${scheme}://${host}`;
  }

  function applySavedUrl(url) {
    if (!url) {
      hostInput.value = 'localhost:3443';
      setScheme('http');
      return;
    }
    try {
      const parsed = new URL(url);
      setScheme(parsed.protocol === 'http:' ? 'http' : 'https');
      hostInput.value = parsed.host;
    } catch {
      hostInput.value = url;
    }
  }

  schemeBtns.forEach((btn) => {
    btn.addEventListener('click', () => setScheme(btn.dataset.scheme));
  });

  document.getElementById('tb-min').addEventListener('click', () => desktop.minimize());
  document.getElementById('tb-max').addEventListener('click', async () => {
    setMaximizedUi(Boolean(await desktop.maximizeToggle()));
  });
  document.getElementById('tb-close').addEventListener('click', () => desktop.close());
  titlebar.addEventListener('dblclick', async (event) => {
    if (event.target.closest('.tb-controls')) return;
    setMaximizedUi(Boolean(await desktop.maximizeToggle()));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    let serverUrl;
    try {
      serverUrl = buildServerUrl();
    } catch (err) {
      showStatus(err.message || 'Invalid server address.', 'error');
      return;
    }

    setBusy(true);
    showStatus(`Trying ${serverUrl}…`, 'info');
    try {
      const result = await desktop.connect(serverUrl);
      if (!result?.ok) {
        showStatus(result?.error || 'Could not reach the ERMS server.', 'error');
        setBusy(false);
      }
      // On success the main process navigates away from this page.
    } catch (err) {
      showStatus(err.message || 'Connection failed.', 'error');
      setBusy(false);
    }
  });

  (async function boot() {
    desktop.isMaximized?.().then((m) => setMaximizedUi(Boolean(m)));
    desktop.onMaximizeChange?.(setMaximizedUi);
    desktop.onBootReady?.(showForm);

    const state = await desktop.getBootState();
    if (state?.checking) {
      showChecking(state.lastUrl);
    } else {
      showForm(state);
    }
  })();
})();
