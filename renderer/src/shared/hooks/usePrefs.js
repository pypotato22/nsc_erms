import { useCallback, useEffect, useState } from 'react';

const KEY = 'nsc_erms_prefs';
const LEGACY_KEY = 'edurecords_prefs';
const FONT_SIZES = [13, 14, 17, 21];

function normalizeFontSize(size) {
  const n = Number(size);
  if (FONT_SIZES.includes(n)) return n;
  return FONT_SIZES.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best));
}

function readPrefs() {
  const defaults = { darkMode: false, fontSize: 14, pdsHtmlPrintPreview: true };
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY);
    if (!raw) return defaults;
    const parsed = { ...defaults, ...JSON.parse(raw) };
    parsed.fontSize = normalizeFontSize(parsed.fontSize);
    return parsed;
  } catch {
    return defaults;
  }
}

function applyPrefs(prefs) {
  document.body.classList.toggle('dark', Boolean(prefs.darkMode));
  document.documentElement.style.setProperty('--fs', `${prefs.fontSize}px`);
}

/**
 * UI prefs (dark mode, font size). Mirrors legacy App.prefs in main.js.
 */
export function usePrefs() {
  const [prefs, setPrefsState] = useState(() => readPrefs());

  useEffect(() => {
    applyPrefs(prefs);
  }, [prefs]);

  const setPrefs = useCallback((patch) => {
    setPrefsState((prev) => {
      const next = {
        ...prev,
        ...(typeof patch === 'function' ? patch(prev) : patch),
      };
      next.fontSize = normalizeFontSize(next.fontSize);
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { prefs, setPrefs, fontSizes: FONT_SIZES };
}
