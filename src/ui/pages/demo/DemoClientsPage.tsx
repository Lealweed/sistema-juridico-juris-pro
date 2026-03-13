import { Link } from 'react-router-dom';

import { Card } from '@/ui/widgets/Card';
import { clientsMock } from '@/ui/state/mocks';

export function DemoClientsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs text-amber-200">
            MODO DEMONSTRAÇÃO
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-white">Clientes</h1>
          <p className="text-sm text-white/60">Lista com dados de demonstração.</p>
        </div>
        <button className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-white/90">
          Novo cliente
        </button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-white/50">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Último contato</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clientsMock.map((c) => (
                <tr key={c.id} className="border-t border-white/10">
                  <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                  <td className="px-4 py-3 text-white/70">{c.kind}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/70">{c.lastContact}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                      to={`/app/demo/clientes/${c.id}`}
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
