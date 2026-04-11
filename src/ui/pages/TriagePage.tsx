import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Mail, Phone, RefreshCw, UserRound, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
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

function DataTable({
  rows,
  loading,
  onSelect,
}: {
  rows: TriageLeadRow[];
  loading: boolean;
  onSelect: (row: TriageLeadRow) => void;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-[1320px] w-full border-separate border-spacing-0 text-left text-sm text-white/85">
        <thead className="bg-white/5 text-[11px] uppercase tracking-[0.18em] text-white/55">
          <tr>
            <th className="min-w-[200px] whitespace-nowrap border-b border-white/10 px-4 py-3 font-medium first:rounded-tl-2xl">Nome</th>
            <th className="min-w-[160px] whitespace-nowrap border-b border-white/10 px-4 py-3 font-medium">Telefone</th>
            <th className="min-w-[200px] whitespace-nowrap border-b border-white/10 px-4 py-3 font-medium">E-mail</th>
            <th className="min-w-[180px] whitespace-nowrap border-b border-white/10 px-4 py-3 font-medium">Área</th>
            <th className="min-w-[300px] whitespace-nowrap border-b border-white/10 px-4 py-3 font-medium">Caso</th>
            <th className="min-w-[170px] whitespace-nowrap border-b border-white/10 px-4 py-3 font-medium">Data/Hora</th>
            <th className="min-w-[160px] whitespace-nowrap border-b border-white/10 px-4 py-3 font-medium">CPF</th>
            <th className="sticky right-0 min-w-[150px] whitespace-nowrap border-b border-white/10 bg-neutral-950 px-4 py-3 font-medium last:rounded-tr-2xl">AÇÕES</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-sm text-white/60">
                Carregando leads...
              </td>
            </tr>
          ) : null}

          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-sm text-white/60">
                Nenhum lead encontrado na fila de triagem.
              </td>
            </tr>
          ) : null}

          {!loading
            ? rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onSelect(row)}
                  className="cursor-pointer bg-transparent align-top transition-colors hover:bg-slate-800/50"
                >
                  <td className="min-w-[200px] border-b border-white/10 px-4 py-3 font-medium text-white">
                    <div>{row.name || 'Sem nome'}</div>
                    <div className="mt-1 text-[11px] font-normal text-amber-200/70">Clique para ver a ficha</div>
                  </td>
                  <td className="min-w-[160px] whitespace-nowrap border-b border-white/10 px-4 py-3 text-white/80">
                    {formatBrPhone(resolveLeadPhone(row)) || '—'}
                  </td>
                  <td className="min-w-[200px] border-b border-white/10 px-4 py-3 text-white/80">{row.email || '—'}</td>
                  <td className="min-w-[180px] border-b border-white/10 px-4 py-3 text-white/80">{row.legal_area || '—'}</td>
                  <td className="min-w-[300px] border-b border-white/10 px-4 py-3 text-white/80">
                    <div className="max-w-[320px] overflow-hidden text-ellipsis line-clamp-2" title={row.case_description || ''}>
                      {row.case_description || '—'}
                    </div>
                  </td>
                  <td className="min-w-[170px] whitespace-nowrap border-b border-white/10 px-4 py-3 text-white/80">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="min-w-[160px] border-b border-white/10 px-4 py-3 text-white/80">{row.cpf ? formatCpf(row.cpf) : '—'}</td>
                  <td className="sticky right-0 min-w-[150px] border-b border-white/10 bg-neutral-950/95 px-4 py-3 text-white/80">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(row);
                      }}
                    >
                      Ver Detalhes
                    </Button>
                  </td>
                </tr>
              ))
            : null}
        </tbody>
      </table>
    </div>
  );
}

function LeadDetailsModal({ lead, onClose }: { lead: TriageLeadRow | null; onClose: () => void }) {
  if (!lead) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-neutral-950/95 shadow-[0_30px_120px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-white/10 bg-neutral-950/95 px-5 py-4 backdrop-blur sm:px-6">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-amber-200/80">Ficha de Atendimento</div>
            <h2 className="mt-1 text-xl font-semibold text-white">{lead.name || 'Lead sem nome'}</h2>
            <p className="mt-1 text-sm text-white/60">Cadastro em {formatDateTime(lead.created_at)}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Fechar detalhes"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 p-5 sm:p-6">
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <UserRound className="h-4 w-4 text-amber-300" />
              Informações de Contato
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Nome</div>
                <div className="mt-2 text-sm text-white">{lead.name || '—'}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-white/45">
                  <Phone className="h-3.5 w-3.5" />
                  Telefone
                </div>
                <div className="mt-2 text-sm text-white">{formatBrPhone(resolveLeadPhone(lead)) || '—'}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-white/45">
                  <Mail className="h-3.5 w-3.5" />
                  E-mail
                </div>
                <div className="mt-2 break-all text-sm text-white">{lead.email || '—'}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">CPF</div>
                <div className="mt-2 text-sm text-white">{lead.cpf ? formatCpf(lead.cpf) : '—'}</div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-amber-200/80">Área do Direito</div>
            <div className="mt-3">
              <span className="inline-flex items-center rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm font-medium text-amber-100">
                {lead.legal_area || 'Não informada'}
              </span>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Relato Completo do Caso</div>
            <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-white/85">
              {lead.case_description || 'Nenhum relato informado até o momento.'}
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-2">
            <div className="text-sm text-white/60">Data/Hora do cadastro: {formatDateTime(lead.created_at)}</div>
            <Link className="btn-ghost" to={`/app/clientes/${lead.id}`} onClick={onClose}>
              Abrir cadastro completo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TriagePage() {
  const [rows, setRows] = useState<TriageLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<TriageLeadRow | null>(null);

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

  useEffect(() => {
    if (!selectedLead) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedLead(null);
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedLead]);

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

      <Card className="px-0 py-0">
        <div className="border-b border-white/10 px-4 py-4 sm:px-5">
          <div className="text-sm font-semibold text-white">Fila em modo planilha</div>
          <div className="mt-1 text-xs text-white/55">Ordenação automática por data de cadastro mais recente.</div>
          <div className="mt-2 text-xs text-amber-200/80">(Deslize a tabela para o lado para ver mais colunas)</div>
        </div>

        <div className="w-full overflow-x-auto">
          <DataTable rows={rows} loading={loading} onSelect={setSelectedLead} />
        </div>
      </Card>

      <LeadDetailsModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
