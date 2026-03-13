-- CRM Jurídico: audit_logs v2 (link columns for easy timelines)
-- Applied via psql on 2026-02-10.

begin;

alter table public.audit_logs
  add column if not exists client_id uuid null references public.clients(id) on delete set null;

alter table public.audit_logs
  add column if not exists case_id uuid null references public.cases(id) on delete set null;

alter table public.audit_logs
  add column if not exists task_id uuid null references public.tasks(id) on delete set null;

create index if not exists audit_logs_client_created_idx on public.audit_logs (client_id, created_at desc);
create index if not exists audit_logs_case_created_idx on public.audit_logs (case_id, created_at desc);
create index if not exists audit_logs_task_created_idx on public.audit_logs (task_id, created_at desc);

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
  v_client_id uuid;
  v_case_id uuid;
  v_task_id uuid;
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

  if v_table = 'clients' then
    v_client_id := v_record_id;
  elsif v_table = 'cases' then
    v_case_id := v_record_id;
    v_client_id := nullif(coalesce((v_after->>'client_id'), (v_before->>'client_id')), '')::uuid;
  elsif v_table = 'tasks' then
    v_task_id := v_record_id;
    v_client_id := nullif(coalesce((v_after->>'client_id'), (v_before->>'client_id')), '')::uuid;
    v_case_id := nullif(coalesce((v_after->>'case_id'), (v_before->>'case_id')), '')::uuid;
  elsif v_table = 'documents' then
    v_client_id := nullif(coalesce((v_after->>'client_id'), (v_before->>'client_id')), '')::uuid;
    v_case_id := nullif(coalesce((v_after->>'case_id'), (v_before->>'case_id')), '')::uuid;
    v_task_id := nullif(coalesce((v_after->>'task_id'), (v_before->>'task_id')), '')::uuid;
  elsif v_table = 'finance_transactions' then
    v_client_id := nullif(coalesce((v_after->>'client_id'), (v_before->>'client_id')), '')::uuid;
    v_case_id := nullif(coalesce((v_after->>'case_id'), (v_before->>'case_id')), '')::uuid;
  else
    v_client_id := null;
    v_case_id := null;
    v_task_id := null;
  end if;

  insert into public.audit_logs (office_id, user_id, action, table_name, record_id, client_id, case_id, task_id, before_data, after_data)
  values (v_office_id, v_user_id, v_action, v_table, v_record_id, v_client_id, v_case_id, v_task_id, v_before, v_after);

  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$$;

update public.audit_logs
set client_id = record_id
where client_id is null and table_name = 'clients';

update public.audit_logs
set case_id = record_id
where case_id is null and table_name = 'cases';

update public.audit_logs
set client_id = nullif(coalesce(after_data->>'client_id', before_data->>'client_id'), '')::uuid
where client_id is null and table_name in ('cases','tasks','documents','finance_transactions');

update public.audit_logs
set case_id = nullif(coalesce(after_data->>'case_id', before_data->>'case_id'), '')::uuid
where case_id is null and table_name in ('tasks','documents','finance_transactions');

update public.audit_logs
set task_id = nullif(coalesce(after_data->>'task_id', before_data->>'task_id'), '')::uuid
where task_id is null and table_name in ('tasks','documents');

commit;
