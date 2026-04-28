-- ============================================================
-- patch_rpc_get_client_next_agenda.sql
-- Consulta somente leitura da próxima data do cliente na agenda
-- ============================================================

create or replace function public.get_client_next_agenda(
  p_client_id uuid,
  p_office_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_item record;
  v_is_member boolean := false;
  v_role text := coalesce(auth.role(), '');
begin
  if p_client_id is null or p_office_id is null then
    return jsonb_build_object(
      'has_event', false,
      'message', 'Parâmetros inválidos.'
    );
  end if;

  if v_role <> 'service_role' then
    select exists (
      select 1
      from public.office_members om
      where om.office_id = p_office_id
        and om.user_id = auth.uid()
    ) into v_is_member;

    if not v_is_member then
      return jsonb_build_object(
        'has_event', false,
        'message', 'Sem permissão para consultar agenda deste escritório.'
      );
    end if;
  end if;

  select
    a.id,
    a.title,
    a.notes,
    a.kind,
    a.status,
    a.location,
    a.starts_at,
    a.ends_at,
    a.due_date
  into v_item
  from public.agenda_items a
  where a.office_id = p_office_id
    and a.client_id = p_client_id
    and coalesce(a.status, '') not in ('cancelled','canceled')
    and (
      (a.starts_at is not null and a.starts_at >= now())
      or (a.starts_at is null and a.due_date is not null and a.due_date >= current_date)
    )
  order by coalesce(a.starts_at, a.due_date::timestamp) asc
  limit 1;

  if not found then
    return jsonb_build_object(
      'has_event', false,
      'message', 'Nenhuma data futura encontrada para este cliente.'
    );
  end if;

  return jsonb_build_object(
    'has_event', true,
    'id', v_item.id,
    'title', v_item.title,
    'notes', v_item.notes,
    'kind', v_item.kind,
    'status', v_item.status,
    'location', v_item.location,
    'starts_at', v_item.starts_at,
    'ends_at', v_item.ends_at,
    'due_date', v_item.due_date,
    'message', 'Há data registrada para este cliente.'
  );
end;
$$;

revoke execute on function public.get_client_next_agenda(uuid, uuid) from public;
revoke execute on function public.get_client_next_agenda(uuid, uuid) from anon;
grant execute on function public.get_client_next_agenda(uuid, uuid) to authenticated;
grant execute on function public.get_client_next_agenda(uuid, uuid) to service_role;
