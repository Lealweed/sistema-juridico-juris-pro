const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function _ext(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  if (n < 20) return UNIDADES[n];
  if (n < 100) {
    const d = DEZENAS[Math.floor(n / 10)];
    const u = n % 10;
    return u === 0 ? d : `${d} e ${UNIDADES[u]}`;
  }
  const c = CENTENAS[Math.floor(n / 100)];
  const rest = n % 100;
  return rest === 0 ? c : `${c} e ${_ext(rest)}`;
}

/**
 * Converte um valor numérico em reais para extenso.
 * Ex: 1500.50 → "mil e quinhentos reais e cinquenta centavos"
 */
export function valorExtenso(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '';
  const total = Math.round(value * 100);
  const reaisInt = Math.floor(total / 100);
  const centavos = total % 100;

  const partes: string[] = [];

  if (reaisInt === 0 && centavos === 0) return 'zero reais';

  if (reaisInt > 0) {
    const mil = Math.floor(reaisInt / 1000);
    const resto = reaisInt % 1000;
    const chunks: string[] = [];
    if (mil > 0) chunks.push(mil === 1 ? 'mil' : `${_ext(mil)} mil`);
    if (resto > 0) chunks.push(_ext(resto));
    const reaisStr = chunks.join(' e ');
    partes.push(`${reaisStr} ${reaisInt === 1 ? 'real' : 'reais'}`);
  }

  if (centavos > 0) {
    partes.push(`${_ext(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  }

  return partes.join(' e ');
}

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
  const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return n;
}
