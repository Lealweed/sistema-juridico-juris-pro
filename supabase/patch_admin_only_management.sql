-- Hardening: acoes administrativas de equipe e financeiro apenas para admin.
-- Mantem leituras operacionais, mas exige admin nas mutacoes sensiveis.

begin;

alter table if exists public.office_members enable row level security;
alter table if exists public.office_invites enable row level security;
alter table if exists public.finance_transactions enable row level security;
alter table if exists public.finance_splits enable row level security;
alter table if exists public.finance_accounts enable row level security;
alter table if exists public.finance_categories enable row level security;
alter table if exists public.finance_parties enable row level security;

drop policy if exists office_members_admin_insert_guard on public.office_members;
create policy office_members_admin_insert_guard on public.office_members
as restrictive
for insert to authenticated
with check (public.is_office_admin(office_id));

drop policy if exists office_members_admin_update_guard on public.office_members;
create policy office_members_admin_update_guard on public.office_members
as restrictive
for update to authenticated
using (public.is_office_admin(office_id))
with check (public.is_office_admin(office_id));

drop policy if exists office_members_admin_delete_guard on public.office_members;
create policy office_members_admin_delete_guard on public.office_members
as restrictive
for delete to authenticated
using (public.is_office_admin(office_id));

drop policy if exists office_invites_admin_insert_guard on public.office_invites;
create policy office_invites_admin_insert_guard on public.office_invites
as restrictive
for insert to authenticated
with check (public.is_office_admin(office_id));

drop policy if exists office_invites_admin_delete_guard on public.office_invites;
create policy office_invites_admin_delete_guard on public.office_invites
as restrictive
for delete to authenticated
using (public.is_office_admin(office_id));

drop policy if exists finance_tx_admin_insert_guard on public.finance_transactions;
create policy finance_tx_admin_insert_guard on public.finance_transactions
as restrictive
for insert to authenticated
with check (public.is_office_admin(coalesce(office_id, public._default_office_id())));

drop policy if exists finance_tx_admin_update_guard on public.finance_transactions;
create policy finance_tx_admin_update_guard on public.finance_transactions
as restrictive
for update to authenticated
using (public.is_office_admin(office_id))
with check (public.is_office_admin(office_id));

drop policy if exists finance_tx_admin_delete_guard on public.finance_transactions;
create policy finance_tx_admin_delete_guard on public.finance_transactions
as restrictive
for delete to authenticated
using (public.is_office_admin(office_id));

drop policy if exists finance_splits_admin_insert_guard on public.finance_splits;
create policy finance_splits_admin_insert_guard on public.finance_splits
as restrictive
for insert to authenticated
with check (public.is_office_admin(coalesce(office_id, public._default_office_id())));

drop policy if exists finance_splits_admin_update_guard on public.finance_splits;
create policy finance_splits_admin_update_guard on public.finance_splits
as restrictive
for update to authenticated
using (public.is_office_admin(office_id))
with check (public.is_office_admin(office_id));

drop policy if exists finance_splits_admin_delete_guard on public.finance_splits;
create policy finance_splits_admin_delete_guard on public.finance_splits
as restrictive
for delete to authenticated
using (public.is_office_admin(office_id));

drop policy if exists finance_accounts_admin_insert_guard on public.finance_accounts;
create policy finance_accounts_admin_insert_guard on public.finance_accounts
as restrictive
for insert to authenticated
with check (public.is_office_admin(coalesce(office_id, public._default_office_id())));

drop policy if exists finance_accounts_admin_update_guard on public.finance_accounts;
create policy finance_accounts_admin_update_guard on public.finance_accounts
as restrictive
for update to authenticated
using (public.is_office_admin(office_id))
with check (public.is_office_admin(office_id));

drop policy if exists finance_accounts_admin_delete_guard on public.finance_accounts;
create policy finance_accounts_admin_delete_guard on public.finance_accounts
as restrictive
for delete to authenticated
using (public.is_office_admin(office_id));

drop policy if exists finance_categories_admin_insert_guard on public.finance_categories;
create policy finance_categories_admin_insert_guard on public.finance_categories
as restrictive
for insert to authenticated
with check (public.is_office_admin(coalesce(office_id, public._default_office_id())));

drop policy if exists finance_categories_admin_update_guard on public.finance_categories;
create policy finance_categories_admin_update_guard on public.finance_categories
as restrictive
for update to authenticated
using (public.is_office_admin(office_id))
with check (public.is_office_admin(office_id));

drop policy if exists finance_categories_admin_delete_guard on public.finance_categories;
create policy finance_categories_admin_delete_guard on public.finance_categories
as restrictive
for delete to authenticated
using (public.is_office_admin(office_id));

drop policy if exists finance_parties_admin_insert_guard on public.finance_parties;
create policy finance_parties_admin_insert_guard on public.finance_parties
as restrictive
for insert to authenticated
with check (public.is_office_admin(coalesce(office_id, public._default_office_id())));

drop policy if exists finance_parties_admin_update_guard on public.finance_parties;
create policy finance_parties_admin_update_guard on public.finance_parties
as restrictive
for update to authenticated
using (public.is_office_admin(office_id))
with check (public.is_office_admin(office_id));

drop policy if exists finance_parties_admin_delete_guard on public.finance_parties;
create policy finance_parties_admin_delete_guard on public.finance_parties
as restrictive
for delete to authenticated
using (public.is_office_admin(office_id));

commit;