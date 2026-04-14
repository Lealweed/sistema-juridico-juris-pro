import { useEffect, useMemo, useState } from 'react';

import { brlToCents, centsToBRL } from '@/lib/finance';
import { loadClientsLite } from '@/lib/loadClientsLite';
import { createClientQuick } from '@/lib/clients';
import { getMyOfficeRole, isCollaboratorRole } from '@/lib/roles';
import { createReceiptSecure, listReceipts, type Receipt } from '@/lib/receipts';
import type { ClientLite } from '@/lib/types';
import { Card } from '@/ui/widgets/Card';

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

export function ReceiptsPage() {
  const [role, setRole] = useState('');
  const [rows, setRows] = useState<Receipt[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Autocomplete cliente
  const [clientQuery, setClientQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [dropdownHover, setDropdownHover] = useState<number>(-1);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [issuedAt, setIssuedAt] = useState(todayIsoLocal());

  const isCollaborator = isCollaboratorRole(role);

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
      setLoading(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao carregar recibos.'));
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);



  const summary = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let monthly = 0;
    let yearly = 0;
    let total = 0;

    for (const r of rows) {
      const amountCents = Math.round(Number(r.amount || 0) * 100);
      if (!Number.isFinite(amountCents)) continue;
      total += amountCents;

      const issued = new Date(r.issued_at);
      if (issued.getFullYear() === currentYear) {
        yearly += amountCents;
        if (issued.getMonth() === currentMonth) {
          monthly += amountCents;
        }
      }
    }

    return { monthly, yearly, total };
  }, [rows]);

  async function onCreateReceipt() {
    if (!selectedClientId) {
      setError('Selecione o cliente.');
      return;
    }

    const cents = brlToCents(amount);
    if (cents === null || cents <= 0) {
      setError('Informe um valor válido maior que zero.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await createReceiptSecure({
        clientId: selectedClientId,
        amount: cents / 100,
        description: description.trim() || null,
        issuedAt: `${issuedAt}T12:00:00.000Z`,
      });

      setAmount('');
      setDescription('');
      setSaving(false);
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao gerar recibo.'));
      setSaving(false);
    }
  }

  // Filtragem de clientes por nome, telefone ou cpf
  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return [];
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '')))
      || (c.cpf && c.cpf.replace(/\D/g, '').includes(q.replace(/\D/g, '')))
    );
  }, [clientQuery, clients]);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(500px_180px_at_0%_0%,rgba(56,189,248,0.15),transparent_60%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/90">Juris Pro</p>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Recibos de clientes</h1>
            <p className="mt-1 text-sm text-white/60">Emissão segura de recibos com controle por papel.</p>
          </div>
          <button onClick={() => void onCreateReceipt()} disabled={saving} className="btn-primary">
            {saving ? 'Gerando...' : 'Gerar Recibo'}
          </button>
        </div>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      {!isCollaborator ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="border-cyan-400/20 bg-gradient-to-b from-cyan-400/10 to-white/5">
            <div className="text-xs text-white/60">Total mensal</div>
            <div className="mt-2 text-2xl font-semibold text-cyan-100">{centsToBRL(summary.monthly)}</div>
          </Card>
          <Card className="border-emerald-400/20 bg-gradient-to-b from-emerald-400/10 to-white/5">
            <div className="text-xs text-white/60">Total anual</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-100">{centsToBRL(summary.yearly)}</div>
          </Card>
          <Card className="border-amber-400/20 bg-gradient-to-b from-amber-400/10 to-white/5">
            <div className="text-xs text-white/60">Faturamento geral</div>
            <div className="mt-2 text-2xl font-semibold text-amber-100">{centsToBRL(summary.total)}</div>
          </Card>
        </div>
      ) : null}

      <Card>
        <div className="text-sm font-semibold text-white">Dados do recibo</div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm text-white/80">
            Cliente
            <div className="relative">
              <input
                className="input pr-24"
                placeholder="Digite nome, telefone ou CPF..."
                value={clientQuery}
                autoComplete="off"
                onChange={e => {
                  setClientQuery(e.target.value);
                  setShowDropdown(true);
                  setSelectedClientId(null);
                  setDropdownHover(-1);
                }}
                onFocus={() => {
                  if (clientQuery.length > 0 || filteredClients.length > 0) setShowDropdown(true);
                }}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              />
              {/* Dropdown absoluto de autocomplete */}
              {showDropdown && (
                <div className="absolute left-0 right-0 z-20 mt-1 rounded bg-white/95 text-black shadow-lg max-h-60 overflow-y-auto border border-neutral-200">
                  {filteredClients.length > 0 ? (
                    filteredClients.map((c, idx) => (
                      <button
                        key={c.id}
                        className={`flex flex-col items-start w-full px-3 py-2 text-left hover:bg-amber-100 ${dropdownHover === idx ? 'bg-amber-200' : ''} ${selectedClientId === c.id ? 'font-bold' : ''}`}
                        onMouseEnter={() => setDropdownHover(idx)}
                        onMouseLeave={() => setDropdownHover(-1)}
                        onClick={() => {
                          setSelectedClientId(c.id);
                          setClientQuery(c.name);
                          setShowDropdown(false);
                        }}
                        tabIndex={-1}
                      >
                        <span>{c.name}</span>
                        {c.phone || c.cpf ? (
                          <span className="text-xs text-gray-500">{[c.phone, c.cpf].filter(Boolean).join(' · ')}</span>
                        ) : null}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-gray-500">Nenhum cliente encontrado</div>
                  )}
                  {/* Opção de criar cliente */}
                  {clientQuery.trim() && filteredClients.length === 0 && (
                    <button
                      className="block w-full px-3 py-2 text-left text-green-700 hover:bg-green-100 border-t border-neutral-200"
                      disabled={creatingClient}
                      onClick={async () => {
                        setCreatingClient(true);
                        try {
                          const officeId = window.localStorage.getItem('currentOfficeId') || '';
                          const newClient = await createClientQuick({ name: clientQuery, officeId });
                          setClients(prev => [...prev, newClient]);
                          setSelectedClientId(newClient.id);
                          setClientQuery(newClient.name);
                          setShowDropdown(false);
                        } catch (e: any) {
                          setError(e.message || 'Erro ao criar cliente');
                        } finally {
                          setCreatingClient(false);
                        }
                      }}
                    >
                      + Criar cliente "{clientQuery}"
                    </button>
                  )}
                </div>
              )}
			</div>
		</label>

  // Filtragem de clientes por nome, telefone ou cpf
  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return [];
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '')))
      || (c.cpf && c.cpf.replace(/\D/g, '').includes(q.replace(/\D/g, '')))
    );
  }, [clientQuery, clients]);

          <label className="text-sm text-white/80">
            Valor (R$)
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500,00" />
          </label>

          <label className="text-sm text-white/80">
            Data de emissão
            <input type="date" className="input" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
          </label>

          <label className="text-sm text-white/80 md:col-span-3">
            Descrição
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Referente a honorários / serviço" />
          </label>
        </div>
      </Card>

      <Card>
        <div className="text-sm font-semibold text-white">Recibos emitidos</div>
        <div className="mt-3">
          {loading ? <div className="text-sm text-white/70">Carregando...</div> : null}
          {!loading && rows.length === 0 ? <div className="text-sm text-white/60">Nenhum recibo encontrado.</div> : null}

          <div className="mt-3 grid gap-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{r.client?.name || 'Cliente'} <span className="badge">{r.status}</span></div>
                    <div className="mt-1 text-xs text-white/60">
                      Emissão: {new Date(r.issued_at).toLocaleDateString('pt-BR')} · Criado em {new Date(r.created_at).toLocaleDateString('pt-BR')}
                    </div>
                    {r.description ? <div className="mt-1 text-xs text-white/50">{r.description}</div> : null}
                  </div>
                  <div className="text-sm font-semibold text-white">{Number(r.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
