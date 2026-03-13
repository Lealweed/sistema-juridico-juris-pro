-- CRM Jurídico: audit logs (minimal)
-- Applied via psql on 2026-02-10.

begin;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  office_id uuid null references public.offices(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  action text not null, -- insert|update|delete
  table_name text not null,
  record_id uuid null,
  before_data jsonb null,
  after_data jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_office_created_idx on public.audit_logs (office_id, created_at desc);
create index if not exists audit_logs_user_created_idx on public.audit_logs (user_id, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select on public.audit_logs;
drop policy if exists audit_logs_insert on public.audit_logs;
drop policy if exists audit_logs_update on public.audit_logs;
drop policy if exists audit_logs_delete on public.audit_logs;

create policy audit_logs_select on public.audit_logs
for select using (
  ((office_id is not null) and public.is_office_member(office_id))
  or (user_id = auth.uid())
);

create policy audit_logs_insert on public.audit_logs
for insert with check (false);
create policy audit_logs_update on public.audit_logs
for update using (false);
create policy audit_logs_delete on public.audit_logs
for delete using (false);

create or replace function public._audit_log_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office_id uuid;
  v_user_id uuid;
  v_record_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_action text;
  v_table text;
begin
  v_table := tg_table_name;
  v_user_id := auth.uid();

  if (tg_op = 'INSERT') then
    v_action := 'insert';
    v_before := null;
    v_after := to_jsonb(new);
    v_record_id := (new).id;
    v_office_id := (new).office_id;
  elsif (tg_op = 'UPDATE') then
    v_action := 'update';
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    v_record_id := (new).id;
    v_office_id := coalesce((new).office_id, (old).office_id);
  elsif (tg_op = 'DELETE') then
    v_action := 'delete';
    v_before := to_jsonb(old);
    v_after := null;
    v_record_id := (old).id;
    v_office_id := (old).office_id;
  else
    return null;
  end if;

  insert into public.audit_logs (office_id, user_id, action, table_name, record_id, before_data, after_data)
  values (v_office_id, v_user_id, v_action, v_table, v_record_id, v_before, v_after);

  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$$;

-- Attach to core tables (idempotent)
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'tr_audit_clients') then
    create trigger tr_audit_clients
    after insert or update or delete on public.clients
    for each row execute function public._audit_log_row();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tr_audit_cases') then
    create trigger tr_audit_cases
    after insert or update or delete on public.cases
    for each row execute function public._audit_log_row();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tr_audit_tasks') then
    create trigger tr_audit_tasks
    after insert or update or delete on public.tasks
    for each row execute function public._audit_log_row();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tr_audit_agenda_items') then
    create trigger tr_audit_agenda_items
    after insert or update or delete on public.agenda_items
    for each row execute function public._audit_log_row();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tr_audit_documents') then
    create trigger tr_audit_documents
    after insert or update or delete on public.documents
    for each row execute function public._audit_log_row();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tr_audit_finance_transactions') then
    create trigger tr_audit_finance_transactions
    after insert or update or delete on public.finance_transactions
    for each row execute function public._audit_log_row();
  end if;
end $$;

commit;
