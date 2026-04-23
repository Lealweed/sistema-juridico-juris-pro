-- ============================================================
-- patch_client_documents_bucket.sql
-- Cria o bucket 'client-documents' e configura RLS de storage.
-- Idempotente: seguro para executar mais de uma vez.
-- ============================================================

-- ===== 1) Criar bucket (privado por padrão) =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-documents',
  'client-documents',
  false,          -- privado: URLs assinadas para advogados; clientes usam RLS pública via portal
  26214400,       -- 25 MB
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- ===== 2) Políticas de storage =====

-- DROP idempotente das políticas antigas (nome pode ter mudado)
drop policy if exists "client-documents: authenticated read own"  on storage.objects;
drop policy if exists "client-documents: authenticated insert own" on storage.objects;
drop policy if exists "client-documents: authenticated delete own" on storage.objects;
drop policy if exists "client-documents: anon insert portal"       on storage.objects;
drop policy if exists "client-documents: anon read public"         on storage.objects;

-- Leitura: usuários autenticados veem todos os arquivos do bucket (advogados)
create policy "client-documents: authenticated read own"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'client-documents');

-- Inserção: usuários autenticados podem fazer upload
create policy "client-documents: authenticated insert own"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'client-documents');

-- Deleção: usuários autenticados podem remover
create policy "client-documents: authenticated delete own"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'client-documents');

-- Upload anônimo (portal do cliente — path começa com 'clients/{id}/portal/')
create policy "client-documents: anon insert portal"
  on storage.objects for insert
  to anon
  with check (
    bucket_id = 'client-documents'
    and (storage.foldername(name))[1] = 'clients'
    and (storage.foldername(name))[3] = 'portal'
  );

-- Leitura pública anônima apenas de arquivos marcados is_public (via RPC do portal)
-- O portal usa portal_list_client_documents (security definer) + createSignedUrl pelo backend.
-- Anon NÃO tem acesso de leitura direto; apenas através da função RPC assinada.
