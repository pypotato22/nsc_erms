import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { clearToast, subscribeToast } from './toastStore.js';
import styles from './ToastHost.module.css';

export function ToastHost() {
  const [item, setItem] = useState(null);

  useEffect(() => subscribeToast(setItem), []);

  useEffect(() => {
    if (!item) return undefined;
    const t = setTimeout(() => clearToast(), item.duration);
    return () => clearTimeout(t);
  }, [item]);

  const typeClass =
    item?.type === 'success'
      ? styles.success
      : item?.type === 'error'
        ? styles.error
        : styles.info;

  const node = (
    <div
      id="toast"
      className={`${styles.host}${item ? ` ${styles.show} ${typeClass}` : ''}`}
      aria-live="polite"
    >
      {item ? (
        item.actionLabel && typeof item.onAction === 'function' ? (
          <>
            <span className={styles.msg}>{item.message}</span>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                const fn = item.onAction;
                clearToast();
                fn?.();
              }}
            >
              {item.actionLabel}
            </button>
          </>
        ) : (
          item.message
        )
      ) : null}
    </div>
  );

  return createPortal(node, document.body);
}
