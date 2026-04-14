-- Adiciona campos de revisao da gestao e updated_at em productivity_reports.
-- Idempotente: seguro para executar mais de uma vez.

begin;

-- 1) Novos campos
alter table public.productivity_reports
  add column if not exists manager_comment text,
  add column if not exists reviewed_by     uuid,
  add column if not exists reviewed_at     timestamptz,
  add column if not exists updated_at      timestamptz not null default now();

-- 2) Trigger para manter updated_at automatico
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists productivity_reports_set_updated_at on public.productivity_reports;
create trigger productivity_reports_set_updated_at
  before update on public.productivity_reports
  for each row execute function public.set_updated_at();

-- 3) Indice para reviewed_by (consultas de quem revisou)
create index if not exists productivity_reports_reviewed_by_idx
  on public.productivity_reports (reviewed_by)
  where reviewed_by is not null;

commit;
