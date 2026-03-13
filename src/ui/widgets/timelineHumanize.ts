import type { AuditLogRow } from '@/lib/audit';

function pickTitle(it: AuditLogRow) {
  const after = it.after_data || {};
  const before = it.before_data || {};
  return after.title || after.name || before.title || before.name || null;
}

function tableLabel(table: string) {
  switch (table) {
    case 'clients':
      return 'Cliente';
    case 'cases':
      return 'Caso';
    case 'tasks':
      return 'Tarefa';
    case 'documents':
      return 'Documento';
    case 'finance_transactions':
      return 'Financeiro';
    default:
      return table;
  }
}

function actionLabel(action: string) {
  switch (action) {
    case 'insert':
      return 'criado';
    case 'update':
      return 'atualizado';
    case 'delete':
      return 'excluído';
    default:
      return action;
  }
}

function diffKeys(before: any, after: any, keys: string[]) {
  const changed: string[] = [];
  for (const k of keys) {
    const b = before?.[k];
    const a = after?.[k];
    // compare JSON-friendly
    if (JSON.stringify(b ?? null) !== JSON.stringify(a ?? null)) changed.push(k);
  }
  return changed;
}

function fmtValue(k: string, v: any) {
  if (v === null || v === undefined || v === '') return '—';
  if (k.endsWith('_at') || k.endsWith('_on')) {
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return String(v);
    return d.toLocaleString();
  }
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  return String(v);
}

export function humanizeAudit(it: AuditLogRow) {
  const what = tableLabel(it.table_name);
  const action = actionLabel(it.action);
  const title = pickTitle(it);

  if (it.action !== 'update') {
    return {
      title: title ? `${what} ${action}: ${title}` : `${what} ${action}`,
      changes: [] as string[],
    };
  }

  const before = it.before_data || {};
  const after = it.after_data || {};

  const keysByTable: Record<string, string[]> = {
    clients: ['name', 'phone', 'email'],
    cases: ['title', 'status', 'process_number'],
    tasks: ['title', 'status_v2', 'priority', 'due_at', 'assigned_to_user_id'],
    documents: ['title', 'kind', 'case_id', 'task_id'],
    finance_transactions: ['type', 'status', 'occurred_on', 'due_date', 'amount_cents', 'payment_method', 'description'],
  };

  const changed = diffKeys(before, after, keysByTable[it.table_name] || ['title', 'status', 'name']);

  const niceLabels: Record<string, string> = {
    status_v2: 'status',
    due_at: 'prazo',
    assigned_to_user_id: 'responsável',
    process_number: 'CNJ',
    occurred_on: 'data',
    due_date: 'vencimento',
    amount_cents: 'valor',
    payment_method: 'pagamento',
    description: 'descrição',
  };

  const changes = changed.slice(0, 4).map((k) => {
    const label = niceLabels[k] || k;
    return `${label}: ${fmtValue(k, before?.[k])} → ${fmtValue(k, after?.[k])}`;
  });

  return {
    title: title ? `${what} atualizado: ${title}` : `${what} atualizado`,
    changes,
  };
}
