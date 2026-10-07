-- Focused registration boundary for the inventoried legacy admin/user schema.
-- No historical rows, roles or global helpers are rewritten. The single legacy
-- member-wide ALL policy is narrowed to its existing exact admin helper.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
set local search_path = pg_catalog, public;

do $preflight$
declare v_relation oid; v_owner oid; v_expected record; v_admin oid:=to_regprocedure('public.is_office_admin(uuid)');
begin
  if to_regprocedure('auth.uid()') is null or
     not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'office_invitation: trusted_migration_role_required';
  end if;
  if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) or
     exists(select 1 from pg_auth_members am join pg_roles r on r.oid=am.member where r.rolname in ('anon','authenticated')) then
    raise exception 'office_invitation: api_role_capability_drift';
  end if;
  if (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role'))<>3 then
    raise exception 'office_invitation: api_roles_missing';
  end if;
  foreach v_relation in array array[to_regclass('public.offices'),to_regclass('public.office_members'),
      to_regclass('public.office_invites'),to_regclass('public.user_profiles')] loop
    if v_relation is null then raise exception 'office_invitation: required_table_missing'; end if;
    select relowner into v_owner from pg_class where oid=v_relation and relkind='r';
    if v_owner is distinct from (select oid from pg_roles where rolname=current_user) then
      raise exception 'office_invitation: relation_owner_contract_changed';
    end if;
    if exists(select 1 from pg_attribute where attrelid=v_relation and attnum>0 and not attisdropped and attacl is not null) then
      raise exception 'office_invitation: column_privileges_not_reviewed';
    end if;
  end loop;
  -- These are the production contract, not the expanded team_* candidate schema.
  for v_expected in select * from (values
    ('public.office_members','id','uuid'),('public.office_members','office_id','uuid'),('public.office_members','user_id','uuid'),
    ('public.office_members','role','text'),('public.office_members','created_at','timestamp with time zone'),
    ('public.office_invites','id','uuid'),('public.office_invites','office_id','uuid'),('public.office_invites','email','text'),
    ('public.office_invites','role','text'),('public.office_invites','created_by_user_id','uuid'),('public.office_invites','created_at','timestamp with time zone'),
    ('public.office_invites','accepted_by_user_id','uuid'),('public.office_invites','accepted_at','timestamp with time zone'),
    ('public.office_invites','revoked_by_user_id','uuid'),('public.office_invites','revoked_at','timestamp with time zone'),
    ('public.user_profiles','user_id','uuid'),('public.user_profiles','office_id','uuid'),('public.user_profiles','email','text'),
    ('public.user_profiles','display_name','text'),('auth.users','id','uuid'),('auth.users','email','character varying(255)'),
    ('auth.users','email_confirmed_at','timestamp with time zone')) contract(relation_name,column_name,type_name)
  loop
    if not exists(select 1 from pg_attribute where attrelid=to_regclass(v_expected.relation_name) and attname=v_expected.column_name
      and attnum>0 and not attisdropped and format_type(atttypid,atttypmod)=v_expected.type_name) then
      raise exception 'office_invitation: column_contract_changed';
    end if;
  end loop;
  if (select count(*) from pg_constraint where conrelid='public.office_members'::regclass and contype='c')<>1 or
     not exists(select 1 from pg_constraint where conrelid='public.office_members'::regclass and conname='office_members_role_check'
       and pg_get_constraintdef(oid) in (
         'CHECK ((role = ANY (ARRAY[''admin''::text, ''user''::text])))',
         'CHECK ((role = ANY (ARRAY[''user''::text, ''admin''::text])))')) then
    raise exception 'office_invitation: legacy_role_constraint_changed';
  end if;
  if not exists(select 1 from pg_index where indrelid='public.office_members'::regclass and indisunique and indisvalid and indisready and indpred is null and indexprs is null
     and (select array_agg(a.attname::text order by k.pos) from unnest(indkey::smallint[]) with ordinality k(attnum,pos)
       join pg_attribute a on a.attrelid=indrelid and a.attnum=k.attnum where k.pos<=indnkeyatts)=array['office_id','user_id']) then
    raise exception 'office_invitation: membership_unique_contract_changed';
  end if;
  -- The actual legacy table has an expression UNIQUE index, including accepted
  -- and revoked histories. Preserve its exact contract; never drop/reopen it.
  if (select count(*) from pg_index where indrelid='public.office_invites'::regclass)<>4 or exists(
    select 1 from (values
      ('office_invites_pkey',true,true,1,'CREATE UNIQUE INDEX office_invites_pkey ON public.office_invites USING btree (id)'),
      ('office_invites_email_idx',false,false,1,'CREATE INDEX office_invites_email_idx ON public.office_invites USING btree (lower(email))'),
      ('office_invites_office_created_idx',false,false,2,'CREATE INDEX office_invites_office_created_idx ON public.office_invites USING btree (office_id, created_at DESC)'),
      ('office_invites_office_email_uniq',true,false,2,'CREATE UNIQUE INDEX office_invites_office_email_uniq ON public.office_invites USING btree (office_id, lower(email))')
    ) e(name,is_unique,is_primary,key_count,definition)
    left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=e.name
    left join pg_index i on i.indexrelid=c.oid and i.indrelid='public.office_invites'::regclass
    left join pg_am am on am.oid=c.relam
    where i.indexrelid is null or c.relkind<>'i' or am.amname<>'btree' or c.relowner is distinct from (select oid from pg_roles where rolname=current_user)
      or i.indisunique is distinct from e.is_unique or i.indisprimary is distinct from e.is_primary
      or not i.indisvalid or not i.indisready or i.indisexclusion or i.indpred is not null
      or i.indnkeyatts<>e.key_count or i.indnatts<>e.key_count or pg_get_indexdef(i.indexrelid) is distinct from e.definition
  ) then raise exception 'office_invitation: invite_index_contract_changed'; end if;
  if exists(select 1 from pg_class where oid in ('public.office_members'::regclass,'public.office_invites'::regclass,'public.user_profiles'::regclass)
     and (not relrowsecurity or relforcerowsecurity)) then
    raise exception 'office_invitation: rls_contract_changed';
  end if;
  if exists(select 1 from pg_trigger where tgrelid in ('public.office_members'::regclass,'public.office_invites'::regclass) and not tgisinternal) then
    raise exception 'office_invitation: mutation_trigger_not_reviewed';
  end if;
  if v_admin is null or not exists(select 1 from pg_proc p join pg_language l on l.oid=p.prolang
    where p.oid=v_admin and p.proowner=(select oid from pg_roles where rolname=current_user) and p.prosecdef and p.provolatile='s'
      and p.prorettype='boolean'::regtype and l.lanname='sql' and p.proconfig=array['search_path=public']::text[]
      and md5(pg_get_functiondef(p.oid))='9d803f5a80ed995478eda592b347b52d') then
    raise exception 'office_invitation: exact_admin_helper_changed';
  end if;
  if not exists(select 1 from pg_policy p where p.polrelid='public.office_members'::regclass and p.polname='office_members_admin_office'
    and p.polpermissive and p.polcmd='*' and p.polroles=array[(select oid from pg_roles where rolname='authenticated')]
    and ((pg_get_expr(p.polqual,p.polrelid)='is_office_member(office_id)' and p.polwithcheck is null)
      or (pg_get_expr(p.polqual,p.polrelid)='is_office_admin(office_id)' and pg_get_expr(p.polwithcheck,p.polrelid)='is_office_admin(office_id)'))) then
    raise exception 'office_invitation: legacy_members_policy_changed';
  end if;
  if (select count(*) from pg_policy where polrelid='public.office_members'::regclass)<>4 or exists(
    select 1 from (values
      ('office_members_insert_self','a',null::text,'(user_id = auth.uid())'),
      ('office_members_read_office','r','is_office_member(office_id)',null::text),
      ('office_members_read_own','r','(user_id = auth.uid())',null::text)
    ) e(name,command,using_expr,check_expr)
    left join pg_policy p on p.polrelid='public.office_members'::regclass and p.polname=e.name
    where p.oid is null or not p.polpermissive or p.polcmd::text<>e.command
      or p.polroles is distinct from array[(select oid from pg_roles where rolname='authenticated')]
      or pg_get_expr(p.polqual,p.polrelid) is distinct from e.using_expr
      or pg_get_expr(p.polwithcheck,p.polrelid) is distinct from e.check_expr
  ) then raise exception 'office_invitation: unreviewed_members_policy'; end if;
end;
$preflight$;

lock table public.offices, public.office_members, public.office_invites, public.user_profiles in share row exclusive mode;
create temporary table _office_invitation_registration_baseline on commit drop as
select
  (select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.office_invites t) invites,
  (select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.office_members t) members,
  (select md5(coalesce(jsonb_agg(to_jsonb(t) order by user_id)::text,'[]')) from public.user_profiles t) profiles,
  (select jsonb_agg(to_jsonb(c) order by c.oid) from pg_constraint c where c.conrelid in
      ('public.office_members'::regclass,'public.office_invites'::regclass,'public.user_profiles'::regclass)) constraints,
  (select jsonb_agg(to_jsonb(i) order by i.indexrelid) from pg_index i where i.indrelid in
      ('public.office_members'::regclass,'public.office_invites'::regclass,'public.user_profiles'::regclass)) indexes,
  (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p where p.polrelid in
      ('public.office_members'::regclass,'public.office_invites'::regclass,'public.user_profiles'::regclass)
      and not(p.polrelid='public.office_members'::regclass and p.polname='office_members_admin_office')) policies;

-- Owner-only helper. Office locking precedes Auth/member locks and every caller
-- uses a fresh Read Committed statement after waiting. Exact admin is deliberate.
create or replace function public._office_invitation_require_admin(p_office_id uuid, p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'office_invitation: read_committed_required';
  end if;
  if p_office_id is null or p_actor_id is null then raise exception 'office_invitation: administrator_required'; end if;
  perform 1 from public.offices o where o.id=p_office_id for update;
  if not found then raise exception 'office_invitation: administrator_required'; end if;
  perform 1 from auth.users u where u.id=p_actor_id and u.email_confirmed_at is not null
    and nullif(btrim(u.email),'') is not null for share;
  if not found then raise exception 'office_invitation: administrator_required'; end if;
  perform 1 from public.office_members m where m.office_id=p_office_id and m.user_id=p_actor_id and m.role='admin' for share;
  if not found then raise exception 'office_invitation: administrator_required'; end if;
end;
$fn$;
revoke all on function public._office_invitation_require_admin(uuid,uuid) from public, anon, authenticated, service_role;

-- Local interpretation only: legacy pending invite rows keep their stored role.
-- Finance and job-title aliases never acquire administration privileges.
create or replace function public._office_invitation_legacy_role(p_role text)
returns text language sql immutable security invoker set search_path = '' as $fn$
  select case lower(btrim(p_role)) when 'admin' then 'admin'
    when 'user' then 'user' when 'member' then 'user' when 'lawyer' then 'user' when 'secretary' then 'user'
    when 'staff' then 'user' when 'advogado' then 'user' when 'advogada' then 'user'
    when 'colaborador' then 'user' when 'colaboradora' then 'user' when 'secretaria' then 'user' when 'secretária' then 'user'
    when 'finance' then 'user' when 'financeiro' then 'user' else null end;
$fn$;
revoke all on function public._office_invitation_legacy_role(text) from public, anon, authenticated, service_role;

create or replace function public.office_invitation_create(p_office_id uuid, p_email text, p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid:=auth.uid(); v_email text:=lower(btrim(p_email)); v_role text; v_invite public.office_invites%rowtype;
begin
  perform public._office_invitation_require_admin(p_office_id,v_actor);
  if v_email is null or length(v_email)>254 or v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'office_invitation: invalid_email';
  end if;
  v_role:=public._office_invitation_legacy_role(p_role);
  if v_role is null then raise exception 'office_invitation: invalid_role'; end if;
  select i.* into v_invite from public.office_invites i where i.office_id=p_office_id and lower(btrim(i.email))=v_email
    and i.accepted_at is null and i.revoked_at is null order by i.created_at,i.id limit 1 for update;
  if found then
    if public._office_invitation_legacy_role(v_invite.role) is distinct from v_role then
      raise exception 'office_invitation: pending_role_conflict'; end if;
    -- A revoked administrator's old invitation is never silently reassigned.
    perform public._office_invitation_require_admin(p_office_id,v_invite.created_by_user_id);
    return to_jsonb(v_invite);
  end if;
  if exists(select 1 from auth.users u join public.office_members m on m.user_id=u.id
      where m.office_id=p_office_id and lower(btrim(u.email))=v_email) then
    raise exception 'office_invitation: already_member';
  end if;
  if exists(select 1 from public.office_invites i where i.office_id=p_office_id and lower(btrim(i.email))=v_email) then
    -- The immutable expression UNIQUE index also covers past invitations.
    -- Existing-account linkage is explicit; do not reopen or overwrite history.
    raise exception 'office_invitation: invite_history_requires_existing_account';
  end if;
  insert into public.office_invites(office_id,email,role,created_by_user_id)
    values(p_office_id,v_email,v_role,v_actor) returning * into v_invite;
  return to_jsonb(v_invite);
end;
$fn$;

create or replace function public.office_invitation_list(p_office_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'office_invitation: read_committed_required'; end if;
  if not exists(select 1 from auth.users u join public.office_members m on m.user_id=u.id
    where u.id=v_actor and u.email_confirmed_at is not null and nullif(btrim(u.email),'') is not null
      and m.office_id=p_office_id and m.role='admin') then raise exception 'office_invitation: administrator_required'; end if;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc,i.id),'[]'::jsonb) into v_result
    from public.office_invites i where i.office_id=p_office_id;
  return v_result;
end;
$fn$;

-- Connect an account that the office administrator already created in Auth.
-- No passwords, Auth writes, e-mails or fabricated recipient acceptance.
create or replace function public.office_invitation_add_existing(p_office_id uuid, p_email text, p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid:=auth.uid(); v_email text:=lower(btrim(p_email)); v_role text; v_accounts uuid[];
  v_recipient uuid; v_confirmed timestamptz; v_member public.office_members%rowtype;
begin
  perform public._office_invitation_require_admin(p_office_id,v_actor);
  if v_email is null or length(v_email)>254 or v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'office_invitation: invalid_email';
  end if;
  v_role:=public._office_invitation_legacy_role(p_role);
  if v_role is null then raise exception 'office_invitation: invalid_role'; end if;
  select array_agg(u.id order by u.id) into v_accounts from (
    select a.id from auth.users a where lower(btrim(a.email))=v_email order by a.id for share
  ) u;
  if coalesce(cardinality(v_accounts),0)=0 then raise exception 'office_invitation: account_required'; end if;
  if cardinality(v_accounts)<>1 then raise exception 'office_invitation: account_identity_conflict'; end if;
  v_recipient:=v_accounts[1];
  select a.email_confirmed_at into v_confirmed from auth.users a where a.id=v_recipient;
  if v_confirmed is null then raise exception 'office_invitation: confirmed_email_required'; end if;
  select m.* into v_member from public.office_members m where m.office_id=p_office_id and m.user_id=v_recipient for update;
  if v_member.id is not null then
    if v_member.role is distinct from v_role then raise exception 'office_invitation: membership_role_conflict'; end if;
  else
    insert into public.office_members(office_id,user_id,role) values(p_office_id,v_recipient,v_role)
      on conflict (office_id,user_id) do nothing;
    select m.* into v_member from public.office_members m where m.office_id=p_office_id and m.user_id=v_recipient for update;
    if v_member.role is distinct from v_role then raise exception 'office_invitation: membership_role_conflict'; end if;
  end if;
  insert into public.user_profiles(user_id,office_id,email,display_name)
    values(v_recipient,p_office_id,v_email,null) on conflict (user_id) do nothing;
  return to_jsonb(v_member);
end;
$fn$;

create or replace function public.office_invitation_list_mine()
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_email text; v_result jsonb;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'office_invitation: read_committed_required'; end if;
  select lower(btrim(u.email)) into v_email from auth.users u where u.id=auth.uid()
    and u.email_confirmed_at is not null and nullif(btrim(u.email),'') is not null;
  if v_email is null then raise exception 'office_invitation: confirmed_email_required'; end if;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc,i.id),'[]'::jsonb) into v_result
    from public.office_invites i where lower(btrim(i.email))=v_email and i.accepted_at is null and i.revoked_at is null
    and exists(select 1 from public.office_members m join auth.users creator on creator.id=m.user_id
      where m.office_id=i.office_id and m.user_id=i.created_by_user_id and m.role='admin' and creator.email_confirmed_at is not null
        and nullif(btrim(creator.email),'') is not null);
  return v_result;
end;
$fn$;

create or replace function public.office_invitation_accept(p_invite_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid:=auth.uid(); v_email text; v_office uuid; v_role text; v_invite public.office_invites%rowtype; v_member public.office_members%rowtype;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'office_invitation: read_committed_required'; end if;
  if v_actor is null then raise exception 'office_invitation: confirmed_email_required'; end if;
  select i.office_id into v_office from public.office_invites i where i.id=p_invite_id;
  if v_office is null then raise exception 'office_invitation: invite_unavailable'; end if;
  perform 1 from public.offices o where o.id=v_office for update;
  if not found then raise exception 'office_invitation: invite_unavailable'; end if;
  select i.* into v_invite from public.office_invites i where i.id=p_invite_id and i.office_id=v_office for update;
  if not found or v_invite.revoked_at is not null then raise exception 'office_invitation: invite_unavailable'; end if;
  select lower(btrim(u.email)) into v_email from auth.users u where u.id=v_actor and u.email_confirmed_at is not null
    and nullif(btrim(u.email),'') is not null for share;
  if v_email is null then raise exception 'office_invitation: confirmed_email_required'; end if;
  if lower(btrim(v_invite.email)) is distinct from v_email then raise exception 'office_invitation: invite_unavailable'; end if;
  perform public._office_invitation_require_admin(v_office,v_invite.created_by_user_id);
  v_role:=public._office_invitation_legacy_role(v_invite.role);
  if v_role is null then raise exception 'office_invitation: invalid_role'; end if;
  if v_invite.accepted_at is not null and v_invite.accepted_by_user_id is distinct from v_actor then
    raise exception 'office_invitation: invite_unavailable';
  end if;
  select m.* into v_member from public.office_members m where m.office_id=v_office and m.user_id=v_actor for update;
  if v_invite.accepted_at is not null then
    if v_member.id is null then raise exception 'office_invitation: invite_unavailable'; end if;
    return to_jsonb(v_member);
  end if;
  if v_member.id is null then
    insert into public.office_members(office_id,user_id,role) values(v_office,v_actor,v_role)
      on conflict (office_id,user_id) do nothing;
    select m.* into v_member from public.office_members m where m.office_id=v_office and m.user_id=v_actor for update;
  end if;
  -- Explicit office before the legacy global-default INSERT trigger. Existing
  -- profile/member rows are never overwritten by an invitation or login retry.
  insert into public.user_profiles(user_id,office_id,email,display_name)
    values(v_actor,v_office,v_email,null) on conflict (user_id) do nothing;
  update public.office_invites set accepted_at=clock_timestamp(),accepted_by_user_id=v_actor
    where id=v_invite.id and accepted_at is null and revoked_at is null;
  if not found then raise exception 'office_invitation: invite_unavailable'; end if;
  return to_jsonb(v_member);
end;
$fn$;

create or replace function public.office_invitation_revoke(p_office_id uuid, p_invite_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid:=auth.uid(); v_invite public.office_invites%rowtype;
begin
  perform public._office_invitation_require_admin(p_office_id,v_actor);
  select i.* into v_invite from public.office_invites i where i.id=p_invite_id and i.office_id=p_office_id for update;
  if not found or v_invite.accepted_at is not null then raise exception 'office_invitation: invite_unavailable'; end if;
  if v_invite.revoked_at is null then
    update public.office_invites set revoked_at=clock_timestamp(),revoked_by_user_id=v_actor where id=v_invite.id returning * into v_invite;
  end if;
  return to_jsonb(v_invite);
end;
$fn$;

create table if not exists public._office_invitation_send_reservations (
  invite_id uuid primary key references public.office_invites(id) on delete cascade,
  reserved_at timestamptz not null,
  reserved_by_user_id uuid not null references auth.users(id)
);
alter table public._office_invitation_send_reservations enable row level security;
revoke all on public._office_invitation_send_reservations from public,anon,authenticated,service_role;
do $reservation_contract$
begin
  if not exists(select 1 from pg_class c join pg_roles r on r.oid=c.relowner
      where c.oid='public._office_invitation_send_reservations'::regclass and c.relkind='r' and c.relrowsecurity
        and not c.relforcerowsecurity and r.rolname=current_user) or
    (select array_agg(attname::text order by attnum) from pg_attribute where attrelid='public._office_invitation_send_reservations'::regclass
      and attnum>0 and not attisdropped) is distinct from array['invite_id','reserved_at','reserved_by_user_id']::text[] or
    (select array_agg(format_type(atttypid,atttypmod) order by attnum) from pg_attribute where attrelid='public._office_invitation_send_reservations'::regclass
      and attnum>0 and not attisdropped) is distinct from array['uuid','timestamp with time zone','uuid']::text[] or
    exists(select 1 from pg_attribute where attrelid='public._office_invitation_send_reservations'::regclass and attnum>0
      and not attisdropped and (not attnotnull or attacl is not null)) or
    exists(select 1 from pg_policy where polrelid='public._office_invitation_send_reservations'::regclass) or
    exists(select 1 from pg_trigger where tgrelid='public._office_invitation_send_reservations'::regclass and not tgisinternal) or
    (select count(*) from pg_constraint where conrelid='public._office_invitation_send_reservations'::regclass)<>3 or
    not exists(select 1 from pg_constraint where conrelid='public._office_invitation_send_reservations'::regclass and contype='p'
      and pg_get_constraintdef(oid)='PRIMARY KEY (invite_id)') or
    not exists(select 1 from pg_constraint where conrelid='public._office_invitation_send_reservations'::regclass and contype='f'
      and conkey=array[1]::smallint[] and confrelid='public.office_invites'::regclass and confdeltype='c'
      and confkey=array[(select attnum from pg_attribute where attrelid='public.office_invites'::regclass and attname='id')]::smallint[]) or
    not exists(select 1 from pg_constraint where conrelid='public._office_invitation_send_reservations'::regclass and contype='f'
      and conkey=array[3]::smallint[] and confrelid='auth.users'::regclass and confdeltype='a'
      and confkey=array[(select attnum from pg_attribute where attrelid='auth.users'::regclass and attname='id')]::smallint[]) then
      raise exception 'office_invitation: reservation_contract_changed';
  end if;
end;
$reservation_contract$;

create or replace function public.office_invitation_reserve_send(p_invite_id uuid, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_office uuid; v_invite public.office_invites%rowtype; v_previous timestamptz; v_now timestamptz;
begin
  select i.office_id into v_office from public.office_invites i where i.id=p_invite_id;
  perform public._office_invitation_require_admin(v_office,p_actor_id);
  select i.* into v_invite from public.office_invites i where i.id=p_invite_id and i.office_id=v_office for update;
  if not found or v_invite.accepted_at is not null or v_invite.revoked_at is not null then raise exception 'office_invitation: invite_unavailable'; end if;
  perform public._office_invitation_require_admin(v_office,v_invite.created_by_user_id);
  if public._office_invitation_legacy_role(v_invite.role) is null or v_invite.email is null or length(btrim(v_invite.email))>254
    or btrim(v_invite.email)!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'office_invitation: invalid_invite'; end if;
  select r.reserved_at into v_previous from public._office_invitation_send_reservations r where r.invite_id=p_invite_id for update;
  v_now:=clock_timestamp();
  if v_previous is not null and v_previous+interval '60 seconds'>v_now then
    return jsonb_build_object('reserved',false,'retry_after_seconds',ceil(extract(epoch from v_previous+interval '60 seconds'-v_now))::integer);
  end if;
  insert into public._office_invitation_send_reservations(invite_id,reserved_at,reserved_by_user_id) values(p_invite_id,v_now,p_actor_id)
    on conflict (invite_id) do update set reserved_at=excluded.reserved_at,reserved_by_user_id=excluded.reserved_by_user_id;
  return jsonb_build_object('reserved',true,'retry_after_seconds',0);
end;
$fn$;

revoke all on function public.office_invitation_create(uuid,text,text), public.office_invitation_add_existing(uuid,text,text), public.office_invitation_list(uuid), public.office_invitation_list_mine(),
  public.office_invitation_accept(uuid),public.office_invitation_revoke(uuid,uuid), public.office_invitation_reserve_send(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.office_invitation_create(uuid,text,text), public.office_invitation_add_existing(uuid,text,text), public.office_invitation_list(uuid), public.office_invitation_list_mine(),
  public.office_invitation_accept(uuid),public.office_invitation_revoke(uuid,uuid) to authenticated;
grant execute on function public.office_invitation_reserve_send(uuid,uuid) to service_role;

-- Direct invitation mutations (including TRUNCATE and trigger installation) and
-- manual membership INSERT cannot bypass these functions. Existing membership
-- SELECT/UPDATE/DELETE grants remain. The inherited member-wide ALL policy must
-- be narrowed too, so a collaborator cannot promote themselves to admin first.
revoke insert,update,delete,truncate,references,trigger,maintain on public.office_invites from public,anon,authenticated;
revoke insert,truncate,references,trigger,maintain on public.office_members from public,anon,authenticated;
alter policy office_members_admin_office on public.office_members
  using (public.is_office_admin(office_id)) with check (public.is_office_admin(office_id));

do $preservation$
begin
  if exists(select 1 from _office_invitation_registration_baseline b where
    b.invites is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.office_invites t) or
    b.members is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.office_members t) or
    b.profiles is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(t) order by user_id)::text,'[]')) from public.user_profiles t) or
    b.constraints is distinct from (select jsonb_agg(to_jsonb(c) order by c.oid) from pg_constraint c where c.conrelid in
      ('public.office_members'::regclass,'public.office_invites'::regclass,'public.user_profiles'::regclass)) or
    b.indexes is distinct from (select jsonb_agg(to_jsonb(i) order by i.indexrelid) from pg_index i where i.indrelid in
      ('public.office_members'::regclass,'public.office_invites'::regclass,'public.user_profiles'::regclass)) or
    b.policies is distinct from (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p where p.polrelid in
      ('public.office_members'::regclass,'public.office_invites'::regclass,'public.user_profiles'::regclass)
      and not(p.polrelid='public.office_members'::regclass and p.polname='office_members_admin_office'))) then
    raise exception 'office_invitation: historical_preservation_failed';
  end if;
  if not exists(select 1 from pg_policy p where p.polrelid='public.office_members'::regclass and p.polname='office_members_admin_office'
    and p.polpermissive and p.polcmd='*' and p.polroles=array[(select oid from pg_roles where rolname='authenticated')]
    and pg_get_expr(p.polqual,p.polrelid)='is_office_admin(office_id)'
    and pg_get_expr(p.polwithcheck,p.polrelid)='is_office_admin(office_id)') then
    raise exception 'office_invitation: planned_policy_change_failed';
  end if;
end;
$preservation$;
notify pgrst, 'reload schema';
commit;
