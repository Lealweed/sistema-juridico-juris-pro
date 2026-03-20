import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DollarSign } from 'lucide-react';

import { Card } from '@/ui/widgets/Card';
import { DocumentsSection } from '@/ui/widgets/DocumentsSection';
import { TimelineSection } from '@/ui/widgets/TimelineSection';
import { fetchProcessoEscavador } from '@/lib/escavadorApi';
import { formatBrPhone } from '@/lib/phone';
import { notifyClientBilling, notifyClientCaseUpdate } from '@/lib/evolutionApi';
import { parseMoneyInput, formatBRL } from '@/lib/money';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

type CaseRow = {
  id: string;
  office_id: string | null;
  title: string;
  status: string;
  description: string | null;
  created_at: string;
  client_id: string | null;
  client?: { id: string; name: string; whatsapp?: string | null }[] | null;
  case_clients?: { client: { id: string; name: string; whatsapp?: string | null } }[] | null;

  process_number: string | null;

  // extra
  area: string | null;
  court: string | null;
  district: string | null;
  counterparty_name: string | null;
  counterparty_doc: string | null;
  counterparty_whatsapp: string | null;
  claim_value: number | null;
  distributed_at: string | null;
  responsible_user_id: string | null;

  datajud_last_movement_text: string | null;
  datajud_last_movement_at: string | null;
  datajud_last_checked_at: string | null;
};

type CaseClientContact = { id: string; name: string; whatsapp?: string | null };

const OFFICE_PIX_KEY = (import.meta.env.VITE_OFFICE_PIX_KEY as string | undefined)?.trim() || 'CNPJ: 00.000.000/0001-00';

function getCaseClients(row: CaseRow | null): CaseClientContact[] {
  if (!row) return [];

  const allClients = new Map<string, CaseClientContact>();
  if (row.client?.[0]) allClients.set(row.client[0].id, row.client[0]);
  row.case_clients?.forEach((cc) => {
    if (cc.client) allClients.set(cc.client.id, cc.client);
  });

  return Array.from(allClients.values());
}

export function CaseDetailsPage() {
  const { caseId } = useParams();
  const [row, setRow] = useState<CaseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const [processNumber, setProcessNumber] = useState('');
  const [checking, setChecking] = useState(false);
  const [wppSending, setWppSending] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [billingAmount, setBillingAmount] = useState('');
  const [billingSending, setBillingSending] = useState(false);

  const [officeMembers, setOfficeMembers] = useState<{ user_id: string; display_name: string | null; email: string | null }[]>([]);

  // client picker state
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);
  const [pickedClientId, setPickedClientId] = useState('');
  const [savingClient, setSavingClient] = useState(false);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);

  // editable fields
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('');
  const [description, setDescription] = useState('');

  const [area, setArea] = useState('');
  const [court, setCourt] = useState('');
  const [district, setDistrict] = useState('');

  const [counterpartyName, setCounterpartyName] = useState('');
  const [counterpartyDoc, setCounterpartyDoc] = useState('');
  const [counterpartyWhatsapp, setCounterpartyWhatsapp] = useState('');

  const [claimValue, setClaimValue] = useState('');
  const [distributedAt, setDistributedAt] = useState('');
  const [responsibleUserId, setResponsibleUserId] = useState('');

  async function load() {
    if (!caseId) return;

    try {
      setLoading(true);
      setError(null);

      const sb = requireSupabase();
      await getAuthedUser();

      const { data, error: qErr } = await sb
        .from('cases')
        .select(
          'id,office_id,title,status,description,created_at,client_id, client:clients!cases_client_id_fkey(id,name,whatsapp), case_clients(client:clients(id,name,whatsapp)), process_number, area,court,district,counterparty_name,counterparty_doc,counterparty_whatsapp,claim_value,distributed_at,responsible_user_id, datajud_last_movement_text, datajud_last_movement_at, datajud_last_checked_at',
        )
        .eq('id', caseId)
        .maybeSingle();

      if (qErr) throw new Error(qErr.message);
      const r = data || null;
      setRow(r as CaseRow | null);

      setTitle(r?.title || '');
      setStatus(r?.status || '');
      setDescription(r?.description || '');

      setProcessNumber(r?.process_number || '');

      setArea(r?.area || '');
      setCourt(r?.court || '');
      setDistrict(r?.district || '');
      setCounterpartyName(r?.counterparty_name || '');
      setCounterpartyDoc(r?.counterparty_doc || '');
      setCounterpartyWhatsapp(r?.counterparty_whatsapp ? formatBrPhone(r.counterparty_whatsapp) : '');
      setClaimValue(r?.claim_value !== null && r?.claim_value !== undefined ? String(r.claim_value) : '');
      setDistributedAt(r?.distributed_at || '');
      setResponsibleUserId(r?.responsible_user_id || '');

      // Load office members for Responsible dropdown
      setOfficeMembers([]);
      if (r?.office_id) {
        const { data: ms } = await sb.from('office_members').select('user_id').eq('office_id', r.office_id).limit(200);
        const ids = Array.from(new Set((ms || []).map((m: any) => m.user_id).filter(Boolean)));
        if (ids.length) {
          const { data: profs } = await sb.from('user_profiles').select('user_id,email,display_name').in('user_id', ids).limit(500);
          const sorted = (profs || []) as { user_id: string; display_name: string | null; email: string | null }[];
          sorted.sort((a, b) => String(a.display_name || a.email || '').localeCompare(String(b.display_name || b.email || '')));
          setOfficeMembers(sorted);
        }
      }

      setLoading(false);

      // Load clients for picker
      if (r?.office_id) {
        const { data: clientsData } = await sb
          .from('clients')
          .select('id,name')
          .order('name', { ascending: true })
          .limit(500);
        setAllClients((clientsData || []) as { id: string; name: string }[]);
      }
      setPickedClientId(r?.client_id || '');
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar.');
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function saveCase() {
    if (!caseId) return;
    setSaving(true);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const claim = parseMoneyInput(claimValue);

      const { error: uErr } = await sb
        .from('cases')
        .update({
          title: title.trim() || null,
          status: status.trim() || 'aberto',
          description: description.trim() || null,
          process_number: processNumber.trim() || null,
          area: area.trim() || null,
          court: court.trim() || null,
          district: district.trim() || null,
          counterparty_name: counterpartyName.trim() || null,
          counterparty_doc: counterpartyDoc.trim() || null,
          counterparty_whatsapp: counterpartyWhatsapp.trim() || null,
          claim_value: claim,
          distributed_at: distributedAt || null,
          responsible_user_id: responsibleUserId || null,
        })
        .eq('id', caseId);

      if (uErr) throw new Error(uErr.message);
      await load();
      setSaving(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar.');
      setSaving(false);
    }
  }

  async function saveClientId() {
    if (!caseId) return;
    setSavingClient(true);
    setError(null);
    try {
      const sb = requireSupabase();
      await getAuthedUser();
      const { error: uErr } = await sb
        .from('cases')
        .update({ client_id: pickedClientId || null })
        .eq('id', caseId);
      if (uErr) throw new Error(uErr.message);
      setClientPickerOpen(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao atualizar cliente.');
    } finally {
      setSavingClient(false);
    }
  }

  async function consultEscavador() {
    if (!caseId) return;
    if (!processNumber.trim()) {
      setError('Informe o número CNJ do processo.');
      return;
    }

    setChecking(true);
    setError(null);
    setActionMsg({ type: 'ok', text: 'Buscando...' });

    try {
      const res = await fetchProcessoEscavador(processNumber.trim());

      const sb = requireSupabase();
      await getAuthedUser();

      const { error: uErr } = await sb
        .from('cases')
        .update({
          process_number: res.numero_cnj || processNumber.trim(),
          datajud_last_movement_text: res.ultima_movimentacao.texto || 'Sem movimentação disponível no Escavador.',
          datajud_last_movement_at: res.ultima_movimentacao.data,
          datajud_last_checked_at: new Date().toISOString(),
        })
        .eq('id', caseId);

      if (uErr) throw new Error(uErr.message);
      await load();
      setActionMsg({ type: 'ok', text: 'Movimentação atualizada via Escavador.' });
      setChecking(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao consultar Escavador.');
      setActionMsg(null);
      setChecking(false);
    }
  }

  async function createPixBilling() {
    if (!row) return;

    const amountValue = parseMoneyInput(billingAmount);
    if (amountValue === null || amountValue <= 0) {
      setError('Informe um valor válido para a cobrança. Ex.: 350,00');
      return;
    }

    const client = getCaseClients(row).find((item) => item.whatsapp);
    if (!client?.whatsapp) {
      setActionMsg({ type: 'err', text: 'Nenhum cliente com WhatsApp cadastrado neste caso.' });
      return;
    }

    setBillingSending(true);
    setError(null);
    setActionMsg(null);

    let billingCreated = false;

    try {
      const sb = requireSupabase();
      const user = await getAuthedUser();
      const amountCents = Math.round(amountValue * 100);
      const today = new Date().toISOString().slice(0, 10);
      const amountLabel = amountValue.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      const { error: insertErr } = await sb.from('finance_transactions').insert({
        user_id: user.id,
        type: 'income',
        status: 'planned',
        occurred_on: today,
        due_date: today,
        description: `Honorários do caso: ${row.title}`,
        amount_cents: amountCents,
        payment_method: 'pix',
        notes: `Cobrança PIX automática. Chave: ${OFFICE_PIX_KEY}`,
        client_id: client.id,
        case_id: row.id,
      });

      if (insertErr) throw new Error(insertErr.message);
      billingCreated = true;

      await notifyClientBilling(client.whatsapp, client.name, amountLabel, OFFICE_PIX_KEY);

      setBillingModalOpen(false);
      setBillingAmount('');
      setActionMsg({ type: 'ok', text: 'Cobrança gerada e enviada por WhatsApp!' });
      await load();
    } catch (err: any) {
      const message = err?.message || 'Falha ao gerar cobrança PIX.';
      setError(billingCreated ? `Cobrança criada, mas o WhatsApp falhou: ${message}` : message);
    } finally {
      setBillingSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Caso</h1>
          <p className="text-sm text-white/60">Detalhes (Supabase).</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            disabled={loading || billingSending}
            onClick={() => {
              setBillingModalOpen(true);
              setError(null);
              setActionMsg(null);
            }}
            className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-500/30 disabled:opacity-50"
          >
            <DollarSign size={16} />
            Gerar Cobrança Pix
          </button>
          <button
            disabled={wppSending}
            onClick={async () => {
              if (!row) return;
              const first = getCaseClients(row).find((c) => c.whatsapp);
              if (!first?.whatsapp) { setActionMsg({ type: 'err', text: 'Nenhum cliente com WhatsApp cadastrado neste caso.' }); return; }
              setWppSending(true); setActionMsg(null);
              try {
                await notifyClientCaseUpdate(first.whatsapp, first.name, row.title);
                setActionMsg({ type: 'ok', text: `Notificação enviada para ${first.name}!` });
              } catch (err: any) {
                setActionMsg({ type: 'err', text: err?.message || 'Falha ao enviar WhatsApp.' });
              } finally { setWppSending(false); }
            }}
            className="flex items-center gap-2 rounded-lg border border-green-400/30 bg-green-500/20 px-4 py-2 text-sm font-medium text-green-200 transition-colors hover:bg-green-500/30 disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            {wppSending ? 'Enviando…' : 'Notificar Cliente (WPP)'}
          </button>
          <Link to={`/app/tarefas/kanban?new=1&caseId=${caseId || ''}`} className="btn-primary !rounded-lg !px-4 !py-2 !text-sm flex items-center gap-2">
            <span className="text-lg leading-none">+</span> Nova Tarefa
          </Link>
          <Link to="/app/casos" className="btn-ghost">
            Voltar
          </Link>
        </div>
      </div>

      {actionMsg ? (
        <div className={`text-sm ${actionMsg.type === 'ok' ? 'text-green-200' : 'text-red-200'}`}>{actionMsg.text}</div>
      ) : null}

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      <Card>
        {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}

        {!loading && row ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs text-white/50">Título</div>
                <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <button onClick={() => void saveCase()} disabled={saving} className="btn-primary">
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-white/80">
                Status
                <input className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value)} />
              </label>
              <div>
                <div className="text-sm text-white/80">Clientes Vinculados</div>
                <div className="mt-2 flex flex-col gap-1">
                  {(() => {
                    const allCliMap = new Map<string, {id: string, name: string}>();
                    if (row.client?.[0]) allCliMap.set(row.client[0].id, row.client[0]);
                    row.case_clients?.forEach(cc => {
                      if (cc.client) allCliMap.set(cc.client.id, cc.client);
                    });
                    
                    const clientList = Array.from(allCliMap.values());
                    
                    if (clientList.length === 0) return <div className="text-sm text-white/70">—</div>;
                    
                    return clientList.map(c => (
                      <Link key={c.id} to={`/app/clientes/${c.id}`} className="link-accent text-sm">
                        {c.name}
                      </Link>
                    ));
                  })()}
                </div>
                <button
                  type="button"
                  className="mt-2 btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
                  onClick={() => setClientPickerOpen((v) => !v)}
                >
                  {clientPickerOpen ? 'Fechar' : 'Vincular / Alterar Cliente Principal'}
                </button>
                {clientPickerOpen ? (
                  <div className="mt-2 grid gap-2">
                    <select
                      className="select"
                      value={pickedClientId}
                      onChange={(e) => setPickedClientId(e.target.value)}
                    >
                      <option value="">— Nenhum —</option>
                      {allClients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      className="btn-primary w-fit"
                      disabled={savingClient}
                      onClick={() => void saveClientId()}
                    >
                      {savingClient ? 'Salvando...' : 'Confirmar'}
                    </button>
                  </div>
                ) : null}
              </div>

              <label className="text-sm text-white/80">
                Número do processo (CNJ)
                <input className="input mt-1" value={processNumber} onChange={(e) => setProcessNumber(e.target.value)} />
                <button onClick={() => void consultEscavador()} disabled={checking} className="mt-2 btn-primary !px-3 !py-1.5 !text-xs">
                  {checking ? 'Buscando...' : '🔍 Consultar Escavador'}
                </button>
              </label>

              <label className="text-sm text-white/80">
                Área
                <input className="input mt-1" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ex.: Previdenciário" />
              </label>

              <label className="text-sm text-white/80">
                Vara / Tribunal
                <input className="input mt-1" value={court} onChange={(e) => setCourt(e.target.value)} />
              </label>

              <label className="text-sm text-white/80">
                Comarca / Cidade
                <input className="input mt-1" value={district} onChange={(e) => setDistrict(e.target.value)} />
              </label>

              <label className="text-sm text-white/80">
                Data de distribuição
                <input className="input mt-1" type="date" value={distributedAt} onChange={(e) => setDistributedAt(e.target.value)} />
              </label>

              <label className="text-sm text-white/80">
                Responsável
                <select className="select mt-1" value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)}>
                  <option value="">Sem responsável</option>
                  {officeMembers.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name || m.email || m.user_id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-white/80">
                Valor da causa
                <input className="input mt-1" value={claimValue} onChange={(e) => setClaimValue(e.target.value)} placeholder="Ex.: 10.000,00" inputMode="decimal" />
                <div className="mt-1 text-xs text-white/50">Atual: {formatBRL(parseMoneyInput(claimValue) ?? row.claim_value)}</div>
              </label>
            </div>

            <label className="text-sm text-white/80">
              Descrição
              <textarea className="input mt-1 min-h-[92px]" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold text-white">Parte contrária (opcional)</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-sm text-white/80">
                  Nome
                  <input className="input mt-1" value={counterpartyName} onChange={(e) => setCounterpartyName(e.target.value)} />
                </label>
                <label className="text-sm text-white/80">
                  Documento
                  <input className="input mt-1" value={counterpartyDoc} onChange={(e) => setCounterpartyDoc(e.target.value)} />
                </label>
                <label className="text-sm text-white/80">
                  WhatsApp
                  <input
                    className="input mt-1"
                    value={counterpartyWhatsapp}
                    onChange={(e) => setCounterpartyWhatsapp(formatBrPhone(e.target.value))}
                    inputMode="tel"
                    placeholder="(00) 90000-0000"
                  />
                </label>
              </div>
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Escavador (consulta sob demanda)</div>
            <div className="text-xs text-white/60">Consulta por número CNJ e salva a última movimentação.</div>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-white/60">Última movimentação</div>
            <div className="mt-1 text-sm font-semibold text-white">{row?.datajud_last_movement_text || '—'}</div>
            <div className="mt-1 text-xs text-white/50">
              Mov.: {row?.datajud_last_movement_at ? new Date(row.datajud_last_movement_at).toLocaleString() : '—'} · Consultado em:{' '}
              {row?.datajud_last_checked_at ? new Date(row.datajud_last_checked_at).toLocaleString() : '—'}
            </div>
          </div>
        </div>
      </Card>

      {billingModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#11151c] p-5 shadow-[0_25px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-white">Gerar Cobrança Pix</div>
                <div className="mt-1 text-sm text-white/60">Informe o valor da parcela e dispare a cobrança para o cliente.</div>
              </div>
              <button className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => setBillingModalOpen(false)} disabled={billingSending}>
                Fechar
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="text-sm text-white/80">
                Valor (R$)
                <input
                  className="input mt-1"
                  value={billingAmount}
                  onChange={(e) => setBillingAmount(e.target.value)}
                  placeholder="Ex.: 350,00"
                  inputMode="decimal"
                />
              </label>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/50">Chave PIX do Escritório</div>
                <div className="mt-1 text-sm font-semibold text-amber-100">{OFFICE_PIX_KEY}</div>
                <div className="mt-2 text-xs text-white/50">Prévia: {formatBRL(parseMoneyInput(billingAmount))}</div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setBillingModalOpen(false)} disabled={billingSending}>
                Cancelar
              </button>
              <button className="btn-primary !bg-amber-500 !text-slate-950 hover:!bg-amber-400" onClick={() => void createPixBilling()} disabled={billingSending}>
                {billingSending ? 'Gerando...' : 'Confirmar Cobrança'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && row?.client_id ? <DocumentsSection clientId={row.client_id} caseId={row.id} /> : null}

      {!loading && row ? <TimelineSection caseId={row.id} clientId={row.client_id} /> : null}
    </div>
  );
}
