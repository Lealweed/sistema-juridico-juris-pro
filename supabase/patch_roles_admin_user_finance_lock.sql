-- patch_roles_admin_user_finance_lock.sql
-- Normaliza papéis para admin/user e reforça RLS financeiro
-- Idempotente

begin;

-- 1. Garante tabela office_members
create table if not exists public.office_members (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists office_members_office_user_uidx
  on public.office_members (office_id, user_id);

-- 2. Normaliza roles para admin/user
update public.office_members
set role = 'user'
where role in ('owner','advogado','finance','staff','member','colaborador');

-- 3. Função helper para checar admin
create or replace function public.is_office_admin(p_office_id uuid, p_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1 from public.office_members m
    where m.office_id = p_office_id
      and m.user_id = p_user_id
      and m.role = 'admin'
  );
$$;

revoke all on function public.is_office_admin(uuid, uuid) from public;
grant execute on function public.is_office_admin(uuid, uuid) to authenticated;

-- 4. Policies financeiras globais (finance_transactions, financial_reports, office_metrics, receipts)
-- SELECT/UPDATE/DELETE: só admin
-- INSERT: admin e user (quando operacional)

-- finance_transactions
alter table if exists public.finance_transactions enable row level security;
drop policy if exists finance_tx_select_admin_only on public.finance_transactions;
create policy finance_tx_select_admin_only on public.finance_transactions
for select to authenticated
using (public.is_office_admin(office_id, auth.uid()));

drop policy if exists finance_tx_update_admin_only on public.finance_transactions;
create policy finance_tx_update_admin_only on public.finance_transactions
for update to authenticated
using (public.is_office_admin(office_id, auth.uid()));

-- Permite insert operacional
create policy if not exists finance_tx_insert_operacional on public.finance_transactions
for insert to authenticated
with check (public.is_office_admin(office_id, auth.uid()) or role = 'user');

-- financial_reports
alter table if exists public.financial_reports enable row level security;
drop policy if exists financial_reports_select_admin_only on public.financial_reports;
create policy financial_reports_select_admin_only on public.financial_reports
for select to authenticated
using (public.is_office_admin(office_id, auth.uid()));

-- office_metrics
alter table if exists public.office_metrics enable row level security;
drop policy if exists office_metrics_select_admin_only on public.office_metrics;
create policy office_metrics_select_admin_only on public.office_metrics
for select to authenticated
using (public.is_office_admin(office_id, auth.uid()));

-- receipts (apenas admin pode ver todos, user só os próprios)
drop policy if exists receipts_select_admin_only on public.receipts;
create policy receipts_select_admin_only on public.receipts
for select to authenticated
using (public.is_office_admin(office_id, auth.uid()) or created_by = auth.uid());

commit;