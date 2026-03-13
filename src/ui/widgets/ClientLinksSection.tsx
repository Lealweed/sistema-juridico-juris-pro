import { useEffect, useMemo, useState } from 'react';

import { getMyOfficeId } from '@/lib/officeContext';
import { requireRole } from '@/lib/roles';
import type { ClientLite } from '@/lib/types';
import { loadClientsLite } from '@/lib/loadClientsLite';
import { createClientLink, deleteClientLink, listClientLinksByClient } from '@/lib/clientLinks';

const RELATION_TYPES = [
  { id: 'responsavel', label: 'Responsável' },
  { id: 'dependente', label: 'Dependente' },
  { id: 'conjuge', label: 'Cônjuge' },
  { id: 'socio', label: 'Sócio' },
  { id: 'representante', label: 'Representante' },
  { id: 'outro', label: 'Outro' },
] as const;

type LinkView = {
  id: string;
  relation_type: string;
  notes: string | null;
  created_at: string;
  from_client_id: string;
  to_client_id: string;
  otherClientId: string;
  direction: 'from' | 'to';
};

export function ClientLinksSection({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [links, setLinks] = useState<LinkView[]>([]);

  const [open, setOpen] = useState(false);
  const [toClientId, setToClientId] = useState('');
  const [relationType, setRelationType] = useState<(typeof RELATION_TYPES)[number]['id']>('responsavel');
  const [notes, setNotes] = useState('');

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [officeId, adminOk, lks, lite] = await Promise.all([
        getMyOfficeId(),
        requireRole(['admin']),
        listClientLinksByClient(clientId),
        loadClientsLite(),
      ]);

      setIsAdmin(Boolean(adminOk));
      setClients(lite);

      const mapped: LinkView[] = (lks || []).map((l) => {
        const direction: 'from' | 'to' = l.from_client_id === clientId ? 'from' : 'to';
        const otherClientId = direction === 'from' ? l.to_client_id : l.from_client_id;
        return {
          id: l.id,
          relation_type: l.relation_type,
          notes: l.notes,
          created_at: l.created_at,
          from_client_id: l.from_client_id,
          to_client_id: l.to_client_id,
          otherClientId,
          direction,
        };
      });

      // Basic dedup in view
      const seen = new Set<string>();
      const uniq = mapped.filter((x) => {
        if (seen.has(x.id)) return false;
        seen.add(x.id);
        return true;
      });

      setLinks(uniq);
      setLoading(false);

      // Keep officeId in closure by returning it (TS unused prevention)
      void officeId;
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar vínculos.');
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  async function onCreate() {
    if (!toClientId) return;

    setSaving(true);
    setError(null);
    try {
      const officeId = await getMyOfficeId();
      if (!officeId) throw new Error('Escritório não encontrado.');

      await createClientLink({
        officeId,
        fromClientId: clientId,
        toClientId,
        relationType,
        notes: notes.trim() || null,
      });

      setOpen(false);
      setToClientId('');
      setRelationType('responsavel');
      setNotes('');
      setSaving(false);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao criar vínculo.');
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!isAdmin) return;
    if (!confirm('Excluir este vínculo?')) return;

    setSaving(true);
    setError(null);
    try {
      await deleteClientLink(id);
      setSaving(false);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir vínculo.');
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Vínculos</div>
          <div className="text-xs text-white/60">Relacionamentos entre clientes (escritório).</div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setOpen((v) => !v)} className="btn-primary" disabled={saving}>
            + Vincular
          </button>
        </div>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      {open ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-white/80">
              Cliente
              <select className="input" value={toClientId} onChange={(e) => setToClientId(e.target.value)}>
                <option value="">Selecione…</option>
                {clients
                  .filter((c) => c.id !== clientId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="text-sm text-white/80">
              Tipo
              <select className="input" value={relationType} onChange={(e) => setRelationType(e.target.value as any)}>
                {RELATION_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-3 block text-sm text-white/80">
            Observação (opcional)
            <input className="input mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: procurador, responsável financeiro" />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={saving || !toClientId} onClick={() => void onCreate()}>
              {saving ? 'Salvando…' : 'Salvar vínculo'}
            </button>
            <button className="btn-ghost" disabled={saving} onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-white/5">
        {loading ? <div className="p-4 text-sm text-white/70">Carregando…</div> : null}
        {!loading && links.length === 0 ? (
          <div className="p-4 text-sm text-white/60">Nenhum vínculo cadastrado.</div>
        ) : null}

        {!loading && links.length ? (
          <div className="divide-y divide-white/10">
            {links.map((l) => {
              const other = clientById.get(l.otherClientId);
              const rt = RELATION_TYPES.find((x) => x.id === (l.relation_type as any))?.label || l.relation_type;
              const dirLabel = l.direction === 'from' ? '→' : '←';

              return (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {rt} {dirLabel} {other?.name || 'Cliente'}
                    </div>
                    <div className="mt-1 text-xs text-white/50">
                      {l.notes ? l.notes : '—'}
                      {' · '}
                      {new Date(l.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {other ? (
                      <a
                        href={`/app/clientes/${other.id}`}
                        className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
                      >
                        Abrir
                      </a>
                    ) : null}

                    {isAdmin ? (
                      <button
                        onClick={() => void onDelete(l.id)}
                        disabled={saving}
                        className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
                      >
                        Excluir
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
