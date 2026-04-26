import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '@/ui/widgets/Card';
import { createPartner, deletePartner, listPartners, updatePartner, type PartnerRow } from '@/lib/partners';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function PartnersPage() {
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listPartners();
      setRows(data);
      setLoading(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao carregar parceiros.'));
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  function resetForm() {
    setCreateOpen(false);
    setEditingId(null);
    setName('');
    setPhone('');
    setEmail('');
  }

  function startEdit(row: PartnerRow) {
    setCreateOpen(true);
    setEditingId(row.id);
    setName(row.name || '');
    setPhone(row.phone || '');
    setEmail(row.email || '');
  }

  async function onSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updatePartner(editingId, { name, phone, email });
      } else {
        await createPartner({ name, phone, email });
      }
      resetForm();
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, editingId ? 'Falha ao atualizar parceiro.' : 'Falha ao criar parceiro.'));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Excluir parceiro?')) return;
    try {
      await deletePartner(id);
      await load();
      if (editingId === id) resetForm();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao excluir parceiro.'));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Parceiros</h1>
          <p className="text-sm text-white/60">Advogados/parceiros externos para repasses.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/app/financeiro" className="btn-ghost">
            Voltar
          </Link>
          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            Novo parceiro
          </button>
        </div>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      {createOpen ? (
        <Card>
          <div className="grid gap-4">
            <div className="text-sm font-semibold text-white">{editingId ? 'Editar parceiro' : 'Novo parceiro'}</div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-white/80">
                Nome
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="text-sm text-white/80">
                Telefone
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <label className="text-sm text-white/80">
                E-mail
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button disabled={saving} onClick={onSave} className="btn-primary">
                {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Salvar'}
              </button>
              <button disabled={saving} onClick={resetForm} className="btn-ghost">
                Cancelar
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}
        {!loading && rows.length === 0 ? <div className="text-sm text-white/60">Nenhum parceiro cadastrado.</div> : null}

        {!loading && rows.length ? (
          <div className="grid gap-2">
            {rows.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div>
                  <div className="text-sm font-semibold text-white">{p.name}</div>
                  <div className="mt-1 text-xs text-white/60">
                    {p.phone ? `Tel: ${p.phone}` : '—'} {p.email ? `· ${p.email}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => startEdit(p)} className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
                    Editar
                  </button>
                  <button onClick={() => void onDelete(p.id)} className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
