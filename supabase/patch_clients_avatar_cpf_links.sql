-- Clients: CPF (required in UI), avatar, and client-to-client links
-- Safe migration: keeps cpf nullable for existing rows; enforce validity + uniqueness when provided.

-- 1) CPF
alter table public.clients add column if not exists cpf text;

create or replace function public.is_valid_cpf(p_cpf text)
returns boolean
language plpgsql
immutable
as $$
declare
  cpf text;
  i int;
  sum int;
  d1 int;
  d2 int;
  digit int;
begin
  if p_cpf is null then
    return false;
  end if;

  -- keep only digits
  cpf := regexp_replace(p_cpf, '[^0-9]', '', 'g');

  if length(cpf) <> 11 then
    return false;
  end if;

  -- reject same-digit sequences
  if cpf ~ '^(\d)\1{10}$' then
    return false;
  end if;

  -- first digit
  sum := 0;
  for i in 1..9 loop
    sum := sum + (cast(substr(cpf, i, 1) as int) * (11 - i));
  end loop;
  digit := (sum * 10) % 11;
  if digit = 10 then digit := 0; end if;
  d1 := digit;

  -- second digit
  sum := 0;
  for i in 1..10 loop
    sum := sum + (cast(substr(cpf, i, 1) as int) * (12 - i));
  end loop;
  digit := (sum * 10) % 11;
  if digit = 10 then digit := 0; end if;
  d2 := digit;

  return d1 = cast(substr(cpf, 10, 1) as int)
     and d2 = cast(substr(cpf, 11, 1) as int);
end;
$$;

-- Valid CPF when set (cpf may be NULL for legacy rows)
alter table public.clients
  drop constraint if exists clients_cpf_valid;

alter table public.clients
  add constraint clients_cpf_valid
  check (cpf is null or public.is_valid_cpf(cpf));

-- unique per office when set
create unique index if not exists clients_office_cpf_uniq
  on public.clients (office_id, cpf)
  where cpf is not null;

-- 2) Avatar
alter table public.clients add column if not exists avatar_path text;
alter table public.clients add column if not exists avatar_updated_at timestamptz;

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('client_avatars', 'client_avatars', false)
on conflict (id) do nothing;

-- Objects RLS
-- Path convention: office/<office_id>/client/<client_id>/<filename>

drop policy if exists client_avatars_select on storage.objects;
create policy client_avatars_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'client_avatars'
  and exists (
    select 1
    from public.office_members m
    where m.user_id = auth.uid()
      and m.office_id = nullif((regexp_match(name, '^office/([0-9a-f\-]{36})/client/'))[1], '')::uuid
  )
);

-- Allow upload/replace by office members
-- (insert) only if path office_id matches membership

drop policy if exists client_avatars_insert on storage.objects;
create policy client_avatars_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'client_avatars'
  and exists (
    select 1
    from public.office_members m
    where m.user_id = auth.uid()
      and m.office_id = nullif((regexp_match(name, '^office/([0-9a-f\-]{36})/client/'))[1], '')::uuid
  )
);

-- Allow update/delete (replace avatar) by office members

drop policy if exists client_avatars_update on storage.objects;
create policy client_avatars_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'client_avatars'
  and exists (
    select 1
    from public.office_members m
    where m.user_id = auth.uid()
      and m.office_id = nullif((regexp_match(name, '^office/([0-9a-f\-]{36})/client/'))[1], '')::uuid
  )
)
with check (
  bucket_id = 'client_avatars'
  and exists (
    select 1
    from public.office_members m
    where m.user_id = auth.uid()
      and m.office_id = nullif((regexp_match(name, '^office/([0-9a-f\-]{36})/client/'))[1], '')::uuid
  )
);

drop policy if exists client_avatars_delete on storage.objects;
create policy client_avatars_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'client_avatars'
  and exists (
    select 1
    from public.office_members m
    where m.user_id = auth.uid()
      and m.office_id = nullif((regexp_match(name, '^office/([0-9a-f\-]{36})/client/'))[1], '')::uuid
  )
);

-- 3) Client links (mother/son/responsible/etc)
create table if not exists public.client_links (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  from_client_id uuid not null references public.clients(id) on delete cascade,
  to_client_id uuid not null references public.clients(id) on delete cascade,
  relation_type text not null,
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_links_office_idx on public.client_links(office_id);
create index if not exists client_links_from_idx on public.client_links(from_client_id);
create index if not exists client_links_to_idx on public.client_links(to_client_id);

-- avoid duplicates
create unique index if not exists client_links_uniq
  on public.client_links(office_id, from_client_id, to_client_id, relation_type);

alter table public.client_links enable row level security;

drop policy if exists client_links_select on public.client_links;
create policy client_links_select
on public.client_links for select
using (public.is_office_member(office_id));

drop policy if exists client_links_insert on public.client_links;
create policy client_links_insert
on public.client_links for insert
with check (
  public.is_office_member(office_id)
);

drop policy if exists client_links_delete on public.client_links;
create policy client_links_delete
on public.client_links for delete
using (public.is_office_admin(office_id));

drop policy if exists client_links_update on public.client_links;
create policy client_links_update
on public.client_links for update
using (public.is_office_admin(office_id));

-- Audit
drop trigger if exists tr_audit_client_links on public.client_links;
create trigger tr_audit_client_links
after insert or update or delete on public.client_links
for each row execute function public._audit_log_row();
