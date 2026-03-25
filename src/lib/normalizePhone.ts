// Utilitário para normalização de números de telefone para E.164 (Brasil)
// Exemplo: (11) 91234-5678 => 5511912345678

export function normalizePhone(input: string): string {
  if (!input) return '';
  let digits = input.replace(/\D/g, '');
  // Remove zero à esquerda do DDD se houver
  if (digits.length === 12 && digits.startsWith('550')) {
    digits = '55' + digits.slice(3);
  }
  // Se já está no formato 55 + 10/11 dígitos, retorna
  if (digits.length === 12 || digits.length === 13) {
    return digits;
  }
  // Se tem 10 ou 11 dígitos, assume Brasil
  if (digits.length === 10 || digits.length === 11) {
    return '55' + digits;
  }
  // Se tem 8 ou 9 dígitos, inválido para E.164
  return digits;
}
