import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCopy, Download, Eye, FileText, Loader2, Pencil, Send, Trash2, X } from 'lucide-react';

import { brlToCents, centsToBRL } from '@/lib/finance';
import { loadClientsLite } from '@/lib/loadClientsLite';
import { createClientQuick } from '@/lib/clients';
import { getMyOfficeRole, isCollaboratorRole } from '@/lib/roles';
import { createReceiptSecure, deleteReceiptSecure, listReceipts, updateReceiptSecure, updateReceiptStatusPdf, type Receipt } from '@/lib/receipts';
import { buildReceiptHtml, buildReceiptPdfBlob } from '@/lib/receiptPdf';
import { valorExtenso } from '@/lib/money';
import { getMyOfficeId } from '@/lib/officeContext';
import { supabase } from '@/lib/supabaseClient';
import type { ClientLite } from '@/lib/types';
import { Card } from '@/ui/widgets/Card';
import { cn } from '@/ui/utils/cn';

const OFFICE_NAME = 'Lima, Lopes & Diógenes Advogados';

const PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Transferência bancária', 'Cheque', 'Cartão de crédito', 'Boleto'];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function todayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function applyMoneyMask(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const n = Number(digits) / 100;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function normalizeSearchText(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function buildPaymentMethodLabel(args: {
  paymentMethod: string;
  cardInstallments: string;
  cardInstallmentAmount: string;
  totalAmountMasked: string;
}) {
  const method = args.paymentMethod || '';
  if (method !== 'Cartão de crédito') return method;

  const installments = Math.max(1, Number(args.cardInstallments || '1') || 1);
  if (installments <= 1) return method;

  const totalCents = brlToCents(args.totalAmountMasked || '') || 0;
  const autoInstallment = totalCents > 0
    ? (totalCents / installments / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    : '';

  const installmentAmount = (args.cardInstallmentAmount || autoInstallment || '').trim();
  return installmentAmount
    ? `${method} em ${installments}x de R$ ${installmentAmount}`
    : `${method} em ${installments}x`;
}

/* ─── Preview Modal ─── */
function PreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-white/80 p-1.5 text-black/60 hover:bg-white hover:text-black"
        >
          <X className="h-5 w-5" />
        </button>
        <iframe
          title="Preview do recibo"
          className="h-full w-full border-0"
          srcDoc={html}
        />
      </div>
    </div>
  );
}

/* ─── ClientSearch ─── */
function ClientSearch({
  clients,
  selectedId,
  query,
  onQueryChange,
  onSelect,
  onCreateClient,
  creating,
}: {
  clients: ClientLite[];
  selectedId: string | null;
  query: string;
  onQueryChange: (v: string) => void;
  onSelect: (c: ClientLite) => void;
  onCreateClient: () => Promise<void>;
  creating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = normalizeSearchText(query);
    if (!q) return [];

    const qDigits = q.replace(/\D/g, '');

    return clients
      .map(c => {
        const nameNorm = normalizeSearchText(c.name);
        const cpfDigits = (c.cpf || '').replace(/\D/g, '');
        const phoneDigits = (c.phone || '').replace(/\D/g, '');

        const nameStarts = nameNorm.startsWith(q);
        const nameHas = nameNorm.includes(q);
        const cpfHas = Boolean(qDigits) && cpfDigits.includes(qDigits);
        const phoneHas = Boolean(qDigits) && phoneDigits.includes(qDigits);

        const matched = nameHas || cpfHas || phoneHas;
        const score = nameStarts ? 0 : nameHas ? 1 : cpfHas ? 2 : phoneHas ? 3 : 99;

        return { c, matched, score, nameNorm };
      })
      .filter(item => item.matched)
      .sort((a, b) => (a.score - b.score) || a.nameNorm.localeCompare(b.nameNorm))
      .slice(0, 30)
      .map(item => item.c);
  }, [clients, query]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={cn(
          'w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-amber-400/40',
          selectedId && 'border-emerald-500/40',
        )}
        placeholder="Buscar por nome, CPF ou telefone…"
        value={query}
        autoComplete="off"
        onChange={e => {
          onQueryChange(e.target.value);
          setOpen(true);
          setHover(-1);
        }}
        onFocus={() => { if (query) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (matches.length > 0 || (query.trim() && matches.length === 0)) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 shadow-2xl">
          {matches.map((c, i) => (
            <button
              key={c.id}
              className={cn('flex w-full flex-col items-start px-4 py-2.5 text-left transition', hover === i ? 'bg-white/10' : 'hover:bg-white/5')}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(-1)}
              onClick={() => { onSelect(c); setOpen(false); }}
            >
              <span className="text-sm font-medium text-white">{c.name}</span>
              <span className="text-[11px] text-white/40">{[c.cpf, c.phone].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
          {query.trim() && matches.length === 0 && (
            <button
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-emerald-400 hover:bg-white/5 disabled:opacity-50"
              disabled={creating}
              onClick={() => void onCreateClient()}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : '+'}
              Criar cliente &ldquo;{query}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main ─── */

export function ReceiptsPage() {
  const [role, setRole] = useState('');
  const [rows, setRows] = useState<Receipt[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);

  // Form state
  const [clientQuery, setClientQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientLite | null>(null);
  const [creatingClient, setCreatingClient] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [cardInstallments, setCardInstallments] = useState('1');
  const [cardInstallmentAmount, setCardInstallmentAmount] = useState('');
  const [city, setCity] = useState('Fortaleza – CE');
  const [lawyerName, setLawyerName] = useState('');
  const [lawyerOab, setLawyerOab] = useState('');
  const [issuedAt, setIssuedAt] = useState(todayIsoLocal());

  const isCollaborator = isCollaboratorRole(role);
  const isAdmin = role === 'admin';

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [myRole, receiptsData, clientsData] = await Promise.all([
        getMyOfficeRole().catch(() => ''),
        listReceipts(100),
        loadClientsLite(),
      ]);
      setRole(myRole || '');
      setRows(receiptsData);
      setClients(clientsData);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao carregar recibos.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let monthly = 0, yearly = 0, total = 0;
    for (const r of rows) {
      const c = Math.round(Number(r.amount || 0) * 100);
      if (!Number.isFinite(c)) continue;
      total += c;
      const issued = new Date(r.issued_at);
      if (issued.getFullYear() === currentYear) {
        yearly += c;
        if (issued.getMonth() === currentMonth) monthly += c;
      }
    }
    return { monthly, yearly, total };
  }, [rows]);

  const effectivePaymentMethod = useMemo(
    () =>
      buildPaymentMethodLabel({
        paymentMethod,
        cardInstallments,
        cardInstallmentAmount,
        totalAmountMasked: amount,
      }),
    [paymentMethod, cardInstallments, cardInstallmentAmount, amount],
  );

  // Live preview of form
  const livePreviewHtml = useMemo(() => {
    if (!selectedClient) return null;
    const cents = brlToCents(amount);
    const amountNum = cents ? cents / 100 : 0;
    const draft: Receipt = {
      id: 'PREVIEW',
      office_id: '',
      client_id: selectedClient.id,
      created_by: '',
      amount: amountNum,
      description: description.trim() || null,
      status: 'rascunho',
      issued_at: `${issuedAt}T12:00:00.000Z`,
      pdf_url: null,
      created_at: new Date().toISOString(),
      payment_method: effectivePaymentMethod || null,
      city: city || null,
      lawyer_name: lawyerName || null,
      lawyer_oab: lawyerOab || null,
      amount_written: amountNum > 0 ? valorExtenso(amountNum) : null,
      client: { name: selectedClient.name, cpf: selectedClient.cpf },
    };
    return buildReceiptHtml({ receipt: draft, client: selectedClient, officeName: OFFICE_NAME });
  }, [selectedClient, amount, description, effectivePaymentMethod, city, lawyerName, lawyerOab, issuedAt]);

  async function handleCreateClient() {
    setCreatingClient(true);
    try {
      const officeId = await getMyOfficeId() || '';
      const newClient = await createClientQuick({ name: clientQuery, officeId });
      setClients(prev => [...prev, newClient]);
      setSelectedClient(newClient);
      setClientQuery(newClient.name);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Erro ao criar cliente.'));
    } finally {
      setCreatingClient(false);
    }
  }


  function resetForm() {
    setAmount('');
    setDescription('');
    setPaymentMethod('');
    setCardInstallments('1');
    setCardInstallmentAmount('');
    setClientQuery('');
    setSelectedClient(null);
    setIssuedAt(todayIsoLocal());
    setCity('Fortaleza – CE');
    setLawyerName('');
    setLawyerOab('');
    setEditingReceiptId(null);
  }

  function startEditReceipt(r: Receipt) {
    const existingClient = clients.find(c => c.id === r.client_id) || { id: r.client_id, name: r.client?.name || 'Cliente', cpf: r.client?.cpf || null, phone: null };
    setSelectedClient(existingClient);
    setClientQuery(existingClient.name || '');
    setAmount(Number(r.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setDescription(r.description || '');

    const pm = String(r.payment_method || '');
    const cardMatch = pm.match(/cart[aã]o de cr[eé]dito\s+em\s+(\d+)x(?:\s+de\s+R\$\s*([\d.,]+))?/i);
    if (cardMatch) {
      setPaymentMethod('Cartão de crédito');
      setCardInstallments(String(Math.max(1, Number(cardMatch[1] || '1'))));
      setCardInstallmentAmount(String(cardMatch[2] || '').trim());
    } else {
      setPaymentMethod(pm || '');
      setCardInstallments('1');
      setCardInstallmentAmount('');
    }

    setCity(r.city || 'Fortaleza – CE');
    setLawyerName(r.lawyer_name || '');
    setLawyerOab(r.lawyer_oab || '');
    setIssuedAt(String(r.issued_at || '').split('T')[0] || todayIsoLocal());
    setEditingReceiptId(r.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDeleteReceipt(id: string) {
    if (!isAdmin) return;
    if (!confirm('Deseja realmente excluir este recibo?')) return;

    setSaving(true);
    setError(null);
    try {
      await deleteReceiptSecure(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (editingReceiptId === id) resetForm();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao excluir recibo.'));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveReceipt() {
    if (!selectedClient) { setError('Selecione o cliente.'); return; }
    const cents = brlToCents(amount);
    if (cents === null || cents <= 0) { setError('Informe um valor válido maior que zero.'); return; }

    setSaving(true);
    setError(null);

    try {
      const officeId = await getMyOfficeId();
      if (!officeId) throw new Error('Escritório não encontrado.');
      if (!supabase) throw new Error('Supabase não configurado.');

      const amountNum = cents / 100;
      const amtWritten = valorExtenso(amountNum);

      const isEditing = Boolean(editingReceiptId);
      const receiptId = isEditing ? String(editingReceiptId) : await createReceiptSecure({
        clientId: selectedClient.id,
        amount: amountNum,
        description: description.trim() || null,
        issuedAt: `${issuedAt}T12:00:00.000Z`,
        paymentMethod: effectivePaymentMethod || null,
        city: city || null,
        lawyerName: lawyerName || null,
        lawyerOab: lawyerOab || null,
        amountWritten: amtWritten || null,
      });

      if (isEditing) {
        await updateReceiptSecure({
          id: receiptId,
          clientId: selectedClient.id,
          amount: amountNum,
          description: description.trim() || null,
          status: 'emitido',
          issuedAt: `${issuedAt}T12:00:00.000Z`,
          paymentMethod: effectivePaymentMethod || null,
          city: city || null,
          lawyerName: lawyerName || null,
          lawyerOab: lawyerOab || null,
          amountWritten: amtWritten || null,
        });
      }

      const localReceipt: Receipt = {
        id: receiptId,
        office_id: officeId,
        client_id: selectedClient.id,
        created_by: '',
        amount: amountNum,
        description: description.trim() || null,
        status: 'emitido',
        issued_at: `${issuedAt}T12:00:00.000Z`,
        pdf_url: null,
        created_at: new Date().toISOString(),
        payment_method: effectivePaymentMethod || null,
        city: city || null,
        lawyer_name: lawyerName || null,
        lawyer_oab: lawyerOab || null,
        amount_written: amtWritten || null,
        client: { name: selectedClient.name, cpf: selectedClient.cpf },
      };

      let pdfUrl: string | null = null;
      try {
        const pdfBlob = await buildReceiptPdfBlob({ receipt: localReceipt, client: selectedClient, officeName: OFFICE_NAME });
        const storagePath = `office/${officeId}/client/${selectedClient.id}/receipt-${receiptId}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(storagePath, pdfBlob, { upsert: true, contentType: 'application/pdf' });
        if (uploadError) throw new Error('Upload: ' + uploadError.message);
        const { data: urlData, error: urlError } = await supabase.storage
          .from('receipts')
          .createSignedUrl(storagePath, 31_536_000);
        if (urlError || !urlData?.signedUrl) throw new Error('URL assinada falhou.');
        pdfUrl = urlData.signedUrl;
        await updateReceiptStatusPdf({ id: receiptId, pdfUrl });
      } catch (pdfErr) {
        console.warn('PDF falhou (recibo salvo sem pdf_url):', pdfErr);
      }

      setRows(prev => {
        if (isEditing) {
          return prev.map((r) => (r.id === receiptId ? { ...localReceipt, pdf_url: pdfUrl || r.pdf_url } : r));
        }
        return [{ ...localReceipt, pdf_url: pdfUrl }, ...prev];
      });
      resetForm();
    } catch (err: unknown) {
      setError(getErrorMessage(err, editingReceiptId ? 'Falha ao atualizar recibo.' : 'Falha ao criar recibo.'));
    } finally {
      setSaving(false);
    }
  }

  async function downloadReceiptPdf(r: Receipt) {
    const client = clients.find(c => c.id === r.client_id) || { id: r.client_id, name: r.client?.name || 'Cliente', cpf: r.client?.cpf ?? null };
    const blob = await buildReceiptPdfBlob({ receipt: r, client, officeName: OFFICE_NAME });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibo-${r.id.slice(0, 8)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyLink(r: Receipt) {
    if (!r.pdf_url) { alert('PDF ainda não disponível.'); return; }
    navigator.clipboard.writeText(r.pdf_url).then(
      () => alert('Link copiado!'),
      () => alert('Falha ao copiar.'),
    );
  }

  async function resendWhatsapp(r: Receipt) {
    const phone = prompt('Telefone para WhatsApp (somente números):') || '';
    if (!phone) return;
    try {
      const text = r.pdf_url
        ? `Olá, ${r.client?.name || ''}! Segue seu recibo: ${r.pdf_url}`
        : 'Olá! Seu recibo foi emitido. O PDF ficará disponível em breve.';
      const res = await fetch('/functions/v1/messages-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officeId: r.office_id, channel: 'whatsapp', destination: phone, text }),
      });
      if (!res.ok) throw new Error('Erro ao enviar WhatsApp');
      alert('Enviado!');
    } catch (e: unknown) {
      alert('Erro: ' + getErrorMessage(e, 'Falha ao enviar.'));
    }
  }

  return (
    <div className="min-h-screen space-y-6 px-4 py-8 md:px-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(500px_180px_at_0%_0%,rgba(56,189,248,0.12),transparent_60%)]" />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Documentos</p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Recibos de Honorários</h1>
          <p className="mt-1 text-sm text-white/50">Gere, baixe e envie recibos profissionais em PDF.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          <span>{error}</span>
          <button className="ml-auto opacity-60 hover:opacity-100" onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Resumo financeiro */}
      {!isCollaborator && (
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="border-cyan-400/20 bg-gradient-to-b from-cyan-400/8 to-white/3">
            <div className="text-xs text-white/50">Este mês</div>
            <div className="mt-1.5 text-2xl font-semibold text-cyan-100">{centsToBRL(summary.monthly)}</div>
          </Card>
          <Card className="border-emerald-400/20 bg-gradient-to-b from-emerald-400/8 to-white/3">
            <div className="text-xs text-white/50">Este ano</div>
            <div className="mt-1.5 text-2xl font-semibold text-emerald-100">{centsToBRL(summary.yearly)}</div>
          </Card>
          <Card className="border-amber-400/20 bg-gradient-to-b from-amber-400/8 to-white/3">
            <div className="text-xs text-white/50">Total geral</div>
            <div className="mt-1.5 text-2xl font-semibold text-amber-100">{centsToBRL(summary.total)}</div>
          </Card>
        </div>
      )}

      {/* Form + Preview */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Formulário */}
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-white">Novo recibo</h2>
          </div>
          <div className="space-y-4">
            {/* Cliente */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/70">
                Cliente <span className="text-red-400">*</span>
              </label>
              <ClientSearch
                clients={clients}
                selectedId={selectedClient?.id ?? null}
                query={clientQuery}
                onQueryChange={v => {
                  setClientQuery(v);
                  if (selectedClient && v !== selectedClient.name) setSelectedClient(null);
                }}
                onSelect={c => { setSelectedClient(c); setClientQuery(c.name); }}
                onCreateClient={handleCreateClient}
                creating={creatingClient}
              />
              {selectedClient && (
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-emerald-400">
                  <span>✓</span>
                  <span>{selectedClient.name}{selectedClient.cpf ? ` · CPF ${selectedClient.cpf}` : ''}</span>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Valor */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/70">
                  Valor (R$) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">R$</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-neutral-900 py-2.5 pl-9 pr-3 text-sm text-white placeholder-white/25 outline-none transition focus:border-amber-400/40"
                    value={amount}
                    placeholder="1.500,00"
                    onChange={e => setAmount(applyMoneyMask(e.target.value))}
                  />
                </div>
                {amount && brlToCents(amount) ? (
                  <div className="mt-1 text-[10px] text-white/40 italic">{valorExtenso(brlToCents(amount)! / 100)}</div>
                ) : null}
              </div>

              {/* Data */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/70">Data de emissão</label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-amber-400/40"
                  value={issuedAt}
                  onChange={e => setIssuedAt(e.target.value)}
                />
              </div>
            </div>

            {/* Referente a */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/70">Referente a</label>
              <input
                className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none transition focus:border-amber-400/40"
                placeholder="Honorários advocatícios — ação previdenciária…"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Forma de pagamento */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/70">Forma de pagamento</label>
                <select
                  className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-amber-400/40"
                  value={paymentMethod}
                  onChange={e => {
                    const next = e.target.value;
                    setPaymentMethod(next);
                    if (next !== 'Cartão de crédito') {
                      setCardInstallments('1');
                      setCardInstallmentAmount('');
                    }
                  }}
                >
                  <option value="">Selecione…</option>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {paymentMethod === 'Cartão de crédito' ? (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-white/70">Em quantas vezes</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-amber-400/40"
                      value={cardInstallments}
                      onChange={e => setCardInstallments(String(Math.max(1, Number(e.target.value || '1'))))}
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-white/70">Valor da parcela (R$)</label>
                    <input
                      className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none transition focus:border-amber-400/40"
                      placeholder="Ex.: 500,00"
                      value={cardInstallmentAmount}
                      onChange={e => setCardInstallmentAmount(applyMoneyMask(e.target.value))}
                    />
                  </div>
                </>
              ) : null}

              {/* Cidade */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/70">Cidade</label>
                <input
                  className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none transition focus:border-amber-400/40"
                  placeholder="Fortaleza – CE"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                />
              </div>

              {/* Advogado */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/70">Advogado responsável</label>
                <input
                  className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none transition focus:border-amber-400/40"
                  placeholder="Dr. João Silva"
                  value={lawyerName}
                  onChange={e => setLawyerName(e.target.value)}
                />
              </div>

              {/* OAB */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/70">Nº OAB</label>
                <input
                  className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none transition focus:border-amber-400/40"
                  placeholder="CE 12345"
                  value={lawyerOab}
                  onChange={e => setLawyerOab(e.target.value)}
                />
              </div>
            </div>

            <button
              onClick={() => void onSaveReceipt()}
              disabled={saving || !selectedClient}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-50',
                selectedClient
                  ? 'bg-amber-400 text-neutral-950 hover:bg-amber-300 active:scale-[.98]'
                  : 'bg-white/10 text-white/40',
              )}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {saving ? (editingReceiptId ? 'Salvando edição…' : 'Gerando recibo…') : (editingReceiptId ? 'Salvar edição do recibo' : 'Gerar e Salvar Recibo')}
            </button>

            {editingReceiptId && (
              <button
                onClick={resetForm}
                type="button"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Cancelar edição
              </button>
            )}
          </div>
        </Card>

        {/* Preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="overflow-hidden">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Preview do recibo</h2>
              {livePreviewHtml && (
                <button
                  onClick={() => setPreviewHtml(livePreviewHtml)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Expandir
                </button>
              )}
            </div>
            {livePreviewHtml ? (
              <div className="h-[500px] overflow-hidden rounded-lg border border-white/10 bg-white">
                <iframe
                  title="Mini preview do recibo"
                  className="h-full w-full border-0"
                  srcDoc={livePreviewHtml}
                />
              </div>
            ) : (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center text-sm text-white/30">
                <FileText className="h-8 w-8 opacity-20" />
                <span>Selecione um cliente para ver o preview</span>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Histórico */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-white">Recibos emitidos</h2>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div className="text-sm text-white/40">Nenhum recibo encontrado.</div>
        )}
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white">{r.client?.name || 'Cliente'}</span>
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                      {r.status}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-white/50">
                    {new Date(r.issued_at).toLocaleDateString('pt-BR')}
                    {r.payment_method && ` · ${r.payment_method}`}
                    {r.city && ` · ${r.city}`}
                  </div>
                  {r.description && <div className="mt-0.5 text-xs text-white/40 truncate max-w-sm">{r.description}</div>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="text-base font-semibold text-white">
                    {Number(r.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white transition"
                      onClick={() => void downloadReceiptPdf(r)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Baixar PDF
                    </button>
                    <button
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white transition"
                      onClick={() => {
                        const client = clients.find(c => c.id === r.client_id) || { id: r.client_id, name: r.client?.name || 'Cliente' };
                        setPreviewHtml(buildReceiptHtml({ receipt: r, client, officeName: OFFICE_NAME }));
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Visualizar
                    </button>
                    {isAdmin && (
                      <button
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white transition"
                        onClick={() => startEditReceipt(r)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                    )}
                    {r.pdf_url && (
                      <button
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white transition"
                        onClick={() => copyLink(r)}
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                        Copiar link
                      </button>
                    )}
                    <button
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white transition"
                      onClick={() => void resendWhatsapp(r)}
                    >
                      <Send className="h-3.5 w-3.5" />
                      WhatsApp
                    </button>
                    {isAdmin && (
                      <button
                        className="flex items-center gap-1.5 rounded-lg border border-red-400/20 bg-red-400/10 px-2.5 py-1 text-xs text-red-200 hover:bg-red-400/20 transition"
                        onClick={() => void handleDeleteReceipt(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {previewHtml && <PreviewModal html={previewHtml} onClose={() => setPreviewHtml(null)} />}
    </div>
  );
}

