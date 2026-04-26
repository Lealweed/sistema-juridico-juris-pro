import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  deleteCategory,
  ensureCategory,
  listAllCategories,
  updateCategory,
  type FinanceCategory,
} from '@/lib/finance';
import { Card } from '@/ui/widgets/Card';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function CategoriesPage() {
  const [rows, setRows] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [name, setName] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listAllCategories();
      setRows(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao carregar categorias.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => ({
    income: rows.filter((row) => row.type === 'income'),
    expense: rows.filter((row) => row.type === 'expense'),
  }), [rows]);

  function resetForm() {
    setEditingId(null);
    setType('income');
    setName('');
  }

  function startEdit(row: FinanceCategory) {
    setEditingId(row.id);
    setType(row.type === 'expense' ? 'expense' : 'income');
    setName(row.name || '');
  }

  async function onSave() {
    if (!name.trim()) {
      setError('Informe o nome da categoria.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        await updateCategory(editingId, { type, name });
      } else {
        await ensureCategory(type, name);
      }
      resetForm();
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, editingId ? 'Falha ao atualizar categoria.' : 'Falha ao criar categoria.'));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm('Excluir categoria? Lançamentos existentes ficarão sem categoria.')) return;

    setSaving(true);
    setError(null);

    try {
      await deleteCategory(id);
      if (editingId === id) resetForm();
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao excluir categoria.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Categorias financeiras</h1>
          <p className="text-sm text-white/60">Gerencie receitas e despesas sem depender do formulário de lançamento.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/app/financeiro" className="btn-ghost">
            Voltar
          </Link>
        </div>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      <Card>
        <div className="grid gap-4">
          <div className="text-sm font-semibold text-white">{editingId ? 'Editar categoria' : 'Nova categoria'}</div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm text-white/80">
              Tipo
              <select className="select" value={type} onChange={(e) => setType(e.target.value as 'income' | 'expense')}>
                <option value="income">Receita</option>
                <option value="expense">Despesa</option>
              </select>
            </label>
            <label className="md:col-span-2 text-sm text-white/80">
              Nome
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Honorários, Custas, Audiências" />
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button disabled={saving} onClick={() => void onSave()} className="btn-primary">
              {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Salvar'}
            </button>
            <button disabled={saving} onClick={resetForm} className="btn-ghost">
              Cancelar
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="text-sm font-semibold text-white">Categorias de receita</div>
          <div className="mt-3 grid gap-2">
            {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}
            {!loading && grouped.income.length === 0 ? <div className="text-sm text-white/60">Nenhuma categoria de receita.</div> : null}
            {grouped.income.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-sm font-semibold text-white">{row.name}</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => startEdit(row)} className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
                    Editar
                  </button>
                  <button onClick={() => void onDelete(row.id)} className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold text-white">Categorias de despesa</div>
          <div className="mt-3 grid gap-2">
            {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}
            {!loading && grouped.expense.length === 0 ? <div className="text-sm text-white/60">Nenhuma categoria de despesa.</div> : null}
            {grouped.expense.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-sm font-semibold text-white">{row.name}</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => startEdit(row)} className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
                    Editar
                  </button>
                  <button onClick={() => void onDelete(row.id)} className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}