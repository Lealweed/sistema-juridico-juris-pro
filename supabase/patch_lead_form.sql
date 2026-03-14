-- ============================================================
-- patch_lead_form.sql
-- RPC p/ formulário de leads público (sem autenticação)
-- ============================================================

create or replace function public.submit_lead(
  p_name       text,
  p_whatsapp   text,
  p_area       text,
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
  -- 1) Insere cliente (user_id = 00000000-... placeholder "lead bot")
  insert into public.clients (user_id, name, whatsapp, notes)
  values (
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_name,
    regexp_replace(p_whatsapp, '[^0-9]', '', 'g'),
    'Lead captado pelo site'
  )
  returning id into v_client_id;

  -- 2) Insere caso vinculado
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

-- Permite chamada anônima (visitante do site)
grant execute on function public.submit_lead(text, text, text, text) to anon;
grant execute on function public.submit_lead(text, text, text, text) to authenticated;
