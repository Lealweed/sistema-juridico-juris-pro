-- CRM Jurídico: office invites (email-based, no link)
-- Applied via psql on 2026-02-10.

begin;

create table if not exists public.office_invites (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  created_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_by_user_id uuid null references auth.users(id) on delete set null,
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  revoked_by_user_id uuid null references auth.users(id) on delete set null
);

create unique index if not exists office_invites_office_email_uniq on public.office_invites (office_id, lower(email));
create index if not exists office_invites_email_idx on public.office_invites (lower(email));
create index if not exists office_invites_office_created_idx on public.office_invites (office_id, created_at desc);

alter table public.office_invites enable row level security;

create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(email)
  from public.user_profiles
  where user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.current_user_email() from public;
grant execute on function public.current_user_email() to authenticated;

-- Policies
drop policy if exists office_invites_select on public.office_invites;
drop policy if exists office_invites_insert on public.office_invites;
drop policy if exists office_invites_update on public.office_invites;
drop policy if exists office_invites_delete on public.office_invites;

create policy office_invites_select on public.office_invites
for select using (
  public.is_office_admin(office_id)
  or (lower(email) = public.current_user_email())
);

create policy office_invites_insert on public.office_invites
for insert with check (
  public.is_office_admin(office_id)
);

create policy office_invites_update on public.office_invites
for update using (
  public.is_office_admin(office_id)
  or (
    lower(email) = public.current_user_email()
    and accepted_at is null
    and revoked_at is null
  )
);

create policy office_invites_delete on public.office_invites
for delete using (
  public.is_office_admin(office_id)
);

commit;
