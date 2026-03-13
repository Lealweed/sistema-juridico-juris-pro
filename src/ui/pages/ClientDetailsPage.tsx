import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Card } from '@/ui/widgets/Card';
import { DocumentsSection } from '@/ui/widgets/DocumentsSection';
import { ClientLinksSection } from '@/ui/widgets/ClientLinksSection';
import { TimelineSection } from '@/ui/widgets/TimelineSection';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

function extractSourceFromNotes(notes: string | null) {
  if (!notes) return null;
  const m = notes.match(/\[#origem:([^\]]+)\]/i);
  return m?.[1]?.trim()?.toLowerCase() || null;
}

function cleanNotes(notes: string | null) {
  if (!notes) return null;
  return notes.replace(/\[#origem:[^\]]+\]\s*/gi, '').trim() || null;
}

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  notes: string | null;
  user_id: string | null;
  created_at: string;
};

type CaseLite = {
  id: string;
  title: string;
  status: string;
  process_number: string | null;
  area: string | null;
  created_at: string;
};

export function ClientDetailsPage() {
  const { clientId } = useParams();
  const [row, setRow] = useState<ClientRow | null>(null);
  const [cases, setCases] = useState<CaseLite[]>([]);
  const [createdByLabel, setCreatedByLabel] = useState<string>('—');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        if (!clientId) throw new Error('Cliente inválido.');

        const sb = requireSupabase();
        await getAuthedUser();

        const [c1, c2] = await Promise.all([
          sb.from('clients').select('id,name,phone,whatsapp,email,notes,user_id,created_at').eq('id', clientId).maybeSingle(),
          sb
            .from('cases')
            .select('id,title,status,process_number,area,created_at')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false }),
        ]);

        if (c1.error) throw new Error(c1.error.message);
        if (c2.error) throw new Error(c2.error.message);

        if (!alive) return;
        const client = (c1.data as any) || null;
        setRow(client);
        setName(client?.name || '');
        setPhone(client?.phone || '');
        setWhatsapp(client?.whatsapp || '');
        setEmail(client?.email || '');
        setNotes(client?.notes || '');
        setCases((c2.data || []) as CaseLite[]);

        if (client?.user_id) {
          const p = await sb
            .from('user_profiles')
            .select('display_name,email,user_id')
            .eq('user_id', client.user_id)
            .maybeSingle();
          if (!p.error && p.data) {
            setCreatedByLabel((p.data as any).display_name || (p.data as any).email || (p.data as any).user_id || client.user_id);
          } else {
            setCreatedByLabel(client.user_id);
          }
        } else {
          setCreatedByLabel('—');
        }

        setLoading(false);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || 'Falha ao carregar.');
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [clientId]);

  async function onSave() {
    if (!clientId) return;
    setSaving(true);
    setError(null);
    try {
      const sb = requireSupabase();
      const { error: updateErr } = await sb
        .from('clients')
        .update({
          name: name.trim(),
          phone: phone.trim() || null,
          whatsapp: whatsapp.trim() || null,
          email: email.trim() || null,
          notes: notes.trim() || null,
        } as any)
        .eq('id', clientId);
      if (updateErr) throw new Error(updateErr.message);
      
      setRow(prev => prev ? { ...prev, name: name.trim(), phone: phone.trim() || null, whatsapp: whatsapp.trim() || null, email: email.trim() || null, notes: notes.trim() || null } : prev);
      setEditing(false);
    } catch (e: any) {
      setError(e.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Cliente</h1>
          <p className="text-sm text-white/60">Detalhes (Supabase).</p>
        </div>
        <Link to="/app/clientes" className="btn-ghost">
          Voltar
        </Link>
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
                        setNotes(row.notes || '');
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
                        <div className="text-sm text-white/80">{row.whatsapp || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-white/50">E-mail</div>
                        <div className="text-sm text-white/80">{row.email || '—'}</div>
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
    </div>
  );
}
