-- Adiciona campo is_summary_only para identificar relatorios enviados sem atividades detalhadas.
-- Idempotente: seguro para executar mais de uma vez.

begin;

-- 1) Nova coluna
alter table public.productivity_reports
  add column if not exists is_summary_only boolean not null default false;

-- 2) Seed: marca relatorios antigos sem activities como summary-only
update public.productivity_reports
set is_summary_only = true
where (activities is null or activities = '[]'::jsonb)
  and is_summary_only = false;

-- 3) Comentario descritivo
comment on column public.productivity_reports.is_summary_only is
  'TRUE quando o relatorio foi enviado apenas com resumo numerico (sem lista de atividades detalhadas).';

commit;
