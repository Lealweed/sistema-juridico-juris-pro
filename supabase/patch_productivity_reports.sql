-- Cria tabela productivity_reports para gestao de relatorios de produtividade da equipe.
-- Idempotente: seguro para executar mais de uma vez.

begin;

-- 1) Tabela principal
create table if not exists public.productivity_reports (
  id              uuid        primary key default gen_random_uuid(),
  office_id       uuid        not null,
  user_id         uuid        not null,
  report_date     date        not null,
  activities      jsonb       not null default '[]'::jsonb,
  total_tasks     int         not null default 0,
  completed_tasks int         not null default 0,
  pending_tasks   int         not null default 0,
  notes           text,
  status          text        not null default 'enviado',
  created_at      timestamptz not null default now()
);

-- 2) Indices
create index if not exists productivity_reports_office_idx
  on public.productivity_reports (office_id, report_date desc);

create index if not exists productivity_reports_user_idx
  on public.productivity_reports (user_id, report_date desc);

create index if not exists productivity_reports_status_idx
  on public.productivity_reports (status, office_id);

-- 3) RLS
alter table public.productivity_reports enable row level security;

-- Admin/owner do office ve TODOS os relatorios do office
drop policy if exists "productivity_reports_admin_select" on public.productivity_reports;
create policy "productivity_reports_admin_select"
  on public.productivity_reports
  for select to authenticated
  using (
    exists (
      select 1
      from public.office_members om
      where om.office_id = productivity_reports.office_id
        and om.user_id   = auth.uid()
        and lower(om.role) in ('owner', 'admin', 'administrator', 'advogado')
    )
  );

-- Colaborador ve apenas os proprios relatorios
drop policy if exists "productivity_reports_member_select" on public.productivity_reports;
create policy "productivity_reports_member_select"
  on public.productivity_reports
  for select to authenticated
  using (user_id = auth.uid());

-- Qualquer membro autenticado pode inserir para si mesmo
drop policy if exists "productivity_reports_member_insert" on public.productivity_reports;
create policy "productivity_reports_member_insert"
  on public.productivity_reports
  for insert to authenticated
  with check (user_id = auth.uid());

-- Colaborador atualiza apenas os proprios
drop policy if exists "productivity_reports_member_update" on public.productivity_reports;
create policy "productivity_reports_member_update"
  on public.productivity_reports
  for update to authenticated
  using (user_id = auth.uid());

-- Admin pode atualizar status (aprovacao/reprovacao) de qualquer relatorio do office
drop policy if exists "productivity_reports_admin_update" on public.productivity_reports;
create policy "productivity_reports_admin_update"
  on public.productivity_reports
  for update to authenticated
  using (
    exists (
      select 1
      from public.office_members om
      where om.office_id = productivity_reports.office_id
        and om.user_id   = auth.uid()
        and lower(om.role) in ('owner', 'admin', 'administrator')
    )
  );

commit;
