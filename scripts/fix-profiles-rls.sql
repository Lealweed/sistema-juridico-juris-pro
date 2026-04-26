-- Corrige RLS de user_profiles e sincroniza membros por e-mail.
-- Seguro para executar mais de uma vez.

alter table public.user_profiles enable row level security;

grant select, insert, update on table public.user_profiles to authenticated;

-- ============================================================
-- 1) Policies de SELECT
-- ============================================================

drop policy if exists user_profiles_self_select on public.user_profiles;
create policy user_profiles_self_select
on public.user_profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists user_profiles_member_select_same_office on public.user_profiles;
create policy user_profiles_member_select_same_office
on public.user_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.office_members viewer_member
    join public.office_members target_member
      on target_member.office_id = viewer_member.office_id
    where viewer_member.user_id = auth.uid()
      and target_member.user_id = user_profiles.user_id
  )
);

-- ============================================================
-- 2) Policies de INSERT
-- ============================================================

drop policy if exists user_profiles_self_insert on public.user_profiles;
create policy user_profiles_self_insert
on public.user_profiles
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists user_profiles_admin_insert_same_office on public.user_profiles;
create policy user_profiles_admin_insert_same_office
on public.user_profiles
for insert
to authenticated
with check (
  exists (
    select 1
    from public.office_members admin_member
    join public.office_members target_member
      on target_member.office_id = admin_member.office_id
    where admin_member.user_id = auth.uid()
      and lower(admin_member.role) in ('admin', 'owner')
      and target_member.user_id = user_profiles.user_id
  )
);

-- ============================================================
-- 3) Policies de UPDATE
-- ============================================================

drop policy if exists user_profiles_self_update on public.user_profiles;
create policy user_profiles_self_update
on public.user_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_profiles_admin_update_same_office on public.user_profiles;
create policy user_profiles_admin_update_same_office
on public.user_profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.office_members admin_member
    join public.office_members target_member
      on target_member.office_id = admin_member.office_id
    where admin_member.user_id = auth.uid()
      and lower(admin_member.role) in ('admin', 'owner')
      and target_member.user_id = user_profiles.user_id
  )
)
with check (
  exists (
    select 1
    from public.office_members admin_member
    join public.office_members target_member
      on target_member.office_id = admin_member.office_id
    where admin_member.user_id = auth.uid()
      and lower(admin_member.role) in ('admin', 'owner')
      and target_member.user_id = user_profiles.user_id
  )
);

-- ============================================================
-- 4) Sincronizar membros por e-mail no escritorio da admin
-- Ajuste admin_email e os e-mails abaixo antes de executar.
-- ============================================================

with
params as (
  select 'karolld@adm.com'::text as admin_email
),
target_office as (
  select om.office_id
  from public.office_members om
  join auth.users u on u.id = om.user_id
  join params p on true
  where lower(u.email) = lower(p.admin_email)
    and lower(om.role) in ('admin', 'owner')
  order by om.created_at desc
  limit 1
),
role_mode as (
  select coalesce(pg_get_constraintdef(c.oid), '') as def
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'office_members'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%role%'
  order by c.oid desc
  limit 1
),
allowed_roles as (
  select array_agg(lower((m)[1])) as roles
  from role_mode rm,
  lateral regexp_matches(rm.def, '''([^'']+)''', 'g') as m
),
resolved_roles as (
  select
    coalesce(
      (
        select om.role
        from public.office_members om
        join target_office t on t.office_id = om.office_id
        where lower(om.role) in ('admin', 'owner')
        order by om.created_at asc
        limit 1
      ),
      case
        when exists (select 1 from allowed_roles ar where 'admin' = any(ar.roles)) then 'admin'
        when exists (select 1 from allowed_roles ar where 'owner' = any(ar.roles)) then 'owner'
        else 'admin'
      end
    ) as admin_role,
    coalesce(
      (
        select om.role
        from public.office_members om
        join target_office t on t.office_id = om.office_id
        where lower(om.role) not in ('admin', 'owner')
        order by om.created_at asc
        limit 1
      ),
      case
        when exists (select 1 from allowed_roles ar where 'user' = any(ar.roles)) then 'user'
        when exists (select 1 from allowed_roles ar where 'member' = any(ar.roles)) then 'member'
        when exists (select 1 from allowed_roles ar where 'colaborador' = any(ar.roles)) then 'colaborador'
        when exists (select 1 from allowed_roles ar where 'staff' = any(ar.roles)) then 'staff'
        when exists (select 1 from allowed_roles ar where 'advogado' = any(ar.roles)) then 'advogado'
        when exists (select 1 from allowed_roles ar where 'finance' = any(ar.roles)) then 'finance'
        else coalesce((select (ar.roles)[1] from allowed_roles ar), 'member')
      end
    ) as member_role
),
emails as (
  select *
  from (
    values
      ('adm@adm.com', 'admin'),
      ('cliente@adm.com', 'user'),
        ('iagoc@user.com', 'user'),
        ('iasminr@user.com', 'user'),
        ('jeffersonb@user.com', 'user'),
      ('josel@adm.com', 'admin'),
      ('karolld@adm.com', 'admin'),
        ('kewilla@user.com', 'user'),
        ('leal@user.com', 'user'),
        ('mariae@user.com', 'user'),
        ('mateusd@user.com', 'user'),
        ('niltonl@adm.com', 'user')
  ) as v(email, role)
),
to_link as (
  select
    t.office_id,
    u.id as user_id,
    case
      when lower(e.role) in ('admin', 'owner') then rr.admin_role
      else
        rr.member_role
    end as role
  from emails e
  join auth.users u on lower(u.email) = lower(e.email)
  cross join target_office t
  cross join resolved_roles rr
)
insert into public.office_members (office_id, user_id, role)
select
  l.office_id,
  l.user_id,
  l.role
from to_link l
left join public.office_members om
  on om.office_id = l.office_id
 and om.user_id = l.user_id
where om.id is null;

-- Garante perfil basico para todos os e-mails acima.
with emails as (
  select *
  from (
    values
      ('adm@adm.com'),
      ('cliente@adm.com'),
      ('iagoc@user.com'),
      ('iasminr@user.com'),
      ('jeffersonb@user.com'),
      ('josel@adm.com'),
      ('karolld@adm.com'),
        ('kewilla@user.com'),
      ('leal@user.com'),
        ('mariae@user.com'),
        ('mateusd@user.com'),
        ('niltonl@adm.com')
  ) as v(email)
)
insert into public.user_profiles (user_id, email)
select u.id, lower(u.email)
from auth.users u
join emails e on lower(u.email) = lower(e.email)
on conflict (user_id) do update
set email = excluded.email;
