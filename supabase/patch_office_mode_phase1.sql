-- CRM Jurídico: Office mode (phase 1)
-- Creates a default office, adds existing users as members, backfills office_id, adds helper functions/triggers,
-- and updates RLS for clients/cases/agenda to be office-aware.
--
-- Applied via psql on 2026-02-10.

begin;

-- 1) Ensure roles are constrained
alter table public.office_members
  drop constraint if exists office_members_role_check;

alter table public.office_members
  add constraint office_members_role_check
  check (role in ('admin','finance','staff','member'));

-- 2) Helper: is_office_admin(office_id)
create or replace function public.is_office_admin(p_office_id uuid)
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
      and m.role = 'admin'
  );
$$;

revoke all on function public.is_office_admin(uuid) from public;
grant execute on function public.is_office_admin(uuid) to authenticated;

-- 3) Create a default office (idempotent) + helper to resolve it
with ins as (
  insert into public.offices (name)
  select 'Escritório padrão'
  where not exists (select 1 from public.offices)
  returning id
)
select 1;

create or replace function public._default_office_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.offices order by created_at asc limit 1;
$$;

revoke all on function public._default_office_id() from public;
grant execute on function public._default_office_id() to authenticated;

-- 4) Insert office members for existing users (idempotent)
insert into public.office_members (office_id, user_id, role)
select public._default_office_id() as office_id,
       u.user_id,
       case
         when u.user_id = (
           select x.user_id
           from (
             select distinct user_id from public.clients
             union select distinct user_id from public.cases
             union select distinct user_id from public.tasks
             union select distinct user_id from public.agenda_items
             union select distinct user_id from public.documents
             union select distinct user_id from public.finance_transactions
             union select distinct user_id from public.user_profiles
           ) x
           order by x.user_id::text asc
           limit 1
         )
         then 'admin'
         else 'member'
       end as role
from (
  select distinct user_id from public.clients
  union select distinct user_id from public.cases
  union select distinct user_id from public.tasks
  union select distinct user_id from public.agenda_items
  union select distinct user_id from public.documents
  union select distinct user_id from public.finance_transactions
  union select distinct user_id from public.user_profiles
) u
where u.user_id is not null
on conflict (office_id, user_id) do nothing;

-- 5) Backfill office_id on tables (idempotent)
update public.clients c
set office_id = public._default_office_id()
where c.office_id is null;

update public.cases k
set office_id = public._default_office_id()
where k.office_id is null;

update public.tasks t
set office_id = public._default_office_id()
where t.office_id is null;

update public.agenda_items a
set office_id = public._default_office_id()
where a.office_id is null;

update public.documents d
set office_id = public._default_office_id()
where d.office_id is null;

update public.user_profiles p
set office_id = public._default_office_id()
where p.office_id is null;

update public.finance_transactions tx
set office_id = public._default_office_id()
where tx.office_id is null;

update public.finance_accounts a
set office_id = public._default_office_id()
where a.office_id is null;

update public.finance_categories c
set office_id = public._default_office_id()
where c.office_id is null;

update public.finance_parties p
set office_id = public._default_office_id()
where p.office_id is null;

update public.finance_splits s
set office_id = public._default_office_id()
where s.office_id is null;

-- 6) Auto-fill office_id on insert (safety net)
create or replace function public._ensure_office_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.office_id is null then
    new.office_id := public._default_office_id();
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'tr_clients_ensure_office_id') then
    create trigger tr_clients_ensure_office_id before insert on public.clients
    for each row execute function public._ensure_office_id();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tr_cases_ensure_office_id') then
    create trigger tr_cases_ensure_office_id before insert on public.cases
    for each row execute function public._ensure_office_id();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tr_tasks_ensure_office_id') then
    create trigger tr_tasks_ensure_office_id before insert on public.tasks
    for each row execute function public._ensure_office_id();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tr_agenda_ensure_office_id') then
    create trigger tr_agenda_ensure_office_id before insert on public.agenda_items
    for each row execute function public._ensure_office_id();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tr_documents_ensure_office_id') then
    create trigger tr_documents_ensure_office_id before insert on public.documents
    for each row execute function public._ensure_office_id();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tr_finance_tx_ensure_office_id') then
    create trigger tr_finance_tx_ensure_office_id before insert on public.finance_transactions
    for each row execute function public._ensure_office_id();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tr_finance_accounts_ensure_office_id') then
    create trigger tr_finance_accounts_ensure_office_id before insert on public.finance_accounts
    for each row execute function public._ensure_office_id();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tr_finance_categories_ensure_office_id') then
    create trigger tr_finance_categories_ensure_office_id before insert on public.finance_categories
    for each row execute function public._ensure_office_id();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tr_finance_parties_ensure_office_id') then
    create trigger tr_finance_parties_ensure_office_id before insert on public.finance_parties
    for each row execute function public._ensure_office_id();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tr_finance_splits_ensure_office_id') then
    create trigger tr_finance_splits_ensure_office_id before insert on public.finance_splits
    for each row execute function public._ensure_office_id();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tr_user_profiles_ensure_office_id') then
    create trigger tr_user_profiles_ensure_office_id before insert on public.user_profiles
    for each row execute function public._ensure_office_id();
  end if;
end $$;

-- 7) Update RLS policies: clients/cases/agenda become office-aware (hybrid)
-- Clients
drop policy if exists clients_select_own on public.clients;
drop policy if exists clients_insert_own on public.clients;
drop policy if exists clients_update_own on public.clients;
drop policy if exists clients_delete_own on public.clients;

create policy clients_select on public.clients
for select using (
  ((office_id is not null) and public.is_office_member(office_id))
  or ((office_id is null) and (user_id = auth.uid()))
);

create policy clients_insert on public.clients
for insert with check (
  ((office_id is not null) and public.is_office_member(office_id))
  or ((office_id is null) and (user_id = auth.uid()))
);

create policy clients_update on public.clients
for update using (
  ((office_id is not null) and public.is_office_member(office_id))
  or ((office_id is null) and (user_id = auth.uid()))
);

create policy clients_delete on public.clients
for delete using (
  ((office_id is not null) and public.is_office_member(office_id))
  or ((office_id is null) and (user_id = auth.uid()))
);

-- Cases
drop policy if exists cases_select_own on public.cases;
drop policy if exists cases_insert_own on public.cases;
drop policy if exists cases_update_own on public.cases;
drop policy if exists cases_delete_own on public.cases;

create policy cases_select on public.cases
for select using (
  ((office_id is not null) and public.is_office_member(office_id))
  or ((office_id is null) and (user_id = auth.uid()))
);

create policy cases_insert on public.cases
for insert with check (
  ((office_id is not null) and public.is_office_member(office_id))
  or ((office_id is null) and (user_id = auth.uid()))
);

create policy cases_update on public.cases
for update using (
  ((office_id is not null) and public.is_office_member(office_id))
  or ((office_id is null) and (user_id = auth.uid()))
);

create policy cases_delete on public.cases
for delete using (
  ((office_id is not null) and public.is_office_member(office_id))
  or ((office_id is null) and (user_id = auth.uid()))
);

-- Agenda items
drop policy if exists agenda_select_own on public.agenda_items;
drop policy if exists agenda_insert_own on public.agenda_items;
drop policy if exists agenda_update_own on public.agenda_items;
drop policy if exists agenda_delete_own on public.agenda_items;

create policy agenda_select on public.agenda_items
for select using (
  ((office_id is not null) and public.is_office_member(office_id))
  or ((office_id is null) and (user_id = auth.uid()))
);

create policy agenda_insert on public.agenda_items
for insert with check (
  ((office_id is not null) and public.is_office_member(office_id))
  or ((office_id is null) and (user_id = auth.uid()))
);

create policy agenda_update on public.agenda_items
for update using (
  ((office_id is not null) and public.is_office_member(office_id))
  or ((office_id is null) and (user_id = auth.uid()))
);

create policy agenda_delete on public.agenda_items
for delete using (
  ((office_id is not null) and public.is_office_member(office_id))
  or ((office_id is null) and (user_id = auth.uid()))
);

commit;

-- Phase 1b (RLS for offices + office_members)
begin;

alter table public.offices enable row level security;
alter table public.office_members enable row level security;

-- Offices policies
drop policy if exists offices_select on public.offices;
drop policy if exists offices_insert on public.offices;
drop policy if exists offices_update on public.offices;
drop policy if exists offices_delete on public.offices;

create policy offices_select on public.offices
for select using (public.is_office_member(id));

create policy offices_insert on public.offices
for insert with check (true);

create policy offices_update on public.offices
for update using (public.is_office_admin(id));

create policy offices_delete on public.offices
for delete using (public.is_office_admin(id));

-- Office members policies
drop policy if exists office_members_select on public.office_members;
drop policy if exists office_members_insert on public.office_members;
drop policy if exists office_members_update on public.office_members;
drop policy if exists office_members_delete on public.office_members;

create policy office_members_select on public.office_members
for select using (public.is_office_member(office_id));

create policy office_members_insert on public.office_members
for insert with check (public.is_office_admin(office_id));

create policy office_members_update on public.office_members
for update using (public.is_office_admin(office_id));

create policy office_members_delete on public.office_members
for delete using (public.is_office_admin(office_id));

commit;
