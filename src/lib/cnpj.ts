import { onlyDigits } from '@/lib/cpf';

export function formatCnpj(input: string) {
  const d = onlyDigits(input).slice(0, 14);
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 5);
  const p3 = d.slice(5, 8);
  const p4 = d.slice(8, 12);
  const p5 = d.slice(12, 14);
  if (d.length <= 2) return p1;
  if (d.length <= 5) return `${p1}.${p2}`;
  if (d.length <= 8) return `${p1}.${p2}.${p3}`;
  if (d.length <= 12) return `${p1}.${p2}.${p3}/${p4}`;
  return `${p1}.${p2}.${p3}/${p4}-${p5}`;
}

export function isValidCnpj(input: string) {
  const cnpj = onlyDigits(input);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digits = cnpj.split('').map((x) => Number(x));
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i++) sum += digits[i] * w1[i];
  let r = sum % 11;
  const d1 = r < 2 ? 0 : 11 - r;
  if (d1 !== digits[12]) return false;

  sum = 0;
  for (let i = 0; i < 13; i++) sum += digits[i] * w2[i];
  r = sum % 11;
  const d2 = r < 2 ? 0 : 11 - r;
  return d2 === digits[13];
}
