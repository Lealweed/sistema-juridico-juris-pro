-- ============================================================
-- patch_client_portal_access.sql
-- Portal do cliente: sessao publica por token + home + mensagens
-- Execute este script no SQL Editor do Supabase (uma unica vez).
-- ============================================================

begin;

create table if not exists public.client_portal_sessions (
  session_token uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours')
);

create index if not exists client_portal_sessions_client_idx
  on public.client_portal_sessions (client_id);

create index if not exists client_portal_sessions_expires_idx
  on public.client_portal_sessions (expires_at);

create table if not exists public.client_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  sender text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint client_messages_sender_check check (sender in ('client', 'office'))
);

create index if not exists client_messages_client_created_idx
  on public.client_messages (client_id, created_at);

alter table public.client_messages enable row level security;

drop policy if exists client_messages_select_office on public.client_messages;
create policy client_messages_select_office on public.client_messages
for select to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = client_messages.client_id
      and public.is_office_member(c.office_id)
  )
);

drop policy if exists client_messages_insert_office on public.client_messages;
create policy client_messages_insert_office on public.client_messages
for insert to authenticated
with check (
  exists (
    select 1
    from public.clients c
    where c.id = client_messages.client_id
      and public.is_office_member(c.office_id)
  )
);

create or replace function public.portal_assert_session(p_session_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  if p_session_token is null then
    raise exception 'Sessao do portal invalida. Faca login novamente.';
  end if;

  delete from public.client_portal_sessions
  where expires_at <= now();

  select s.client_id
    into v_client_id
  from public.client_portal_sessions s
  where s.session_token = p_session_token
    and s.expires_at > now()
  limit 1;

  if v_client_id is null then
    raise exception 'Sessao do portal invalida. Faca login novamente.';
  end if;

  update public.client_portal_sessions
     set last_seen_at = now(),
         expires_at = greatest(expires_at, now() + interval '12 hours')
   where session_token = p_session_token;

  return v_client_id;
end;
$$;

revoke all on function public.portal_assert_session(uuid) from public;

create or replace function public.portal_login_client(
  p_cpf text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client record;
  v_token uuid;
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
  v_pin text := btrim(coalesce(p_pin, ''));
begin
  if length(v_cpf) <> 11 or v_pin = '' then
    raise exception 'CPF ou Senha incorretos.';
  end if;

  select
    c.id,
    c.name,
    c.phone,
    c.whatsapp,
    c.email,
    c.avatar_path,
    c.notes
    into v_client
  from public.clients c
  where regexp_replace(coalesce(c.cpf, ''), '[^0-9]', '', 'g') = v_cpf
    and btrim(coalesce(c.portal_pin, '')) = v_pin
  limit 1;

  if v_client.id is null then
    raise exception 'CPF ou Senha incorretos.';
  end if;

  insert into public.client_portal_sessions (client_id)
  values (v_client.id)
  returning session_token into v_token;

  return jsonb_build_object(
    'session_token', v_token,
    'client', jsonb_build_object(
      'id', v_client.id,
      'name', v_client.name,
      'phone', v_client.phone,
      'whatsapp', v_client.whatsapp,
      'email', v_client.email,
      'avatar_path', v_client.avatar_path,
      'notes', v_client.notes
    )
  );
end;
$$;

grant execute on function public.portal_login_client(text, text) to anon;
grant execute on function public.portal_login_client(text, text) to authenticated;

create or replace function public.portal_get_client_context(
  p_session_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_client record;
  v_next record;
begin
  v_client_id := public.portal_assert_session(p_session_token);

  select
    c.id,
    c.name,
    c.phone,
    c.whatsapp,
    c.email,
    c.avatar_path,
    c.notes
    into v_client
  from public.clients c
  where c.id = v_client_id;

  select
    a.id,
    a.title,
    a.starts_at
    into v_next
  from public.agenda_items a
  where a.client_id = v_client_id
    and a.starts_at is not null
    and a.starts_at > now()
  order by a.starts_at asc
  limit 1;

  return jsonb_build_object(
    'client', jsonb_build_object(
      'id', v_client.id,
      'name', v_client.name,
      'phone', v_client.phone,
      'whatsapp', v_client.whatsapp,
      'email', v_client.email,
      'avatar_path', v_client.avatar_path,
      'notes', v_client.notes
    ),
    'next_meeting',
      case
        when v_next.id is null then null
        else jsonb_build_object(
          'id', v_next.id,
          'title', v_next.title,
          'starts_at', v_next.starts_at
        )
      end
  );
end;
$$;

grant execute on function public.portal_get_client_context(uuid) to anon;
grant execute on function public.portal_get_client_context(uuid) to authenticated;

create or replace function public.portal_list_client_messages(
  p_session_token uuid
)
returns table (
  id uuid,
  sender text,
  content text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  v_client_id := public.portal_assert_session(p_session_token);

  return query
  select
    m.id,
    m.sender,
    m.content,
    m.created_at
  from public.client_messages m
  where m.client_id = v_client_id
  order by m.created_at asc;
end;
$$;

grant execute on function public.portal_list_client_messages(uuid) to anon;
grant execute on function public.portal_list_client_messages(uuid) to authenticated;

create or replace function public.portal_send_client_message(
  p_session_token uuid,
  p_content text
)
returns table (
  id uuid,
  sender text,
  content text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_content text := btrim(coalesce(p_content, ''));
begin
  if v_content = '' then
    raise exception 'Mensagem vazia.';
  end if;

  v_client_id := public.portal_assert_session(p_session_token);

  return query
  insert into public.client_messages (
    client_id,
    sender,
    content
  )
  values (
    v_client_id,
    'client',
    v_content
  )
  returning
    client_messages.id,
    client_messages.sender,
    client_messages.content,
    client_messages.created_at;
end;
$$;

grant execute on function public.portal_send_client_message(uuid, text) to anon;
grant execute on function public.portal_send_client_message(uuid, text) to authenticated;

create or replace function public.portal_list_client_documents(
  p_session_token uuid
)
returns table (
  id uuid,
  user_id uuid,
  client_id uuid,
  case_id uuid,
  task_id uuid,
  kind text,
  title text,
  file_path text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz,
  is_public boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  v_client_id := public.portal_assert_session(p_session_token);

  return query
  select
    d.id,
    d.user_id,
    d.client_id,
    d.case_id,
    d.task_id,
    d.kind,
    d.title,
    d.file_path,
    d.mime_type,
    d.size_bytes,
    d.created_at,
    d.is_public
  from public.documents d
  where d.client_id = v_client_id
    and coalesce(d.is_public, false) = true
  order by d.created_at desc;
end;
$$;

grant execute on function public.portal_list_client_documents(uuid) to anon;
grant execute on function public.portal_list_client_documents(uuid) to authenticated;

create or replace function public.portal_list_client_transactions(
  p_session_token uuid
)
returns table (
  id uuid,
  user_id uuid,
  type text,
  status text,
  occurred_on date,
  due_date date,
  description text,
  amount_cents bigint,
  payment_method text,
  notes text,
  reminder_1d_sent_at timestamptz,
  category_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  v_client_id := public.portal_assert_session(p_session_token);

  return query
  select
    f.id,
    f.user_id,
    f.type,
    f.status,
    f.occurred_on,
    f.due_date,
    f.description,
    f.amount_cents,
    f.payment_method,
    f.notes,
    f.reminder_1d_sent_at,
    f.category_id,
    f.created_at
  from public.finance_transactions f
  where f.client_id = v_client_id
  order by f.due_date asc nulls last, f.created_at asc;
end;
$$;

grant execute on function public.portal_list_client_transactions(uuid) to anon;
grant execute on function public.portal_list_client_transactions(uuid) to authenticated;

commit;
