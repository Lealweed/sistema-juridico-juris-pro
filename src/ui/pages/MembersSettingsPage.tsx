import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings2, ShieldCheck, Users } from 'lucide-react';
import { TeamPage } from '@/ui/pages/TeamPage';

type TabKey = 'informacoes' | 'configuracoes';

export function MembersSettingsPage() {
  const [tab, setTab] = useState<TabKey>('informacoes');

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/50">Configurações</p>
            <h1 className="text-xl font-semibold text-white">Membros do Escritório</h1>
            <p className="mt-1 text-sm text-white/70">
              Subpágina dedicada para informações e configurações completas dos membros.
            </p>
          </div>
          <Link
            to="/app/configuracoes"
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10"
          >
            Voltar para Configurações
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2 text-amber-300"><Users className="h-4 w-4" /> Informações</div>
            <p className="mt-1 text-xs text-white/60">Dados cadastrais e composição da equipe.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2 text-amber-300"><ShieldCheck className="h-4 w-4" /> Permissões</div>
            <p className="mt-1 text-xs text-white/60">Papel, acesso e ações administrativas.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2 text-amber-300"><Settings2 className="h-4 w-4" /> Configurações</div>
            <p className="mt-1 text-xs text-white/60">Convites, edição de perfis e remoção de membros.</p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            className={`rounded-lg px-3 py-2 text-sm ${tab === 'informacoes' ? 'bg-amber-400 text-black font-semibold' : 'bg-white/10 text-white/70'}`}
            onClick={() => setTab('informacoes')}
          >
            Informações
          </button>
          <button
            className={`rounded-lg px-3 py-2 text-sm ${tab === 'configuracoes' ? 'bg-amber-400 text-black font-semibold' : 'bg-white/10 text-white/70'}`}
            onClick={() => setTab('configuracoes')}
          >
            Configurações
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
        {/* Mantém a gestão completa existente em um ponto único */}
        <TeamPage />
      </div>
    </div>
  );
}
