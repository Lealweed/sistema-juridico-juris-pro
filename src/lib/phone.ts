import { onlyDigits } from '@/lib/cpf';

export function formatBrPhone(input: string) {
  const d = onlyDigits(input).slice(0, 13); // allow country code 55 + 11 digits

  // naive formatting: tries to format as (DD) 9XXXX-XXXX when length permits
  // If has country code 55, keep +55 prefix.
  const has55 = d.startsWith('55') && d.length > 11;
  const core = has55 ? d.slice(2) : d;

  const dd = core.slice(0, 2);
  const n1 = core.slice(2, core.length === 11 ? 7 : 6);
  const n2 = core.slice(core.length === 11 ? 7 : 6);

  const prefix = has55 ? '+55 ' : '';
  if (core.length <= 2) return prefix + core;
  if (core.length <= 6) return `${prefix}(${dd}) ${core.slice(2)}`;
  if (core.length <= 10) return `${prefix}(${dd}) ${n1}-${n2}`;
  return `${prefix}(${dd}) ${n1}-${n2}`;
}
