-- Garante que a tabela do chat do portal participe do Supabase Realtime.
-- Execute este patch em ambientes onde patch_client_portal_access.sql ja foi rodado.

begin;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'client_messages'
  ) then
    alter publication supabase_realtime add table public.client_messages;
  end if;
end
$$;

commit;