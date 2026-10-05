export type WorkspaceVisual = 'classic' | 'reference';

const PREVIEW_KEY = 'jurispro.workspace-visual-preview';
let activeVisual: WorkspaceVisual = 'classic';

export function resolveWorkspaceVisual(input: {
  configured?: string | null;
  requested?: string | null;
  stored?: string | null;
}): WorkspaceVisual {
  const choices = [input.requested, input.stored, input.configured];
  for (const choice of choices) {
    if (choice === 'reference' || choice === 'classic') return choice;
  }
  return 'classic';
}

/** Resolve once at startup, so navigating does not remount forms or change their theme. */
export function initializeWorkspaceVisual(): WorkspaceVisual {
  let stored: string | null = null;
  let requested: string | null = null;
  if (typeof window !== 'undefined') {
    requested = new URLSearchParams(window.location.search).get('visual');
    try {
      stored = window.sessionStorage.getItem(PREVIEW_KEY);
      if (requested === 'classic' || requested === 'reference') {
        window.sessionStorage.setItem(PREVIEW_KEY, requested);
      }
    } catch { /* The URL/configuration still works when session storage is unavailable. */ }
  }
  activeVisual = resolveWorkspaceVisual({
    configured: import.meta.env?.VITE_WORKSPACE_VISUAL,
    requested,
    stored,
  });
  return activeVisual;
}

export function getWorkspaceVisual(): WorkspaceVisual {
  return activeVisual;
}

export function isReferenceSurface(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/app' || normalized === '/app/financeiro/parceiros';
}
