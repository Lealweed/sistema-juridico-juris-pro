import { Link } from 'react-router-dom';

import { BorderBeam } from '@/components/ui/border-beam';

export function Hero1951() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-6 md:p-10">
      <BorderBeam />

      <div className="relative z-10 grid gap-6 md:grid-cols-2 md:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
            CRM Jurídico · Escritório
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Operando
          </div>

          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Controle total do escritório em um só lugar
          </h2>
          <p className="mt-2 text-sm text-white/70">
            Clientes, casos, tarefas, agenda e auditoria — com visão de gargalos e esteira de trabalho.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/app/tarefas/kanban" className="btn-primary">
              Kanban
            </Link>
            <Link to="/app/agenda" className="btn-ghost">
              Agenda
            </Link>
            <Link to="/app/casos" className="btn-ghost">
              Casos
            </Link>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-2xl border border-white/10 bg-neutral-950/40 p-4">
            <div className="text-xs font-semibold text-white/60">Ponto seco (exemplo)</div>
            <div className="mt-1 text-sm font-semibold text-white">Tarefas pausadas acumulando</div>
            <div className="mt-2 text-xs text-white/60">Use o gráfico de risco para agir antes do prazo estourar.</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-neutral-950/40 p-4">
            <div className="text-xs font-semibold text-white/60">Esteira</div>
            <div className="mt-1 text-sm font-semibold text-white">Delegar → Revisar → Protocolar</div>
            <div className="mt-2 text-xs text-white/60">Acompanhe delegadas e conclusão por participante.</div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
    </div>
  );
}
