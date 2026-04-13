-- Fase 1: Seguranca + Papeis (owner/advogado/colaborador) + recibos
-- Idempotente para aplicar em ambientes com schema parcial.

begin;

-- 1) office_members
create table if not exists public.office_members (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists office_members_office_user_uidx
  on public.office_members (office_id, user_id);

-- Converte papeis legados para o trio juridico.
update public.office_members
set role = case lower(role)
  when 'owner' then 'owner'
  when 'admin' then 'owner'
  when 'administrator' then 'owner'
  when 'advogado' then 'advogado'
  when 'lawyer' then 'advogado'
  when 'finance' then 'advogado'
  when 'colaborador' then 'colaborador'
  when 'member' then 'colaborador'
  when 'staff' then 'colaborador'
  when 'assistant' then 'colaborador'
  when 'secretary' then 'colaborador'
  else 'colaborador'
end;

alter table public.office_members
  drop constraint if exists office_members_role_check;

alter table public.office_members
  add constraint office_members_role_check
  check (role in ('owner', 'advogado', 'colaborador'));

-- Helpers de papel
create or replace function public.normalize_office_role(p_role text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(p_role, ''))
    when 'owner' then 'owner'
    when 'admin' then 'owner'
    when 'administrator' then 'owner'
    when 'advogado' then 'advogado'
    when 'lawyer' then 'advogado'
    when 'finance' then 'advogado'
    when 'colaborador' then 'colaborador'
    when 'member' then 'colaborador'
    when 'staff' then 'colaborador'
    when 'assistant' then 'colaborador'
    when 'secretary' then 'colaborador'
    else lower(coalesce(p_role, ''))
  end;
$$;

create or replace function public.is_office_role(p_office_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists(
    select 1
    from public.office_members m
    where m.office_id = p_office_id
      and m.user_id = auth.uid()
      and public.normalize_office_role(m.role) = any(
        array(
          select public.normalize_office_role(x)
          from unnest(p_roles) as x
        )
      )
  );
$$;

revoke all on function public.is_office_role(uuid, text[]) from public;
grant execute on function public.is_office_role(uuid, text[]) to authenticated;

create or replace function public.is_office_admin(p_office_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_office_role(p_office_id, array['owner']);
$$;

revoke all on function public.is_office_admin(uuid) from public;
grant execute on function public.is_office_admin(uuid) to authenticated;

create or replace function public.is_office_finance(p_office_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_office_role(p_office_id, array['owner', 'advogado']);
$$;

revoke all on function public.is_office_finance(uuid) from public;
grant execute on function public.is_office_finance(uuid) to authenticated;

-- 2) receipts
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  description text,
  status text not null default 'emitido',
  issued_at timestamptz not null default now(),
  pdf_url text,
  created_at timestamptz not null default now()
);

create index if not exists receipts_office_idx on public.receipts (office_id, issued_at desc);
create index if not exists receipts_client_idx on public.receipts (client_id, issued_at desc);
create index if not exists receipts_created_by_idx on public.receipts (created_by, created_at desc);

alter table public.receipts enable row level security;

-- 3.1) clients RLS por papel (owner/advogado/colaborador)
drop policy if exists clients_select on public.clients;
drop policy if exists clients_read_office on public.clients;
drop policy if exists clients_update on public.clients;
drop policy if exists clients_write_office on public.clients;

create policy clients_select_roles on public.clients
for select to authenticated
using (
  (office_id is not null and public.is_office_role(office_id, array['owner','advogado','colaborador']))
  or (office_id is null and user_id = auth.uid())
);

create policy clients_update_roles on public.clients
for update to authenticated
using (
  (office_id is not null and public.is_office_role(office_id, array['owner','advogado','colaborador']))
  or (office_id is null and user_id = auth.uid())
)
with check (
  (office_id is not null and public.is_office_role(office_id, array['owner','advogado','colaborador']))
  or (office_id is null and user_id = auth.uid())
);

-- 3.2) receipts RLS
-- Owner/advogado: controle total no office
drop policy if exists receipts_select_owner_advogado on public.receipts;
drop policy if exists receipts_insert_owner_advogado on public.receipts;
drop policy if exists receipts_update_owner_advogado on public.receipts;
drop policy if exists receipts_delete_owner_advogado on public.receipts;

create policy receipts_select_owner_advogado on public.receipts
for select to authenticated
using (public.is_office_role(office_id, array['owner','advogado']));

create policy receipts_insert_owner_advogado on public.receipts
for insert to authenticated
with check (
  public.is_office_role(office_id, array['owner','advogado'])
  and created_by = auth.uid()
  and amount > 0
);

create policy receipts_update_owner_advogado on public.receipts
for update to authenticated
using (public.is_office_role(office_id, array['owner','advogado']))
with check (
  public.is_office_role(office_id, array['owner','advogado'])
  and created_by is not null
  and amount > 0
);

create policy receipts_delete_owner_advogado on public.receipts
for delete to authenticated
using (public.is_office_role(office_id, array['owner','advogado']));

-- Colaborador: pode emitir e visualizar somente contexto proprio/atribuido
drop policy if exists receipts_insert_colaborador on public.receipts;
drop policy if exists receipts_select_colaborador on public.receipts;
drop policy if exists receipts_update_colaborador on public.receipts;

create policy receipts_insert_colaborador on public.receipts
for insert to authenticated
with check (
  public.is_office_role(office_id, array['colaborador'])
  and created_by = auth.uid()
  and amount > 0
);

create policy receipts_select_colaborador on public.receipts
for select to authenticated
using (
  public.is_office_role(office_id, array['colaborador'])
  and (
    created_by = auth.uid()
    or exists (
      select 1
      from public.cases c
      where c.office_id = receipts.office_id
        and c.responsible_user_id = auth.uid()
        and (
          c.client_id = receipts.client_id
          or exists (
            select 1
            from public.case_clients cc
            where cc.case_id = c.id
              and cc.client_id = receipts.client_id
          )
        )
    )
  )
);

create policy receipts_update_colaborador on public.receipts
for update to authenticated
using (
  public.is_office_role(office_id, array['colaborador'])
  and created_by = auth.uid()
)
with check (
  public.is_office_role(office_id, array['colaborador'])
  and created_by = auth.uid()
  and amount > 0
);

create or replace function public.receipts_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'emitido' and new.amount <> old.amount then
    raise exception 'amount_cannot_change_after_issued';
  end if;

  if public.is_office_role(old.office_id, array['colaborador']) then
    if new.office_id <> old.office_id
      or new.client_id <> old.client_id
      or new.created_by <> old.created_by
      or new.amount <> old.amount
      or coalesce(new.description, '') <> coalesce(old.description, '')
      or new.issued_at <> old.issued_at
      or new.created_at <> old.created_at then
      raise exception 'collaborator_can_only_update_status_or_pdf';
    end if;
  end if;

  if new.amount <= 0 then
    raise exception 'amount_must_be_positive';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_receipts_guard_update on public.receipts;
create trigger tr_receipts_guard_update
before update on public.receipts
for each row execute function public.receipts_guard_update();

-- 3.3) Bloqueio de dados financeiros globais para colaborador
-- Tabelas conhecidas no projeto atual
alter table public.finance_transactions enable row level security;
drop policy if exists finance_tx_block_colaborador_select on public.finance_transactions;
create policy finance_tx_block_colaborador_select on public.finance_transactions
as restrictive
for select to authenticated
using (not public.is_office_role(office_id, array['colaborador']));

-- Tabelas futuras de dashboard financeiro (caso existam)
do $$
declare
  t text;
  target_tables text[] := array['financial_reports', 'office_metrics'];
begin
  foreach t in array target_tables loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = t
    ) then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_block_colaborador_select', t);
      execute format(
        'create policy %I on public.%I as restrictive for select to authenticated using (not public.is_office_role(office_id, array[''colaborador'']))',
        t || '_block_colaborador_select',
        t
      );
    end if;
  end loop;

  -- TODO: quando novas tabelas de faturamento global forem criadas, incluir no array target_tables.
end $$;

-- 4) RPC segura para emissao de recibo
create or replace function public.create_receipt_secure(
  p_office_id uuid,
  p_client_id uuid,
  p_amount numeric,
  p_description text default null,
  p_status text default 'emitido',
  p_issued_at timestamptz default now(),
  p_pdf_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_receipt_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  if not public.is_office_role(p_office_id, array['owner','advogado','colaborador']) then
    raise exception 'not_office_member';
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.office_id = p_office_id
  ) then
    raise exception 'client_not_in_office';
  end if;

  insert into public.receipts (
    office_id,
    client_id,
    created_by,
    amount,
    description,
    status,
    issued_at,
    pdf_url
  )
  values (
    p_office_id,
    p_client_id,
    v_user_id,
    p_amount,
    p_description,
    coalesce(nullif(trim(p_status), ''), 'emitido'),
    coalesce(p_issued_at, now()),
    p_pdf_url
  )
  returning id into v_receipt_id;

  return v_receipt_id;
end;
$$;

revoke all on function public.create_receipt_secure(uuid, uuid, numeric, text, text, timestamptz, text) from public;
grant execute on function public.create_receipt_secure(uuid, uuid, numeric, text, text, timestamptz, text) to authenticated;

grant select, insert, update, delete on public.receipts to authenticated;

commit;
