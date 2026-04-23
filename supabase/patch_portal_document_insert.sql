-- ============================================================
-- patch_portal_document_insert.sql
-- Cria RPC security definer para o portal inserir documentos
-- sem precisar de policy RLS direta para anon na tabela documents.
-- Idempotente: seguro para executar mais de uma vez.
-- ============================================================

-- Permite user_id nulo (uploads do portal não têm usuário autenticado)
-- O tipo TypeScript DocumentRow já declara user_id: string | null
alter table public.documents
  alter column user_id drop not null;

-- RPC chamada pelo portal após o upload de arquivo no storage.
-- Valida que o client_id tem sessão ativa antes de inserir.
create or replace function public.portal_insert_document(
  p_session_token uuid,
  p_doc_id        uuid,
  p_client_id     uuid,
  p_title         text,
  p_file_path     text,
  p_mime_type     text  default null,
  p_size_bytes    bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_client_id uuid;
begin
  -- Valida sessão do portal
  v_client_id := public.portal_assert_session(p_session_token);

  -- Garante que o documento pertence ao cliente da sessão
  if v_client_id <> p_client_id then
    raise exception 'Sessão inválida para este cliente.';
  end if;

  insert into public.documents (
    id,
    user_id,
    client_id,
    kind,
    title,
    file_path,
    mime_type,
    size_bytes,
    is_public
  ) values (
    p_doc_id,
    null,                                          -- sem usuário autenticado (portal anon)
    p_client_id,
    'personal',
    btrim(coalesce(p_title, 'Documento')),
    p_file_path,
    nullif(btrim(coalesce(p_mime_type, '')), ''),
    p_size_bytes,
    true   -- visível ao cliente no portal
  );

  return jsonb_build_object('id', p_doc_id, 'status', 'ok');
end;
$$;

grant execute on function public.portal_insert_document(uuid, uuid, uuid, text, text, text, bigint) to anon;
grant execute on function public.portal_insert_document(uuid, uuid, uuid, text, text, text, bigint) to authenticated;
