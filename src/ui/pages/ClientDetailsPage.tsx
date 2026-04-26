import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarPlus, DollarSign, Megaphone, MessageSquareText, SendHorizontal } from 'lucide-react';

import { Card } from '@/ui/widgets/Card';
import { DocumentsSection } from '@/ui/widgets/DocumentsSection';
import { ClientLinksSection } from '@/ui/widgets/ClientLinksSection';
import { TimelineSection } from '@/ui/widgets/TimelineSection';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import { generateClientDossier } from '@/lib/pdfGenerator';
import { buildProcuracaoData, generateDocumentDocx } from '@/lib/docGenerator';
import { apiFetch } from '@/lib/apiClient';
import { subscribeToPortalMessages } from '@/lib/clientPortal';
import { brlToCents, centsToBRL, loadClientTransactions, type FinanceTx } from '@/lib/finance';
import { getErrorMessage } from '@/lib/errors';

function extractSourceFromNotes(notes: string | null) {
  if (!notes) return null;
  const m = notes.match(/\[#origem:([^\]]+)\]/i);
  return m?.[1]?.trim()?.toLowerCase() || null;
}

function extractSourceTag(notes: string | null) {
  if (!notes) return '';
  return notes.match(/\[#origem:[^\]]+\]/i)?.[0] || '';
}

function cleanNotes(notes: string | null) {
  if (!notes) return null;
  return notes
    .replace(/\[#origem:[^\]]+\]\s*/gi, '')
    .replace(/Nacionalidade:\s*[^\n]+\n?/gi, '')
    .trim() || null;
}

function buildClientNotes(existingNotes: string | null, notice: string, nationality: string) {
  const parts = [extractSourceTag(existingNotes), notice.trim(), nationality.trim() ? `Nacionalidade: ${nationality.trim()}` : '']
    .filter(Boolean);
  return parts.length ? parts.join('\n') : null;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function mergeClientMessages(current: ClientMessageRow[], incoming: ClientMessageRow) {
  if (current.some((item) => item.id === incoming.id)) return current;
  return [...current, incoming].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

type ClientRow = {
  id: string;
  name: string;
  birth_date: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  notes: string | null;
  user_id: string | null;
  created_at: string;
  cpf: string | null;
  rg: string | null;
  profession: string | null;
  civil_status: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_cep: string | null;
  portal_pin?: string | null;
  office_id?: string | null;
};

type CaseLite = {
  id: string;
  title: string;
  status: string;
  process_number: string | null;
  area: string | null;
  created_at: string;
};

type ClientMessageRow = {
  id: string;
  sender: string;
  content: string;
  created_at: string;
};

export function ClientDetailsPage() {
  const { clientId } = useParams();
  const [row, setRow] = useState<ClientRow | null>(null);
  const [cases, setCases] = useState<CaseLite[]>([]);
  const [clientTransactions, setClientTransactions] = useState<FinanceTx[]>([]);
  const [createdByLabel, setCreatedByLabel] = useState<string>('—');
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [generatingDocx, setGeneratingDocx] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('PROCURAÇÃO.docx');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [notes, setNotes] = useState('');
  const [cpf, setCpf] = useState('');
  const [rg, setRg] = useState('');
  const [civilStatus, setCivilStatus] = useState('');
  const [profession, setProfession] = useState('');
  const [nationality, setNationality] = useState('');

  // Portal PIN
  const [portalPin, setPortalPin] = useState('');
  const [portalNoticeSaving, setPortalNoticeSaving] = useState(false);
  const [portalMessages, setPortalMessages] = useState<ClientMessageRow[]>([]);
  const [portalMessagesLoading, setPortalMessagesLoading] = useState(false);
  const [portalReply, setPortalReply] = useState('');
  const [portalReplySaving, setPortalReplySaving] = useState(false);
  const portalMessagesWrapRef = useRef<HTMLDivElement | null>(null);

  function extractNationality(notes: string | null) {
    if (!notes) return '';
    const m = notes.match(/Nacionalidade:\s*([^\n]+)/i);
    return m?.[1]?.trim() || '';
  }
  const [feesModalOpen, setFeesModalOpen] = useState(false);
  const [feesSaving, setFeesSaving] = useState(false);
  const [feeDescription, setFeeDescription] = useState('');
  const [feeTotal, setFeeTotal] = useState('');
  const [feeInstallments, setFeeInstallments] = useState(1);
  const [feeFirstDueDate, setFeeFirstDueDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [agendaModalOpen, setAgendaModalOpen] = useState(false);
  const [agendaSaving, setAgendaSaving] = useState(false);
  const [agendaTitle, setAgendaTitle] = useState('');
  const [agendaDate, setAgendaDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [agendaTime, setAgendaTime] = useState('09:00');

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setTxLoading(true);
        setPortalMessagesLoading(true);
        setError(null);
        if (!clientId) throw new Error('Cliente inválido.');

        const sb = requireSupabase();
        await getAuthedUser();

        const [c1, c2, tx, messagesRes] = await Promise.all([
          sb.from('clients').select('id,name,birth_date,phone,whatsapp,email,notes,user_id,created_at,cpf,rg,profession,civil_status,address_street,address_number,address_complement,address_neighborhood,address_city,address_state,address_cep,portal_pin,office_id').eq('id', clientId).maybeSingle(),
          sb
            .from('cases')
            .select('id,title,status,process_number,area,created_at')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false }),
          loadClientTransactions(clientId),
          sb
            .from('client_messages')
            .select('id,sender,content,created_at')
            .eq('client_id', clientId)
            .order('created_at', { ascending: true }),
        ]);

        if (c1.error) throw new Error(c1.error.message);
        if (c2.error) throw new Error(c2.error.message);
        if (messagesRes.error) throw new Error(messagesRes.error.message);

        if (!alive) return;
        const client = c1.data || null;
        setRow(client);
        setName(client?.name || '');
        setPhone(client?.phone || '');
        setWhatsapp(client?.whatsapp || '');
        setEmail(client?.email || '');
        setBirthDate(client?.birth_date || '');
        setNotes(cleanNotes(client?.notes) || '');
        setCpf(client?.cpf || '');
        setRg(client?.rg || '');
        setCivilStatus(client?.civil_status || '');
        setProfession(client?.profession || '');
        setNationality(extractNationality(client?.notes || ''));
        setCases((c2.data || []) as CaseLite[]);
        setPortalPin(client?.portal_pin || '');
        setClientTransactions(tx || []);
        setPortalMessages((messagesRes.data || []) as ClientMessageRow[]);

        if (client?.user_id) {
          const p = await sb
            .from('user_profiles')
            .select('display_name,email,user_id')
            .eq('user_id', client.user_id)
            .maybeSingle();
          if (!p.error && p.data) {
            setCreatedByLabel(p.data.display_name || p.data.email || p.data.user_id || client.user_id);
          } else {
            setCreatedByLabel(client.user_id);
          }
        } else {
          setCreatedByLabel('—');
        }

        setLoading(false);
        setTxLoading(false);
        setPortalMessagesLoading(false);
      } catch (err: unknown) {
        if (!alive) return;
        setError(getErrorMessage(err, 'Falha ao carregar.'));
        setLoading(false);
        setTxLoading(false);
        setPortalMessagesLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [clientId]);

  async function handleSendWhatsApp() {
    if (!row?.whatsapp) return;
    const msg = prompt('Mensagem para enviar via WhatsApp:');
    if (!msg) return;
    try {
      await apiFetch('/api/messages/send', {
        method: 'POST',
        body: JSON.stringify({
          officeId: row.office_id,
          clientId: row.id,
          channel: 'whatsapp',
          text: msg,
        }),
      });
      alert('✅ Mensagem enviada com sucesso!');
    } catch (err: unknown) {
      const message = err instanceof Error ? getErrorMessage(err, 'Erro') : 'Falha ao enviar WhatsApp.';
      alert(`❌ Erro: ${message}`);
    }
  }

  async function onSave() {
    if (!clientId) return;
    setSaving(true);
    setError(null);
    try {
      const sb = requireSupabase();
      const notesWithNationality = buildClientNotes(row?.notes || null, notes, nationality);
      const { error: updateErr } = await sb
        .from('clients')
        .update({
          name: name.trim(),
          phone: phone.trim() || null,
          whatsapp: whatsapp.trim() || null,
          email: email.trim() || null,
          birth_date: birthDate || null,
          notes: notesWithNationality,
          cpf: cpf.trim() || null,
          rg: rg.trim() || null,
          civil_status: civilStatus.trim() || null,
          profession: profession.trim() || null,
          portal_pin: portalPin.trim() || null,
        })
        .eq('id', clientId);
      if (updateErr) throw new Error(updateErr.message);

      setRow(prev => prev ? {
        ...prev,
        name: name.trim(),
        phone: phone.trim() || null,
        whatsapp: whatsapp.trim() || null,
        email: email.trim() || null,
        birth_date: birthDate || null,
        notes: notesWithNationality,
        cpf: cpf.trim() || null,
        rg: rg.trim() || null,
        civil_status: civilStatus.trim() || null,
        profession: profession.trim() || null,
      } : prev);
      setEditing(false);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Falha ao salvar'));
    } finally {
      setSaving(false);
    }
  }

  function formatDueDate(value: string | null) {
    if (!value) return '—';
    return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
  }

  function formatBirthDate(value: string | null) {
    if (!value) return '—';
    return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
  }

  function addMonths(dateIso: string, months: number) {
    const dt = new Date(`${dateIso}T00:00:00`);
    dt.setMonth(dt.getMonth() + months);
    return dt.toISOString().slice(0, 10);
  }

  async function refreshClientTx() {
    if (!clientId) return;
    setTxLoading(true);
    try {
      const tx = await loadClientTransactions(clientId);
      setClientTransactions(tx);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao carregar honorários.'));
    } finally {
      setTxLoading(false);
    }
  }

  async function refreshPortalMessages() {
    if (!clientId) return;
    setPortalMessagesLoading(true);
    try {
      const sb = requireSupabase();
      await getAuthedUser();
      const { data, error: messagesError } = await sb
        .from('client_messages')
        .select('id,sender,content,created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true });
      if (messagesError) throw new Error(messagesError.message);
      setPortalMessages((data || []) as ClientMessageRow[]);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao carregar mensagens do portal.'));
    } finally {
      setPortalMessagesLoading(false);
    }
  }

  async function handleSavePortalNotice() {
    if (!clientId) return;
    setPortalNoticeSaving(true);
    setError(null);
    try {
      const sb = requireSupabase();
      const nextNotes = buildClientNotes(row?.notes || null, notes, nationality);
      const { error: updateErr } = await sb
        .from('clients')
        .update({ notes: nextNotes })
        .eq('id', clientId);
      if (updateErr) throw new Error(updateErr.message);

      setRow((prev) => (prev ? { ...prev, notes: nextNotes } : prev));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao salvar aviso do portal.'));
    } finally {
      setPortalNoticeSaving(false);
    }
  }

  async function handleSendPortalReply() {
    if (!clientId || !portalReply.trim()) return;
    setPortalReplySaving(true);
    setError(null);
    try {
      const sb = requireSupabase();
      await getAuthedUser();
      const { error: insertErr } = await sb.from('client_messages').insert({
        client_id: clientId,
        sender: 'office',
        content: portalReply.trim(),
      });
      if (insertErr) throw new Error(insertErr.message);
      setPortalReply('');
      await refreshPortalMessages();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao enviar resposta no portal.'));
    } finally {
      setPortalReplySaving(false);
    }
  }

  useEffect(() => {
    if (!clientId) return;

    return subscribeToPortalMessages(clientId, (incoming) => {
      setPortalMessages((current) => mergeClientMessages(current, incoming));
    });
  }, [clientId]);

  useEffect(() => {
    const container = portalMessagesWrapRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [portalMessages]);

  const lastPortalMessage = useMemo(
    () => (portalMessages.length ? portalMessages[portalMessages.length - 1] : null),
    [portalMessages],
  );

  const waitingOfficeReply = lastPortalMessage?.sender === 'client';
  const clientMessagesCount = useMemo(
    () => portalMessages.filter((message) => message.sender === 'client').length,
    [portalMessages],
  );

  async function handleLaunchAgenda() {
    if (!clientId) return;
    if (!agendaTitle.trim()) { setError('Informe o título do agendamento.'); return; }
    if (!agendaDate) { setError('Informe a data.'); return; }
    
    setAgendaSaving(true);
    setError(null);
    try {
      const sb = requireSupabase();
      const user = await getAuthedUser();
      if (!row?.office_id) throw new Error('Office não encontrado');

      const fullDatetime = new Date(`${agendaDate}T${agendaTime}:00`).toISOString();

      const { error: iErr } = await sb.from('agenda').insert({
        office_id: row.office_id,
        created_by: user.id,
        client_id: clientId,
        title: agendaTitle.trim(),
        start_time: fullDatetime,
        end_time: fullDatetime,
      });

      if (iErr) throw new Error(iErr.message);

      setAgendaModalOpen(false);
      setAgendaTitle('');
      alert('Agendamento salvo com sucesso!');
    } catch (err: unknown) {
      setError(getErrorMessage(err, String(err)));
    } finally {
      setAgendaSaving(false);
    }
  }

  async function handleLaunchFees() {
    if (!clientId) return;

    const description = feeDescription.trim();
    if (!description) {
      setError('Informe a descrição dos honorários.');
      return;
    }

    const totalCents = brlToCents(feeTotal);
    if (totalCents === null || totalCents <= 0) {
      setError('Informe um valor total válido. Ex.: 1500,00');
      return;
    }

    if (!feeFirstDueDate) {
      setError('Informe a data da primeira parcela.');
      return;
    }

    if (feeInstallments < 1 || feeInstallments > 12) {
      setError('Número de parcelas deve ser entre 1 e 12.');
      return;
    }

    setFeesSaving(true);
    setError(null);

    try {
      const sb = requireSupabase();
      const user = await getAuthedUser();
      const occurredOn = new Date().toISOString().slice(0, 10);
      const baseAmount = Math.floor(totalCents / feeInstallments);
      const remainder = totalCents - baseAmount * feeInstallments;

      for (let idx = 0; idx < feeInstallments; idx += 1) {
        const installmentCents = baseAmount + (idx < remainder ? 1 : 0);
        const dueDate = addMonths(feeFirstDueDate, idx);
        const installmentLabel = feeInstallments > 1 ? ` (${idx + 1}/${feeInstallments})` : '';

        const { error: insertErr } = await sb.from('finance_transactions').insert({
          user_id: user.id,
          type: 'income',
          status: 'planned',
          occurred_on: occurredOn,
          due_date: dueDate,
          description: `${description}${installmentLabel}`,
          amount_cents: installmentCents,
          payment_method: null,
          notes: 'Honorários lançados na ficha do cliente.',
          client_id: clientId,
        });

        if (insertErr) throw new Error(insertErr.message);
      }

      await refreshClientTx();
      setFeesModalOpen(false);
      setFeeDescription('');
      setFeeTotal('');
      setFeeInstallments(1);
      setFeeFirstDueDate(new Date().toISOString().slice(0, 10));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao lançar honorários.'));
    } finally {
      setFeesSaving(false);
    }
  }



  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Cliente</h1>
          <p className="text-sm text-white/60">Detalhes (Supabase).</p>
        </div>
        <div className="flex items-center gap-2">
          {row && (
            <button
              disabled={exportingPdf}
              onClick={() => {
                setExportingPdf(true);
                try {
                  generateClientDossier(
                    {
                      name: row.name,
                      phone: row.phone,
                      whatsapp: row.whatsapp,
                      email: row.email,
                      notes: row.notes,
                      created_at: row.created_at,
                    },
                    cases,
                  );
                } finally {
                  setExportingPdf(false);
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition
                         bg-gradient-to-r from-yellow-600 to-yellow-500 text-black
                         hover:from-yellow-500 hover:to-yellow-400
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportingPdf ? 'Gerando…' : 'Exportar Dossiê (PDF)'}
            </button>
          )}
          {row && (
            <div className="flex items-center gap-2">
              <select 
                className="input !py-2 !px-3 !text-sm bg-neutral-900 border-white/10"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                disabled={generatingDocx}
              >
                <option value="PROCURAÇÃO.docx">Procuração Ad Judicia</option>
                <option value="CONTRATO_MODELO_AUX_POR_INCAP_TEMPORARIA.docx">Contrato - Auxílio Doença</option>
                <option value="CONTRATO_MODELO_BPC-LOAS.docx">Contrato - BPC / LOAS</option>
                <option value="CONTRATO_MODELO_RECLAMAÇÃO_TRABALHISTA.docx">Contrato - Trabalhista</option>
              </select>
              <button
                disabled={generatingDocx}
                onClick={async () => {
                  if (!row) return;
                  setGeneratingDocx(true);
                  try {
                    const data = buildProcuracaoData(row);
                    await generateDocumentDocx(data, selectedTemplate);
                  } catch (err: unknown) {
                    alert(getErrorMessage(err, 'Falha ao gerar documento.'));
                  } finally {
                    setGeneratingDocx(false);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition
                           bg-gradient-to-r from-sky-600 to-sky-500 text-white
                           hover:from-sky-500 hover:to-sky-400
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
                {generatingDocx ? 'Gerando…' : 'Gerar'}
              </button>
            </div>
          )}
          <Link to="/app/clientes" className="btn-ghost">
            Voltar
          </Link>
        </div>
      </div>

      <Card>
        {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}
        {error ? <div className="text-sm text-red-200">{error}</div> : null}

        {!loading && !error && row ? (
          <div className="grid gap-3">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                {editing ? (
                  <div className="grid gap-4 mb-4">
                    <label className="text-sm text-white/80">
                      Nome
                      <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                    </label>
                    <div className="grid gap-3 md:grid-cols-3">
                                          <label className="text-sm text-white/80">
                                            Senha do Portal (PIN)
                                            <input
                                              className="input"
                                              value={portalPin}
                                              onChange={(e) => setPortalPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                              placeholder="PIN numérico (até 6 dígitos)"
                                              inputMode="numeric"
                                              maxLength={6}
                                            />
                                            <span className="text-xs text-white/50">Defina ou altere a senha numérica do portal do cliente.</span>
                                          </label>
                      <label className="text-sm text-white/80">
                        Telefone
                        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
                      </label>
                      <label className="text-sm text-white/80">
                        WhatsApp
                        <input className="input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                      </label>
                      <label className="text-sm text-white/80">
                        E-mail
                        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
                      </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="text-sm text-white/80">
                        CPF
                        <input className="input" value={cpf} onChange={(e) => setCpf(e.target.value)} />
                      </label>
                      <label className="text-sm text-white/80">
                        RG
                        <input className="input" value={rg} onChange={(e) => setRg(e.target.value)} />
                      </label>
                      <label className="text-sm text-white/80">
                        Data de Nascimento
                        <input type="date" className="input" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                      </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="text-sm text-white/80">
                        Estado Civil
                        <select className="input" value={civilStatus} onChange={(e) => setCivilStatus(e.target.value)}>
                          <option value="">—</option>
                          <option value="Solteiro(a)">Solteiro(a)</option>
                          <option value="Casado(a)">Casado(a)</option>
                          <option value="Divorciado(a)">Divorciado(a)</option>
                          <option value="Viúvo(a)">Viúvo(a)</option>
                          <option value="União Estável">União Estável</option>
                          <option value="Outro">Outro</option>
                        </select>
                      </label>
                      <label className="text-sm text-white/80">
                        Profissão
                        <input className="input" value={profession} onChange={(e) => setProfession(e.target.value)} />
                      </label>
                      <label className="text-sm text-white/80">
                        Nacionalidade
                        <input className="input" value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="Ex.: Brasileira" />
                      </label>
                    </div>
                    <label className="text-sm text-white/80">
                      Observações
                      <textarea className="input min-h-[100px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </label>
                    <div className="flex gap-2 mt-2">
                      <button onClick={onSave} disabled={saving} className="btn-primary">
                        {saving ? 'Salvando...' : 'Salvar Alterações'}
                      </button>
                      <button onClick={() => {
                        setEditing(false);
                        setName(row.name);
                        setPhone(row.phone || '');
                        setWhatsapp(row.whatsapp || '');
                        setEmail(row.email || '');
                        setBirthDate(row.birth_date || '');
                        setNotes(cleanNotes(row.notes) || '');
                        setCpf(row.cpf || '');
                        setRg(row.rg || '');
                        setCivilStatus(row.civil_status || '');
                        setProfession(row.profession || '');
                        setNationality(extractNationality(row.notes || ''));
                      }} disabled={saving} className="btn-ghost">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="text-xs text-white/50">Nome</div>
                      <div className="text-lg font-semibold text-white">{row.name}</div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3 mt-3">
                      <div>
                        <div className="text-xs text-white/50">Telefone</div>
                        <div className="text-sm text-white/80">{row.phone || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-white/50">WhatsApp</div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white/80">{row.whatsapp || '—'}</span>
                          {row.whatsapp && (
                            <button
                              onClick={() => void handleSendWhatsApp()}
                              className="inline-flex items-center gap-1 rounded-lg bg-green-600/20 px-2 py-0.5 text-xs font-medium text-green-300 hover:bg-green-600/40 transition"
                            >
                              💬 Zap
                            </button>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-white/50">E-mail</div>
                        <div className="text-sm text-white/80">{row.email || '—'}</div>
                        <div className="mt-1 text-xs text-white/50">Data de Nascimento</div>
                        <div className="text-sm text-white/80">{formatBirthDate(row.birth_date)}</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-xs text-white/50">Observações</div>
                      <div className="text-sm text-white/80 whitespace-pre-wrap">{cleanNotes(row.notes) || '—'}</div>
                    </div>
                  </>
                )}
              </div>
              
              {!editing && (
                <button onClick={() => setEditing(true)} className="btn-ghost !px-3 !py-1.5 text-xs">
                  Editar Cliente
                </button>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 mt-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Origem do cadastro</div>
              <div className="mt-2 grid gap-2 text-sm text-white/80 md:grid-cols-3">
                <div>
                  <span className="text-white/50">Canal:</span>{' '}
                  <strong>{extractSourceFromNotes(row.notes) || 'não informado'}</strong>
                </div>
                <div>
                  <span className="text-white/50">Cadastrado por:</span>{' '}
                  <strong>{createdByLabel}</strong>
                </div>
                <div>
                  <span className="text-white/50">Quando:</span>{' '}
                  <strong>{new Date(row.created_at).toLocaleString()}</strong>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {!loading && !error && !row ? <div className="text-sm text-white/70">Não encontrado.</div> : null}
      </Card>

      {!loading && !error && row ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Ações rápidas</div>
              <div className="text-xs text-white/60">Atalhos para operar o portal e o relacionamento com este cliente.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setAgendaModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300">
                <CalendarPlus className="h-4 w-4" />
                Agendar Reunião
              </button>
              <button onClick={() => setFeesModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20">
                <DollarSign className="h-4 w-4" />
                Adicionar Cobrança
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      {!loading && !error && row ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Megaphone className="h-4 w-4 text-amber-300" />
                Mural / Aviso
              </div>
              <div className="mt-1 text-xs text-white/60">Este texto aparece no bloco "Aviso do Advogado" dentro do portal do cliente.</div>
            </div>
            <button
              type="button"
              onClick={() => void handleSavePortalNotice()}
              disabled={portalNoticeSaving}
              className="btn-primary !rounded-lg !px-3 !py-1.5 !text-xs"
            >
              {portalNoticeSaving ? 'Salvando...' : 'Salvar Aviso'}
            </button>
          </div>
          <textarea
            className="input mt-4 min-h-[120px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Escreva aqui o aviso que o cliente verá no portal."
          />
        </Card>
      ) : null}

      {!loading && !error && row ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <MessageSquareText className="h-4 w-4 text-sky-300" />
                Chat do Portal
              </div>
              <div className="mt-1 text-xs text-white/60">Mensagens trocadas pelo cliente no portal. As respostas do escritório ficam salvas no histórico.</div>
            </div>
            <button
              type="button"
              onClick={() => void refreshPortalMessages()}
              disabled={portalMessagesLoading}
              className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
            >
              {portalMessagesLoading ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              {portalMessages.length} mensagem{portalMessages.length === 1 ? '' : 'ens'} no histórico
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              {clientMessagesCount} enviada{clientMessagesCount === 1 ? '' : 's'} pelo cliente
            </span>
            <span className={`rounded-full px-3 py-1 text-xs ${waitingOfficeReply ? 'border border-amber-300/30 bg-amber-400/10 text-amber-100' : 'border border-emerald-300/20 bg-emerald-400/10 text-emerald-100'}`}>
              {waitingOfficeReply ? 'Cliente aguardando resposta' : 'Sem resposta pendente'}
            </span>
            {lastPortalMessage ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
                Última atividade: {new Date(lastPortalMessage.created_at).toLocaleString('pt-BR')}
              </span>
            ) : null}
          </div>

          <div ref={portalMessagesWrapRef} className="mt-4 max-h-[420px] space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-4">
            {portalMessagesLoading ? <div className="text-sm text-white/60">Carregando mensagens...</div> : null}
            {!portalMessagesLoading && portalMessages.length === 0 ? (
              <div className="text-sm text-white/60">Nenhuma mensagem trocada pelo portal ainda.</div>
            ) : null}
            {portalMessages.map((message) => {
              const fromClient = message.sender === 'client';
              return (
                <div key={message.id} className={`flex ${fromClient ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${fromClient ? 'bg-white/10 text-white/85' : 'bg-amber-400/15 text-amber-50'}`}>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/50">
                      {fromClient ? row.name : 'Advogado'}
                    </div>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                    <div className="mt-2 text-[11px] text-white/40">{new Date(message.created_at).toLocaleString('pt-BR')}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <form
            className="mt-4 grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await handleSendPortalReply();
            }}
          >
            <textarea
              className="input min-h-[110px]"
              value={portalReply}
              onChange={(e) => setPortalReply(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!portalReplySaving && portalReply.trim()) {
                    await handleSendPortalReply();
                  }
                }
              }}
              placeholder="Responder como advogado...\n\nPressione Enter para enviar e Shift+Enter para quebrar linha."
              disabled={portalReplySaving}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-white/50">
                As novas mensagens do cliente entram aqui em tempo real enquanto esta ficha estiver aberta.
              </div>
              <button
                type="submit"
                disabled={portalReplySaving || !portalReply.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <SendHorizontal className="h-4 w-4" />
                {portalReplySaving ? 'Enviando...' : 'Enviar Resposta'}
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Casos do cliente</div>
            <div className="text-xs text-white/60">Vinculados pelo client_id</div>
          </div>
          <div className="flex items-center gap-2">
            {clientId ? (
              <Link to={`/app/casos?new=1&clientId=${clientId}`} className="btn-primary !rounded-lg !px-3 !py-1.5 !text-xs">
                Novo caso
              </Link>
            ) : null}
            <Link to="/app/casos" className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
              Ver todos
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {loading ? null : null}
          {!loading && cases.length === 0 ? <div className="text-sm text-white/60">Nenhum caso vinculado.</div> : null}
          {cases.map((c) => (
            <Link
              key={c.id}
              to={`/app/casos/${c.id}`}
              className="rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="text-sm font-semibold text-white">{c.title}</div>
                <span className="badge">{c.status}</span>
              </div>
              <div className="mt-1 text-xs text-white/50">
                {c.process_number ? `CNJ: ${c.process_number}` : 'CNJ: —'}
                {c.area ? ` · ${c.area}` : ''}
              </div>
            </Link>
          ))}
        </div>
      </Card>

      {clientId ? (
        <Card>
          <ClientLinksSection clientId={clientId} />
        </Card>
      ) : null}

      {clientId ? (
        <Card>
          <DocumentsSection clientId={clientId} />
        </Card>
      ) : null}

      {clientId ? <TimelineSection clientId={clientId} /> : null}

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Honorários e Parcelas</div>
            <div className="text-xs text-white/60">Lançamentos financeiros vinculados ao cliente</div>
          </div>
          <button
            onClick={() => {
              setFeesModalOpen(true);
              setError(null);
            }}
            className="btn-primary !rounded-lg !px-3 !py-1.5 !text-xs"
          >
            Lançar Honorários
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {txLoading ? <div className="text-sm text-white/60">Carregando honorários...</div> : null}
          {!txLoading && clientTransactions.length === 0 ? <div className="text-sm text-white/60">Nenhum lançamento financeiro para este cliente.</div> : null}
          {!txLoading && clientTransactions.map((tx) => {
            const paid = tx.status === 'paid';
            return (
              <div key={tx.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs text-white/50">Vencimento</div>
                    <div className="text-sm text-white/90">{formatDueDate(tx.due_date)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50">Valor</div>
                    <div className="text-sm font-semibold text-white">{centsToBRL(tx.amount_cents)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50">Status</div>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${paid ? 'bg-green-500/20 text-green-200' : 'bg-amber-500/20 text-amber-200'}`}>
                      {paid ? 'Pago' : 'Pendente'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {agendaModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Agendar Reunião</h2>
              <button onClick={() => !agendaSaving && setAgendaModalOpen(false)} className="rounded-md px-2 py-1 text-sm text-white/70 hover:bg-white/10">
                Fechar
              </button>
            </div>
            <div className="grid gap-4">
              <label className="block text-sm text-white/80">
                Título / Assunto
                <input type="text" className="input mt-1" value={agendaTitle} onChange={(e) => setAgendaTitle(e.target.value)} placeholder="Ex: Reunião Inicial" disabled={agendaSaving} />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm text-white/80">
                  Data
                  <input type="date" className="input mt-1" value={agendaDate} onChange={(e) => setAgendaDate(e.target.value)} disabled={agendaSaving} />
                </label>
                <label className="block text-sm text-white/80">
                  Hora
                  <input type="time" className="input mt-1" value={agendaTime} onChange={(e) => setAgendaTime(e.target.value)} disabled={agendaSaving} />
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setAgendaModalOpen(false)} disabled={agendaSaving} className="btn-ghost !px-3 !py-1.5 text-xs">
                Cancelar
              </button>
              <button onClick={() => void handleLaunchAgenda()} disabled={agendaSaving} className="btn-primary !px-3 !py-1.5 text-xs">
                {agendaSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {feesModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Lançar Honorários</h2>
              <button
                onClick={() => !feesSaving && setFeesModalOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-white/70 hover:bg-white/10"
              >
                Fechar
              </button>
            </div>

            <div className="grid gap-3">
              <label className="text-sm text-white/80">
                Descrição
                <input
                  className="input"
                  value={feeDescription}
                  onChange={(e) => setFeeDescription(e.target.value)}
                  placeholder="Ex.: Honorários iniciais do atendimento"
                />
              </label>

              <label className="text-sm text-white/80">
                Valor Total
                <input
                  className="input"
                  value={feeTotal}
                  onChange={(e) => setFeeTotal(e.target.value)}
                  placeholder="Ex.: 1500,00"
                />
              </label>

              <label className="text-sm text-white/80">
                Número de Parcelas
                <select
                  className="input"
                  value={feeInstallments}
                  onChange={(e) => setFeeInstallments(Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}x
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-white/80">
                Data da Primeira Parcela
                <input
                  type="date"
                  className="input"
                  value={feeFirstDueDate}
                  onChange={(e) => setFeeFirstDueDate(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setFeesModalOpen(false)}
                disabled={feesSaving}
                className="btn-ghost !px-3 !py-1.5 text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleLaunchFees()}
                disabled={feesSaving}
                className="btn-primary !px-3 !py-1.5 text-xs"
              >
                {feesSaving ? 'Lançando...' : 'Salvar Parcelas'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
