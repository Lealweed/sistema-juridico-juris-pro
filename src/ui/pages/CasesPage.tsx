import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Card } from '@/ui/widgets/Card';
import { getMyOfficeRole } from '@/lib/roles';
import { getMyOfficeId, listOfficeMemberProfiles, type OfficeMemberProfile } from '@/lib/officeContext';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import { loadClientsLite } from '@/lib/loadClientsLite';
import type { ClientLite } from '@/lib/types';

type CaseRow = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  client_id: string | null;
  client?: { name: string } | null;
  process_number: string | null;
  area: string | null;
  responsible_user_id: string | null;
};

function statusBadge(status: string) {
  const s = (status || '').toLowerCase();
  if (s.includes('abert')) return 'badge badge-gold';
  if (s.includes('and')) return 'badge';
  if (s.includes('encerr') || s.includes('final')) return 'badge';
  return 'badge';
}

export function CasesPage() {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [params, setParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<string>('');
  const [members, setMembers] = useState<OfficeMemberProfile[]>([]);

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [responsibleFilter, setResponsibleFilter] = useState<string>('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newStatus, setNewStatus] = useState('aberto');
  const [newClientIds, setNewClientIds] = useState<string[]>([]);
  const [newProcessNumber, setNewProcessNumber] = useState('');
  const [newArea, setNewArea] = useState('');
  const [saving, setSaving] = useState(false);

  const ordered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows;

    if (statusFilter !== 'all') {
      out = out.filter((r) => (r.status || '').toLowerCase().includes(statusFilter.toLowerCase()));
    }

    if (role === 'admin' && responsibleFilter !== 'all') {
      out = out.filter((r) => (r.responsible_user_id || '') === responsibleFilter);
    }

    if (needle) {
      out = out.filter((r) => {
        const s = `${r.title} ${r.process_number || ''} ${r.area || ''} ${r.client?.name || ''}`.toLowerCase();
        return s.includes(needle);
      });
    }

    return out;
  }, [rows, q, statusFilter, role, responsibleFilter]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const [{ data: casesData, error: qErr }, clientsLite] = await Promise.all([
        sb
          .from('cases')
          .select('id,title,status,created_at,client_id,process_number,area,responsible_user_id, client:clients!cases_client_id_fkey(name)')
          .order('created_at', { ascending: false }),
        loadClientsLite().catch(() => [] as ClientLite[]),
      ]);

      if (qErr) throw new Error(qErr.message);
      setRows((casesData || []) as any);
      setClients(clientsLite);
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar casos.');
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();

      // role/members
      const r = await getMyOfficeRole().catch(() => '');
      setRole(r);
      if (r === 'admin') {
        const officeId = await getMyOfficeId().catch(() => null);
        if (officeId) {
          const ms = await listOfficeMemberProfiles(officeId).catch(() => []);
          setMembers(ms);
        }
      }

      // allow deep link: /app/casos?new=1&clientId=...
      const wantNew = params.get('new') === '1';
      const clientId = params.get('clientId') || '';
      if (wantNew) {
        setCreateOpen(true);
        if (clientId) setNewClientIds([clientId]);
        // cleanup URL
        params.delete('new');
        params.delete('clientId');
        setParams(params, { replace: true });
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate() {
    if (!newTitle.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const sb = requireSupabase();
      const user = await getAuthedUser();

      // Ensure we have a primary client_id for the legacy column, if needed.
      const primaryClientId = newClientIds.length > 0 ? newClientIds[0] : null;

      const { data: createdCase, error: iErr } = await sb.from('cases').insert({
        user_id: user.id,
        title: newTitle.trim(),
        status: newStatus.trim() || 'aberto',
        client_id: primaryClientId,
        process_number: newProcessNumber.trim() || null,
        area: newArea.trim() || null,
      } as any).select('id').single();

      if (iErr) throw new Error(iErr.message);

      if (newClientIds.length > 0) {
        const caseClients = newClientIds.map(cid => ({
          case_id: createdCase.id,
          client_id: cid
        }));
        await sb.from('case_clients').insert(caseClients as any);
      }

      setCreateOpen(false);
      setNewTitle('');
      setNewStatus('aberto');
      setNewClientIds([]);
      setNewProcessNumber('');
      setNewArea('');
      setSaving(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao criar caso.');
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Casos</h1>
          <p className="text-sm text-white/60">Base real (Supabase).</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary">
          Novo caso
        </button>
      </div>

      {createOpen ? (
        <Card>
          <div className="grid gap-4">
            <div className="text-sm font-semibold text-white">Novo caso</div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-white/80">
                Título
                <input className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              </label>
              <label className="text-sm text-white/80">
                Status
                <input className="input" value={newStatus} onChange={(e) => setNewStatus(e.target.value)} />
              </label>
              <label className="text-sm text-white/80">
                Número do processo (CNJ)
                <input className="input" value={newProcessNumber} onChange={(e) => setNewProcessNumber(e.target.value)} />
              </label>
              <label className="text-sm text-white/80">
                Área
                <input className="input" value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="Ex.: Previdenciário" />
              </label>
              <label className="md:col-span-2 text-sm text-white/80">
                Clientes Vinculados
                <div className="flex flex-col gap-2 mt-1">
                  <div className="flex flex-wrap gap-2">
                    {newClientIds.map((cid) => {
                      const cName = clients.find(c => c.id === cid)?.name || 'Desconhecido';
                      return (
                        <div key={cid} className="flex items-center gap-1 bg-white/10 rounded-md px-2 py-1 text-xs">
                          {cName}
                          <button type="button" onClick={() => setNewClientIds(prev => prev.filter(x => x !== cid))} className="text-red-300 ml-1 hover:text-red-100">x</button>
                        </div>
                      )
                    })}
                  </div>
                  <select 
                    className="select" 
                    value="" 
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val && !newClientIds.includes(val)) {
                        setNewClientIds(prev => [...prev, val]);
                      }
                    }}
                  >
                    <option value="">Adicionar cliente...</option>
                    {clients.filter(c => !newClientIds.includes(c.id)).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button disabled={saving} onClick={onCreate} className="btn-primary">
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <button disabled={saving} onClick={() => setCreateOpen(false)} className="btn-ghost">
                Cancelar
              </button>
            </div>

            {error ? <div className="text-sm text-red-200">{error}</div> : null}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Lista de casos</div>
            <div className="text-xs text-white/60">Busque por título, CNJ, cliente ou área.</div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              className="input !mt-0 !text-sm"
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select className="select !mt-0 !text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos status</option>
              <option value="aberto">Abertos</option>
              <option value="and">Em andamento</option>
              <option value="encerr">Encerrados</option>
            </select>
            {role === 'admin' ? (
              <select
                className="select !mt-0 !text-sm"
                value={responsibleFilter}
                onChange={(e) => setResponsibleFilter(e.target.value)}
              >
                <option value="all">Todos responsáveis</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name || m.email || m.user_id}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}
          {error && !createOpen ? <div className="text-sm text-red-200">{error}</div> : null}

          {!loading && !error ? (
            <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-white/50">
                  <tr>
                    <th className="px-4 py-3">Título</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((c) => (
                    <tr key={c.id} className="border-t border-white/10">
                      <td className="px-4 py-3 font-medium text-white">
                        <div>
                          <div>{c.title}</div>
                          <div className="mt-1 text-xs text-white/50">
                            {c.process_number ? `CNJ: ${c.process_number}` : 'CNJ: —'}{c.area ? ` · ${c.area}` : ''}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/70">{c.client?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={statusBadge(c.status)}>{c.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs" to={`/app/casos/${c.id}`}>
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}

                  {ordered.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-white/60" colSpan={4}>
                        Nenhum caso cadastrado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 md:hidden">
              {ordered.map((c) => (
                <Link
                  key={c.id}
                  to={`/app/casos/${c.id}`}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{c.title}</div>
                      <div className="mt-1 text-xs text-white/60">{c.client?.name || '—'}</div>
                      <div className="mt-1 text-xs text-white/50">
                        {c.process_number ? `CNJ: ${c.process_number}` : 'CNJ: —'}{c.area ? ` · ${c.area}` : ''}
                      </div>
                    </div>
                    <span className={statusBadge(c.status)}>{c.status}</span>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-amber-200">
                    Abrir →
                  </div>
                </Link>
              ))}

              {ordered.length === 0 ? <div className="text-sm text-white/60">Nenhum caso cadastrado.</div> : null}
            </div>
            </>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
