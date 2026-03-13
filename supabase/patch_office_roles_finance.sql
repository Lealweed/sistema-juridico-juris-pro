-- CRM Jurídico: office roles (finance) - tighten finance RLS by role
-- Applied via psql on 2026-02-10.

begin;

create or replace function public.is_office_finance(p_office_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.office_members m
    where m.office_id = p_office_id
      and m.user_id = auth.uid()
      and m.role in ('admin','finance')
  );
$$;

revoke all on function public.is_office_finance(uuid) from public;
grant execute on function public.is_office_finance(uuid) to authenticated;

alter policy finance_tx_insert on public.finance_transactions
  with check (
    ((office_id is not null) and public.is_office_finance(office_id))
    or ((office_id is null) and (user_id = auth.uid()))
  );

alter policy finance_tx_update on public.finance_transactions
  using (
    ((office_id is not null) and public.is_office_finance(office_id))
    or ((office_id is null) and (user_id = auth.uid()))
  );

alter policy finance_tx_delete on public.finance_transactions
  using (
    ((office_id is not null) and public.is_office_finance(office_id))
    or ((office_id is null) and (user_id = auth.uid()))
  );

alter policy finance_splits_insert on public.finance_splits
  with check (
    ((office_id is not null) and public.is_office_finance(office_id))
    or ((office_id is null) and (user_id = auth.uid()))
  );

alter policy finance_splits_update on public.finance_splits
  using (
    ((office_id is not null) and public.is_office_finance(office_id))
    or ((office_id is null) and (user_id = auth.uid()))
  );

alter policy finance_splits_delete on public.finance_splits
  using (
    ((office_id is not null) and public.is_office_finance(office_id))
    or ((office_id is null) and (user_id = auth.uid()))
  );

alter policy finance_accounts_insert on public.finance_accounts
  with check (
    ((office_id is not null) and public.is_office_finance(office_id))
    or ((office_id is null) and (user_id = auth.uid()))
  );

alter policy finance_accounts_update on public.finance_accounts
  using (
    ((office_id is not null) and public.is_office_finance(office_id))
    or ((office_id is null) and (user_id = auth.uid()))
  );

alter policy finance_accounts_delete on public.finance_accounts
  using (
    ((office_id is not null) and public.is_office_finance(office_id))
    or ((office_id is null) and (user_id = auth.uid()))
  );

alter policy finance_categories_insert on public.finance_categories
  with check (
    ((office_id is not null) and public.is_office_finance(office_id))
    or ((office_id is null) and (user_id = auth.uid()))
  );

alter policy finance_categories_update on public.finance_categories
  using (
    ((office_id is not null) and public.is_office_finance(office_id))
    or ((office_id is null) and (user_id = auth.uid()))
  );

alter policy finance_categories_delete on public.finance_categories
  using (
    ((office_id is not null) and public.is_office_finance(office_id))
    or ((office_id is null) and (user_id = auth.uid()))
  );

alter policy finance_parties_insert on public.finance_parties
  with check (
    ((office_id is not null) and public.is_office_finance(office_id))
    or ((office_id is null) and (user_id = auth.uid()))
  );

alter policy finance_parties_update on public.finance_parties
  using (
    ((office_id is not null) and public.is_office_finance(office_id))
    or ((office_id is null) and (user_id = auth.uid()))
  );

alter policy finance_parties_delete on public.finance_parties
  using (
    ((office_id is not null) and public.is_office_finance(office_id))
    or ((office_id is null) and (user_id = auth.uid()))
  );

commit;
