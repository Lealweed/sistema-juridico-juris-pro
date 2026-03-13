const KEY = 'castrocrm.theme';

export type AppTheme = 'dark' | 'light';

function safeDoc() {
  return typeof document !== 'undefined' ? document : null;
}

export function getStoredTheme(): AppTheme {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: AppTheme) {
  const doc = safeDoc();
  if (!doc) return;
  doc.documentElement.setAttribute('data-app-theme', theme);
}

export function setTheme(theme: AppTheme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // ignore
  }
  applyTheme(theme);
}

export function initTheme() {
  applyTheme(getStoredTheme());
}

export function toggleTheme(current?: AppTheme): AppTheme {
  const now = current || getStoredTheme();
  const next: AppTheme = now === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
