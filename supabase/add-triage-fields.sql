-- ============================================================
-- add-triage-fields.sql
-- Campos adicionais para Fila de Triagem (Leads)
-- Seguro para executar mais de uma vez.
-- ============================================================

begin;

alter table public.clients
  add column if not exists email text,
  add column if not exists cpf text,
  add column if not exists legal_area text,
  add column if not exists case_description text;

comment on column public.clients.legal_area is 'Área jurídica principal do lead (ex: Previdenciário, Trabalhista).';
comment on column public.clients.case_description is 'Resumo inicial do caso/problema informado pelo lead.';

commit;
