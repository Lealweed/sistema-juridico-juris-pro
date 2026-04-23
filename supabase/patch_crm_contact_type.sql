-- ============================================================
-- patch_crm_contact_type.sql
-- Separação definitiva entre leads e clientes via coluna contact_type.
-- Idempotente: seguro para executar mais de uma vez.
-- ============================================================

begin;

-- ===== 1) Coluna contact_type =====
alter table public.clients
  add column if not exists contact_type text not null default 'lead';

-- ===== 2) Constraint de domínio (idempotente via DO) =====
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name   = 'clients'
      and constraint_name = 'clients_contact_type_check'
  ) then
    alter table public.clients
      add constraint clients_contact_type_check
        check (contact_type in ('lead', 'client'));
  end if;
end $$;

-- ===== 3) Migração de dados =====

-- Leads automáticos: bot-id ou user_id nulo
update public.clients
set    contact_type = 'lead'
where  contact_type = 'lead'   -- re-confirma (já é o default, mas torna explícito)
  and  (
    user_id = '00000000-0000-0000-0000-000000000000'::uuid
    or user_id is null
  );

-- Clientes confirmados: criados por staff (user_id real)
update public.clients
set    contact_type = 'client'
where  contact_type = 'lead'
  and  user_id is not null
  and  user_id != '00000000-0000-0000-0000-000000000000'::uuid;

-- ===== 4) Índice para performance dos filtros de página =====
create index if not exists clients_contact_type_idx
  on public.clients (contact_type);

-- ===== 5) Comentário descritivo =====
comment on column public.clients.contact_type is
  'Classificação formal: ''lead'' = prospecto captado via site/bot/webhook; ''client'' = cliente confirmado pelo escritório.';

-- ===== 6) Atualiza RPC submit_lead para ser explícita no contact_type =====
-- DROP necessário pois o Postgres não permite alterar o tipo de retorno via CREATE OR REPLACE
drop function if exists public.submit_lead(text, text, text, text);

create or replace function public.submit_lead(
  p_name        text,
  p_whatsapp    text,
  p_area        text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_client_id uuid;
  v_case_id   uuid;
begin
  -- 1) Insere como lead explícito
  insert into public.clients (user_id, name, whatsapp, notes, contact_type)
  values (
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_name,
    regexp_replace(p_whatsapp, '[^0-9]', '', 'g'),
    'Lead captado pelo site',
    'lead'
  )
  returning id into v_client_id;

  -- 2) Caso vinculado
  insert into public.cases (user_id, client_id, title, description, status, area)
  values (
    '00000000-0000-0000-0000-000000000000'::uuid,
    v_client_id,
    'Novo Lead (Site): ' || coalesce(p_area, 'Geral'),
    p_description,
    'Triagem',
    p_area
  )
  returning id into v_case_id;

  return jsonb_build_object(
    'client_id', v_client_id,
    'case_id',   v_case_id
  );
end;
$$;

grant execute on function public.submit_lead(text, text, text, text) to anon;
grant execute on function public.submit_lead(text, text, text, text) to authenticated;

commit;
