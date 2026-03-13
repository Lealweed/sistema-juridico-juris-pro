import { useParams } from 'react-router-dom';

import { Card } from '@/ui/widgets/Card';

export function DemoCaseDetailsPage() {
  const { caseId } = useParams();

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs text-amber-200">
          MODO DEMONSTRAÇÃO
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-white">Caso: {caseId}</h1>
        <p className="text-sm text-white/60">Detalhe do caso (demonstração).</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="text-sm font-semibold text-white">Resumo</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Info label="Status" value="Aberto" />
            <Info label="Cliente" value="(exemplo)" />
          </div>

          <div className="mt-4">
            <div className="text-xs text-white/60">Descrição</div>
            <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
              Campo para descrição do caso, movimentações e anotações internas.
            </div>
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold text-white">Ações</div>
          <div className="mt-3 grid gap-2">
            <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10">
              Criar tarefa
            </button>
            <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10">
              Anexar documento
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-white/60">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
