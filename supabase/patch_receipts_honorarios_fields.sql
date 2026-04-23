-- Adiciona campos extras para Recibo de Honorários com geração de PDF jurídico.
-- Idempotente: seguro para executar mais de uma vez.

begin;

-- 1) Novos campos
alter table public.receipts
  add column if not exists payment_method  text,
  add column if not exists city            text,
  add column if not exists lawyer_name     text,
  add column if not exists lawyer_oab      text,
  add column if not exists amount_written  text;

-- 2) Comentários
comment on column public.receipts.payment_method  is 'Forma de pagamento (ex: Pix, Dinheiro, Transferência)';
comment on column public.receipts.city             is 'Cidade de emissão do recibo';
comment on column public.receipts.lawyer_name      is 'Nome do advogado responsável';
comment on column public.receipts.lawyer_oab       is 'Número da OAB do advogado';
comment on column public.receipts.amount_written   is 'Valor por extenso (ex: mil e quinhentos reais)';

commit;
