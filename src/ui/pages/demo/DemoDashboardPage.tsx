import { Card } from '@/ui/widgets/Card';
import { Stat } from '@/ui/widgets/Stat';
import { ActivityFeed } from '@/ui/widgets/ActivityFeed';

export function DemoDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs text-amber-200">
          MODO DEMONSTRAÇÃO
        </div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-white/60">Apresentação rápida do CRM (dados de demonstração).</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clientes" value="28" hint="Cadastros" />
        <Stat label="Casos" value="12" hint="Total" />
        <Stat label="Abertos" value="8" hint="Em andamento" />
        <Stat label="Em espera" value="2" hint="Aguardando" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="text-sm font-semibold text-white">Status dos casos</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[{ k: 'Aberto', v: 8 }, { k: 'Em espera', v: 2 }, { k: 'Encerrado', v: 2 }].map((x) => (
              <div key={x.k} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-white/60">{x.k}</div>
                <div className="mt-1 text-2xl font-semibold text-white">{x.v}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold text-white">Atividades recentes</div>
          <ActivityFeed />
        </Card>
      </div>
    </div>
  );
}
