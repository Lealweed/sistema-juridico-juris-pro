import { DOCUMENT_TEMPLATES } from './documentData';

export type DocumentHistoryContext = { officeId: string; userId: string };
export type DocumentHistoryEntry = {
  id: string;
  date: string;
  clientName: string;
  templateLabel: string;
  templateFile: string;
};
type HistoryStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function documentHistoryKey(context: DocumentHistoryContext): string {
  for (const value of [context.officeId, context.userId]) {
    if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error('Contexto do histórico inválido.');
  }
  return `docgen_history_v2:${encodeURIComponent(context.officeId)}:${encodeURIComponent(context.userId)}`;
}

function validateEntry(value: unknown): DocumentHistoryEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const template = DOCUMENT_TEMPLATES.find(item => item.file === row.templateFile);
  if (!template || typeof row.id !== 'string' || !row.id.trim() || row.id.length > 128
    || typeof row.date !== 'string' || !Number.isFinite(Date.parse(row.date))
    || typeof row.clientName !== 'string' || !row.clientName.trim() || row.clientName.length > 500) return null;
  return { id: row.id, date: row.date, clientName: row.clientName, templateFile: template.file, templateLabel: template.label };
}

function validateEntries(value: unknown): DocumentHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entries: DocumentHistoryEntry[] = [];
  for (const candidate of value) {
    const entry = validateEntry(candidate);
    if (!entry || seen.has(entry.id)) continue;
    entries.push(entry); seen.add(entry.id);
    if (entries.length === 20) break;
  }
  return entries;
}

/** The unscoped v1 key is deliberately neither read, migrated nor deleted. */
export function readDocumentHistory(storage: HistoryStorage | null, context: DocumentHistoryContext): DocumentHistoryEntry[] {
  try {
    if (!storage) return [];
    const raw = storage.getItem(documentHistoryKey(context));
    if (!raw) return [];
    const envelope = JSON.parse(raw) as Record<string, unknown> | null;
    if (!envelope || Array.isArray(envelope) || envelope.version !== 2
      || envelope.officeId !== context.officeId || envelope.userId !== context.userId) return [];
    return validateEntries(envelope.entries);
  } catch { return []; }
}

/** Local history persistence is optional after a successfully generated download. */
export function appendDocumentHistory(
  storage: HistoryStorage | null,
  context: DocumentHistoryContext,
  entry: DocumentHistoryEntry,
  previous: readonly DocumentHistoryEntry[],
): { entries: DocumentHistoryEntry[]; persisted: boolean } {
  const valid = validateEntry(entry);
  if (!valid) return { entries: validateEntries(previous), persisted: false };
  const entries = validateEntries([valid, ...previous]);
  try {
    if (!storage) return { entries, persisted: false };
    storage.setItem(documentHistoryKey(context), JSON.stringify({ version: 2, ...context, entries }));
    return { entries, persisted: true };
  } catch { return { entries, persisted: false }; }
}
