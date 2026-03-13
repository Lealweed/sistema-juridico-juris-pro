export function formatBRL(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  } catch {
    return String(v);
  }
}

export function parseMoneyInput(s: string) {
  const raw = (s || '').trim();
  if (!raw) return null;
  // accept "1234,56" or "1.234,56" or "1234.56"
  const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return n;
}
