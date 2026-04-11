import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, RefreshCw } from 'lucide-react';

import { formatCpf } from '@/lib/cpf';
import { formatBrPhone } from '@/lib/phone';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import { Card } from '@/ui/widgets/Card';

type TriageLeadRow = {
  id: string;
  name: string;
  phone: string | null;
  phone_e164?: string | null;
  whatsapp: string | null;
  email: string | null;
  legal_area: string | null;
  case_description: string | null;
  created_at: string;
  cpf: string | null;
};

function formatDateTime(value: string) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function resolveLeadPhone(row: TriageLeadRow) {
  return row.phone_e164 || row.whatsapp || row.phone || '';
}

function DataTable({ rows, loading }: { rows: TriageLeadRow[]; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1120px] w-full border-separate border-spacing-0 text-left text-sm text-white/85">
        <thead className="bg-white/5 text-[11px] uppercase tracking-[0.18em] text-white/55">
          <tr>
            {['Nome', 'Telefone', 'E-mail', 'Área', 'Caso', 'Data/Hora', 'CPF'].map((label) => (
              <th key={label} className="border-b border-white/10 px-4 py-3 font-medium first:rounded-tl-2xl last:rounded-tr-2xl">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-sm text-white/60">
                Carregando leads...
              </td>
            </tr>
          ) : null}

          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-sm text-white/60">
                Nenhum lead encontrado na fila de triagem.
              </td>
            </tr>
          ) : null}

          {!loading
            ? rows.map((row) => (
                <tr key={row.id} className="bg-transparent transition-colors hover:bg-white/5">
                  <td className="border-b border-white/10 px-4 py-3 font-medium text-white">
                    <Link className="hover:text-amber-300" to={`/app/clientes/${row.id}`}>
                      {row.name || 'Sem nome'}
                    </Link>
                  </td>
                  <td className="border-b border-white/10 px-4 py-3 text-white/80">{formatBrPhone(resolveLeadPhone(row)) || '—'}</td>
                  <td className="border-b border-white/10 px-4 py-3 text-white/80">{row.email || '—'}</td>
                  <td className="border-b border-white/10 px-4 py-3 text-white/80">{row.legal_area || '—'}</td>
                  <td className="border-b border-white/10 px-4 py-3 text-white/80">
                    <div className="max-w-[360px] truncate" title={row.case_description || ''}>
                      {row.case_description || '—'}
                    </div>
                  </td>
                  <td className="border-b border-white/10 px-4 py-3 text-white/80">{formatDateTime(row.created_at)}</td>
                  <td className="border-b border-white/10 px-4 py-3 text-white/80">{row.cpf ? formatCpf(row.cpf) : '—'}</td>
                </tr>
              ))
            : null}
        </tbody>
      </table>
    </div>
  );
}

export function TriagePage() {
  const [rows, setRows] = useState<TriageLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const { data, error: qErr } = await sb
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (qErr) throw new Error(qErr.message);
      setRows((data || []) as TriageLeadRow[]);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar fila de triagem.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const withArea = rows.filter((row) => Boolean(row.legal_area)).length;
    const withCase = rows.filter((row) => Boolean(row.case_description)).length;

    return {
      total: rows.length,
      withArea,
      withCase,
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-white/15 bg-gradient-to-br from-white/10 via-white/5 to-transparent">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10">
              <ClipboardList className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">Triagem / Leads</h1>
              <p className="text-sm text-white/60">
                Painel em formato de planilha para atendimento inicial dos clientes recém-cadastrados.
              </p>
            </div>
          </div>

          <button type="button" onClick={load} disabled={loading} className="btn-ghost inline-flex items-center gap-2 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-white/10 bg-white/5">
          <div className="text-xs uppercase tracking-[0.18em] text-white/50">Leads carregados</div>
          <div className="mt-2 text-3xl font-semibold text-white">{loading ? '—' : stats.total}</div>
        </Card>

        <Card className="border-amber-400/20 bg-amber-400/5">
          <div className="text-xs uppercase tracking-[0.18em] text-amber-200/80">Com área definida</div>
          <div className="mt-2 text-3xl font-semibold text-amber-100">{loading ? '—' : stats.withArea}</div>
        </Card>

        <Card className="border-emerald-400/20 bg-emerald-500/5">
          <div className="text-xs uppercase tracking-[0.18em] text-emerald-200/80">Com resumo do caso</div>
          <div className="mt-2 text-3xl font-semibold text-emerald-100">{loading ? '—' : stats.withCase}</div>
        </Card>
      </div>

      {error ? <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}

      <Card className="overflow-hidden px-0 py-0">
        <div className="border-b border-white/10 px-4 py-4 sm:px-5">
          <div className="text-sm font-semibold text-white">Fila em modo planilha</div>
          <div className="mt-1 text-xs text-white/55">Ordenação automática por data de cadastro mais recente.</div>
        </div>

        <DataTable rows={rows} loading={loading} />
      </Card>
    </div>
  );
}
