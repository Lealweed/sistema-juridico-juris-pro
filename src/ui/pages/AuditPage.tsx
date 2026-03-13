import { useEffect, useMemo, useState } from 'react';
import { Activity, ShieldAlert, FileSearch, Trash2, Edit3, PlusCircle } from 'lucide-react';

import type { AuditLogRow } from '@/lib/audit';
import { listAuditLogs } from '@/lib/audit';
import { getMyOfficeRole } from '@/lib/roles';
import { Card } from '@/ui/widgets/Card';
import { humanizeAudit } from '@/ui/widgets/timelineHumanize';

type TableName = 'all' | 'clients' | 'cases' | 'tasks' | 'documents' | 'finance_transactions' | 'office_members';
type ActionName = 'all' | 'insert' | 'update' | 'delete';

function fmtWhen(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - date.getTime()) / 36e5;
  
  if (diffH < 24) {
    if (diffH < 1) return 'Agorinha';
    return `Há ${Math.floor(diffH)} horas`;
  }
  
  return date.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function whoLabel(it: AuditLogRow) {
  const p = it.profile?.[0];
  return p?.display_name || p?.email || (it.user_id ? it.user_id.slice(0, 8) : 'Sistema');
}

function getIconForAction(action: string, tableName: string) {
  if (action === 'delete') return <Trash2 className="w-5 h-5 text-red-400" />;
  if (action === 'insert') return <PlusCircle className="w-5 h-5 text-emerald-400" />;
  if (action === 'update' && tableName === 'finance_transactions') return <ShieldAlert className="w-5 h-5 text-amber-400" />;
  if (action === 'update') return <Edit3 className="w-5 h-5 text-blue-400" />;
  return <Activity className="w-5 h-5 text-white/50" />;
}

function getSeverityBg(action: string, tableName: string) {
  if (action === 'delete' && ['cases', 'finance_transactions'].includes(tableName)) 
    return 'bg-red-500/10 border-red-500/20'; // Crítico
  
  if (tableName === 'office_members') 
    return 'bg-amber-500/10 border-amber-500/20'; // Sensível
    
  if (action === 'delete')
    return 'bg-rose-500/5 border-rose-500/10'; // Alerta médio
    
  return 'bg-white/5 border-white/10'; // Normal
}

export function AuditPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AuditLogRow[]>([]);

  const [role, setRole] = useState<string>('');

  const [table, setTable] = useState<TableName>('all');
  const [action, setAction] = useState<ActionName>('all');
  const [q, setQ] = useState('');

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const r = await getMyOfficeRole().catch(() => '');
      setRole(r);

      const data = await listAuditLogs({ limit: 120 });
      setRows(data);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar auditoria.');
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return rows.filter((it) => {
      if (table !== 'all' && it.table_name !== table) return false;
      if (action !== 'all' && it.action !== action) return false;

      if (!qq) return true;

      const h = humanizeAudit(it);
      const hay = [
        h.title,
        (h.changes || []).join(' | '),
        it.table_name,
        it.action,
        it.record_id || '',
        it.client_id || '',
        it.case_id || '',
        it.task_id || '',
        whoLabel(it),
      ]
        .join(' ')
        .toLowerCase();

      return hay.includes(qq);
    });
  }, [rows, table, action, q]);

  if (role && role !== 'admin') {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center p-10 text-center">
          <ShieldAlert className="w-12 h-12 text-red-400 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Acesso Restrito</h2>
          <p className="text-sm text-white/60 max-w-md">
            Esta área é um cofre digital de segurança. Apenas advogados sócios e administradores do escritório possuem credencial para visualizar a auditoria de ações.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Smart Audit & Segurança</h1>
        <p className="text-sm text-white/60">Linha do tempo inteligente de rastreio. Veja quem fez o que, quando e onde no sistema.</p>
      </div>

      {error ? <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/20 p-4 rounded-xl">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="md:col-span-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs uppercase text-white/50 mb-1">Módulo / Tabela</label>
              <select className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400" value={table} onChange={(e) => setTable(e.target.value as any)}>
                <option value="all">Ver Todos</option>
                <option value="cases">Casos & Processos</option>
                <option value="finance_transactions">Financeiro</option>
                <option value="documents">Documentos & Arquivos</option>
                <option value="clients">Clientes</option>
                <option value="tasks">Tarefas</option>
                <option value="office_members">Equipe & Permissões</option>
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase text-white/50 mb-1">Tipo de Ação</label>
              <select className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400" value={action} onChange={(e) => setAction(e.target.value as any)}>
                <option value="all">Todas as ações</option>
                <option value="insert">Criação / Inserção</option>
                <option value="update">Edição / Atualização</option>
                <option value="delete">Exclusão ⚠️</option>
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase text-white/50 mb-1">Busca Direta</label>
              <div className="relative">
                <FileSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input 
                  className="w-full bg-black/20 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-amber-400 placeholder:text-white/30" 
                  value={q} 
                  onChange={(e) => setQ(e.target.value)} 
                  placeholder="ex.: nome, valor, ID..." 
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Resumo Rápido Lateral */}
        <Card className="bg-gradient-to-br from-amber-500/10 to-transparent border-amber-500/20 flex flex-col justify-center">
          <div className="text-xs uppercase text-amber-200/70 font-semibold mb-1">Ações Críticas (24h)</div>
          <div className="text-3xl font-black text-amber-400">
            {rows.filter(r => r.action === 'delete' || r.table_name === 'office_members').length}
          </div>
          <div className="text-[10px] text-white/50 mt-1">Exclusões ou mudanças de equipe</div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-white/50 flex flex-col items-center">
            <Activity className="w-8 h-8 animate-pulse text-amber-400 mb-3" />
            Buscando rastros criptográficos...
          </div>
        ) : null}
        
        {!loading && filtered.length === 0 ? (
          <div className="p-10 text-center text-white/50">
            Nenhum registro encontrado para este filtro.
          </div>
        ) : null}

        {!loading && filtered.length ? (
          <div className="divide-y divide-white/5">
            {filtered.map((it) => {
              const h = humanizeAudit(it);
              const isDanger = it.action === 'delete' || it.table_name === 'office_members';
              
              return (
                <div key={it.id} className={`p-5 transition-colors hover:bg-white/[0.02] border-l-2 ${isDanger ? 'border-red-500' : 'border-transparent'}`}>
                  <div className="flex gap-4">
                    
                    {/* Ícone de Ação */}
                    <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center border ${getSeverityBg(it.action, it.table_name)}`}>
                      {getIconForAction(it.action, it.table_name)}
                    </div>

                    {/* Conteúdo */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <div className="text-sm font-semibold text-white">
                          <span className="text-amber-200 mr-2">{whoLabel(it)}</span>
                          {h.title}
                        </div>
                        <div className="text-xs text-white/40 font-mono bg-black/30 px-2 py-1 rounded-md">
                          {fmtWhen(it.created_at)}
                        </div>
                      </div>

                      {h.changes.length ? (
                        <div className="mt-3 bg-black/20 rounded-lg p-3 border border-white/5">
                          <ul className="space-y-1.5 text-xs text-white/70">
                            {h.changes.map((c, i) => {
                              // Highlights para exclusões ou valores financeiros
                              const isVal = c.includes('R$');
                              return (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-white/30 mt-0.5">↳</span>
                                  <span className={isVal ? 'text-emerald-300 font-medium' : ''}>{c}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}

                      <div className="mt-3 flex items-center gap-3 text-[10px] uppercase font-bold tracking-wider text-white/30">
                        <span className="bg-white/5 px-2 py-0.5 rounded">{it.table_name}</span>
                        <span>REF: {it.record_id ? it.record_id.slice(0, 8) : '—'}</span>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
