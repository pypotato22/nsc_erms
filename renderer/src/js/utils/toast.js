let toastTimer = null;
let undoHandler = null;

export function showToast(message, type = 'info', options = {}) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  clearTimeout(toastTimer);
  undoHandler = null;

  const { actionLabel, onAction, duration = 3200 } = options;

  if (actionLabel && typeof onAction === 'function') {
    toast.innerHTML = '';
    const msg = document.createElement('span');
    msg.className = 'toast-msg';
    msg.textContent = message;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = actionLabel;
    undoHandler = onAction;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearTimeout(toastTimer);
      toast.classList.remove('show');
      const fn = undoHandler;
      undoHandler = null;
      fn?.();
    });
    toast.append(msg, btn);
  } else {
    toast.textContent = message;
  }

  toast.className = `t-${type} show`;
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    undoHandler = null;
  }, duration);
}
