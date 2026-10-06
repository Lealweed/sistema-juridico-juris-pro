import { getWorkspaceVisual, type WorkspaceVisual } from '@/lib/workspaceVisual';

/** Changing presentation reloads the current route only after an explicit warning. */
export function WorkspaceVisualSwitcher() {
  const current = getWorkspaceVisual();
  function changeVisual(next: WorkspaceVisual) {
    if (next === current) return;
    if (!window.confirm('A troca de visual recarrega esta página. Salve os dados do formulário antes de continuar. Deseja trocar agora?')) return;
    const url = new URL(window.location.href);
    url.searchParams.set('visual', next);
    window.location.assign(url.href);
  }

  return (
    <label className="workspace-visual-switch flex items-center gap-2 text-xs">
      <span className="hidden lg:inline">Visual</span>
      <select aria-label="Visual do sistema" value={current} onChange={(event) => changeVisual(event.target.value as WorkspaceVisual)} className="max-w-[95px] rounded-md border border-current/20 bg-transparent px-2 py-2 text-xs">
        <option value="classic">Clássico</option>
        <option value="reference">Novo</option>
      </select>
    </label>
  );
}
