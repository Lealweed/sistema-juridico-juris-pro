--
-- PostgreSQL database dump
--

\restrict vxRtcVVCO29egLH4ugjPs6e0Pc37r9nJNi5IDSodTRg2M8PQTdniBTmm1zPLmqK

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7 (Debian 17.7-3.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: CaseStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CaseStatus" AS ENUM (
    'OPEN',
    'ON_HOLD',
    'CLOSED'
);


--
-- Name: ContactKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ContactKind" AS ENUM (
    'PERSON',
    'COMPANY'
);


--
-- Name: MembershipRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MembershipRole" AS ENUM (
    'OWNER',
    'ADMIN',
    'LAWYER',
    'ASSISTANT',
    'FINANCE'
);


--
-- Name: _agenda_items_default_responsible(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._agenda_items_default_responsible() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.responsible_user_id is null then
    new.responsible_user_id := auth.uid();
  end if;
  return new;
end;
$$;


--
-- Name: _agenda_items_ensure_office(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._agenda_items_ensure_office() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_office uuid;
begin
  if new.office_id is not null then
    return new;
  end if;

  -- Prefer linked case/client
  if new.case_id is not null then
    select office_id into v_office from public.cases where id = new.case_id;
  end if;
  if v_office is null and new.client_id is not null then
    select office_id into v_office from public.clients where id = new.client_id;
  end if;

  if v_office is null then
    -- fallback: first membership
    select office_id into v_office
    from public.office_members
    where user_id = new.user_id
    order by created_at asc
    limit 1;
  end if;

  new.office_id := v_office;

  -- If agenda_id missing, attach default
  if new.agenda_id is null and v_office is not null then
    select id into new.agenda_id
    from public.agendas
    where office_id = v_office and is_default
    limit 1;
  end if;

  return new;
end;
$$;


--
-- Name: _audit_log_row(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._audit_log_row() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_office_id uuid;
  v_user_id uuid;
  v_record_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_action text;
  v_table text;
  v_client_id uuid;
  v_case_id uuid;
  v_task_id uuid;
begin
  v_table := tg_table_name;
  v_user_id := auth.uid();

  if (tg_op = 'INSERT') then
    v_action := 'insert';
    v_before := null;
    v_after := to_jsonb(new);
    v_record_id := (new).id;
    v_office_id := (new).office_id;
  elsif (tg_op = 'UPDATE') then
    v_action := 'update';
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    v_record_id := (new).id;
    v_office_id := coalesce((new).office_id, (old).office_id);
  elsif (tg_op = 'DELETE') then
    v_action := 'delete';
    v_before := to_jsonb(old);
    v_after := null;
    v_record_id := (old).id;
    v_office_id := (old).office_id;
  else
    return null;
  end if;

  -- Derive link ids from row payload (best-effort)
  if v_table = 'clients' then
    v_client_id := v_record_id;
  elsif v_table = 'cases' then
    v_case_id := v_record_id;
    v_client_id := nullif(coalesce((v_after->>'client_id'), (v_before->>'client_id')), '')::uuid;
  elsif v_table = 'tasks' then
    v_task_id := v_record_id;
    v_client_id := nullif(coalesce((v_after->>'client_id'), (v_before->>'client_id')), '')::uuid;
    v_case_id := nullif(coalesce((v_after->>'case_id'), (v_before->>'case_id')), '')::uuid;
  elsif v_table = 'documents' then
    v_client_id := nullif(coalesce((v_after->>'client_id'), (v_before->>'client_id')), '')::uuid;
    v_case_id := nullif(coalesce((v_after->>'case_id'), (v_before->>'case_id')), '')::uuid;
    v_task_id := nullif(coalesce((v_after->>'task_id'), (v_before->>'task_id')), '')::uuid;
  elsif v_table = 'finance_transactions' then
    v_client_id := nullif(coalesce((v_after->>'client_id'), (v_before->>'client_id')), '')::uuid;
    v_case_id := nullif(coalesce((v_after->>'case_id'), (v_before->>'case_id')), '')::uuid;
  else
    v_client_id := null;
    v_case_id := null;
    v_task_id := null;
  end if;

  insert into public.audit_logs (office_id, user_id, action, table_name, record_id, client_id, case_id, task_id, before_data, after_data)
  values (v_office_id, v_user_id, v_action, v_table, v_record_id, v_client_id, v_case_id, v_task_id, v_before, v_after);

  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$$;


--
-- Name: _clients_normalize_docs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._clients_normalize_docs() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.cpf is not null then
    new.cpf := regexp_replace(new.cpf, '[^0-9]', '', 'g');
  end if;
  if new.cnpj is not null then
    new.cnpj := regexp_replace(new.cnpj, '[^0-9]', '', 'g');
  end if;
  if new.whatsapp is not null then
    new.whatsapp := regexp_replace(new.whatsapp, '[^0-9]', '', 'g');
  end if;
  return new;
end;
$$;


--
-- Name: _default_office_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._default_office_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from public.offices order by created_at asc limit 1;
$$;


--
-- Name: _ensure_office_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._ensure_office_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.office_id is null then
    new.office_id := public._default_office_id();
  end if;
  return new;
end;
$$;


--
-- Name: current_user_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_email() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select lower(email)
  from public.user_profiles
  where user_id = auth.uid()
  limit 1;
$$;


--
-- Name: delegate_agenda_item(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delegate_agenda_item(p_agenda_item_id uuid, p_responsible_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_office uuid;
  v_user uuid;
  v_owner uuid;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select office_id, user_id into v_office, v_owner
  from public.agenda_items
  where id = p_agenda_item_id;

  if not found then
    raise exception 'agenda_item_not_found';
  end if;

  if v_office is not null then
    if not public.is_office_member(v_office) then
      raise exception 'not_allowed';
    end if;
  else
    if v_owner <> v_user then
      raise exception 'not_allowed';
    end if;
  end if;

  update public.agenda_items
  set responsible_user_id = p_responsible_user_id,
      last_responsible_by_user_id = v_user,
      last_responsible_at = now()
  where id = p_agenda_item_id;
end;
$$;


--
-- Name: delegate_task(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delegate_task(p_task_id uuid, p_assigned_to_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_office uuid;
  v_user uuid;
  v_owner uuid;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select office_id, user_id into v_office, v_owner
  from public.tasks
  where id = p_task_id;

  if not found then
    raise exception 'task_not_found';
  end if;

  if v_office is not null then
    if not public.is_office_member(v_office) then
      raise exception 'not_allowed';
    end if;
  else
    if v_owner <> v_user then
      raise exception 'not_allowed';
    end if;
  end if;

  update public.tasks
  set assigned_to_user_id = p_assigned_to_user_id,
      last_assigned_by_user_id = v_user,
      last_assigned_at = now()
  where id = p_task_id;
end;
$$;


--
-- Name: ensure_office_settings(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_office_settings(p_office_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.office_settings (office_id)
  values (p_office_id)
  on conflict (office_id) do nothing;
end;
$$;


--
-- Name: get_my_offices(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_offices() RETURNS SETOF uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
select office_id from public.office_members where user_id = auth.uid();
$$;


--
-- Name: is_office_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_office_admin(p_office_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists(
    select 1
    from public.office_members m
    where m.office_id = p_office_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  );
$$;


--
-- Name: is_office_finance(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_office_finance(p_office_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists(
    select 1
    from public.office_members m
    where m.office_id = p_office_id
      and m.user_id = auth.uid()
      and m.role in ('admin','finance')
  );
$$;


--
-- Name: is_office_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_office_member(p_office_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
select exists(
select 1
from public.office_members m
where m.office_id = p_office_id
and m.user_id = auth.uid()
);
$$;


--
-- Name: is_valid_cnpj(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_valid_cnpj(p_cnpj text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
declare
  cnpj text;
  i int;
  sum int;
  digit int;
  d1 int;
  d2 int;
  weights1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  weights2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if p_cnpj is null then
    return false;
  end if;

  cnpj := regexp_replace(p_cnpj, '[^0-9]', '', 'g');
  if length(cnpj) <> 14 then
    return false;
  end if;

  if cnpj ~ '^(\d)\1{13}$' then
    return false;
  end if;

  -- first digit
  sum := 0;
  for i in 1..12 loop
    sum := sum + (cast(substr(cnpj, i, 1) as int) * weights1[i]);
  end loop;
  digit := sum % 11;
  if digit < 2 then d1 := 0; else d1 := 11 - digit; end if;

  -- second digit
  sum := 0;
  for i in 1..13 loop
    sum := sum + (cast(substr(cnpj, i, 1) as int) * weights2[i]);
  end loop;
  digit := sum % 11;
  if digit < 2 then d2 := 0; else d2 := 11 - digit; end if;

  return d1 = cast(substr(cnpj, 13, 1) as int)
     and d2 = cast(substr(cnpj, 14, 1) as int);
end;
$_$;


--
-- Name: is_valid_cpf(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_valid_cpf(p_cpf text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
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
$_$;


--
-- Name: task_add_participant(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.task_add_participant(p_task_id uuid, p_user_id uuid, p_role text DEFAULT 'assignee'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_office uuid;
begin
  select office_id into v_office from public.tasks where id = p_task_id;
  if not found then raise exception 'task_not_found'; end if;

  if v_office is not null then
    if not public.is_office_member(v_office) then raise exception 'not_allowed'; end if;
  else
    if auth.uid() is null then raise exception 'not_authenticated'; end if;
  end if;

  insert into public.task_participants (task_id, office_id, user_id, role)
  values (p_task_id, v_office, p_user_id, coalesce(p_role,'assignee'))
  on conflict (task_id, user_id) do update set role=excluded.role;
end;
$$;


--
-- Name: task_mark_my_part_done(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.task_mark_my_part_done(p_task_id uuid, p_notes text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user uuid;
  v_office uuid;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'not_authenticated'; end if;

  select office_id into v_office from public.tasks where id = p_task_id;
  if not found then raise exception 'task_not_found'; end if;

  update public.task_participants
  set status='done',
      conclusion_notes = p_notes,
      concluded_at = now()
  where task_id = p_task_id and user_id = v_user;

  if not found then
    -- auto add self as participant if office member
    if v_office is not null and public.is_office_member(v_office) then
      insert into public.task_participants (task_id, office_id, user_id, role, status, conclusion_notes, concluded_at)
      values (p_task_id, v_office, v_user, 'assignee', 'done', p_notes, now())
      on conflict (task_id, user_id) do update
        set status='done', conclusion_notes=p_notes, concluded_at=now();
    else
      raise exception 'not_allowed';
    end if;
  end if;
end;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Case; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Case" (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    title text NOT NULL,
    status public."CaseStatus" DEFAULT 'OPEN'::public."CaseStatus" NOT NULL,
    description text,
    "clientId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Contact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Contact" (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    kind public."ContactKind" DEFAULT 'PERSON'::public."ContactKind" NOT NULL,
    name text NOT NULL,
    document text,
    email text,
    phone text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Membership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Membership" (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    role public."MembershipRole" DEFAULT 'LAWYER'::public."MembershipRole" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Organization; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Organization" (
    id text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: RefreshToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RefreshToken" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tokenHash" text NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    name text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: agenda_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agenda_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text DEFAULT 'commitment'::text NOT NULL,
    title text NOT NULL,
    notes text,
    location text,
    all_day boolean DEFAULT false NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    due_date date,
    status text DEFAULT 'confirmed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    office_id uuid,
    agenda_id uuid,
    client_id uuid,
    case_id uuid,
    responsible_user_id uuid,
    last_responsible_by_user_id uuid,
    last_responsible_at timestamp with time zone
);


--
-- Name: agenda_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agenda_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    office_id uuid NOT NULL,
    agenda_item_id uuid NOT NULL,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    to_kind text DEFAULT 'internal'::text NOT NULL,
    to_phone text,
    message text NOT NULL,
    send_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    sent_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    to_user_id uuid,
    to_client_id uuid
);


--
-- Name: agendas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agendas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    office_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#f59e0b'::text NOT NULL,
    kind text DEFAULT 'shared'::text NOT NULL,
    owner_user_id uuid,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    office_id uuid,
    user_id uuid,
    action text NOT NULL,
    table_name text NOT NULL,
    record_id uuid,
    before_data jsonb,
    after_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_id uuid,
    case_id uuid,
    task_id uuid
);


--
-- Name: case_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.case_clients (
    case_id uuid NOT NULL,
    client_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid,
    title text NOT NULL,
    status text DEFAULT 'aberto'::text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    office_id uuid,
    process_number text,
    datajud_last_movement_text text,
    datajud_last_movement_at timestamp with time zone,
    datajud_last_checked_at timestamp with time zone,
    area text,
    court text,
    district text,
    counterparty_name text,
    counterparty_doc text,
    counterparty_whatsapp text,
    claim_value numeric(14,2),
    distributed_at date,
    responsible_user_id uuid
);


--
-- Name: client_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    office_id uuid NOT NULL,
    from_client_id uuid NOT NULL,
    to_client_id uuid NOT NULL,
    relation_type text NOT NULL,
    notes text,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    office_id uuid,
    cpf text,
    avatar_path text,
    avatar_updated_at timestamp with time zone,
    person_type text,
    cnpj text,
    whatsapp text,
    rg text,
    birth_date date,
    profession text,
    civil_status text,
    address_cep text,
    address_street text,
    address_number text,
    address_complement text,
    address_neighborhood text,
    address_city text,
    address_state text,
    gov_notes text,
    gov_login_hint text,
    CONSTRAINT clients_cnpj_valid CHECK (((cnpj IS NULL) OR public.is_valid_cnpj(cnpj))),
    CONSTRAINT clients_cpf_valid CHECK (((cpf IS NULL) OR public.is_valid_cpf(cpf))),
    CONSTRAINT clients_person_type_valid CHECK (((person_type IS NULL) OR (person_type = ANY (ARRAY['pf'::text, 'pj'::text])))),
    CONSTRAINT clients_pf_pj_doc_required CHECK (((person_type IS NULL) OR ((person_type = 'pf'::text) AND (cpf IS NOT NULL)) OR ((person_type = 'pj'::text) AND (cnpj IS NOT NULL))))
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    office_id uuid,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    case_id uuid,
    task_id uuid,
    kind text DEFAULT 'personal'::text NOT NULL,
    title text NOT NULL,
    file_path text NOT NULL,
    mime_type text,
    size_bytes bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_public boolean DEFAULT false NOT NULL
);


--
-- Name: finance_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    office_id uuid,
    user_id uuid,
    name text NOT NULL,
    type text DEFAULT 'cash'::text NOT NULL,
    currency text DEFAULT 'BRL'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: finance_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    office_id uuid,
    user_id uuid,
    type text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: finance_parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_parties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    office_id uuid,
    user_id uuid,
    kind text DEFAULT 'external'::text NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: finance_splits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_splits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    office_id uuid,
    user_id uuid,
    transaction_id uuid NOT NULL,
    party_id uuid NOT NULL,
    kind text DEFAULT 'percent'::text NOT NULL,
    value numeric NOT NULL,
    amount_cents_override bigint,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: finance_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    office_id uuid,
    user_id uuid,
    type text NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    occurred_on date NOT NULL,
    description text NOT NULL,
    amount_cents bigint NOT NULL,
    payment_method text,
    account_id uuid,
    category_id uuid,
    client_id uuid,
    case_id uuid,
    partner_party_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    due_date date,
    reminder_1d_sent_at timestamp with time zone,
    paid_at timestamp with time zone,
    CONSTRAINT finance_transactions_amount_cents_check CHECK ((amount_cents >= 0))
);


--
-- Name: office_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.office_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    office_id uuid NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_by_user_id uuid,
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoked_by_user_id uuid
);


--
-- Name: office_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.office_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    office_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT office_members_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'finance'::text, 'staff'::text, 'member'::text])))
);


--
-- Name: office_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.office_settings (
    office_id uuid NOT NULL,
    agenda_deadline_default_time time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    agenda_commitment_default_minutes_before integer DEFAULT 30 NOT NULL,
    timezone text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    office_whatsapp text
);


--
-- Name: offices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: publications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    office_id uuid,
    case_id uuid,
    pje_comunicacao_id bigint NOT NULL,
    numero_processo text,
    sigla_tribunal text,
    tipo_comunicacao text,
    nome_orgao text,
    texto text,
    data_disponibilizacao date,
    meio text,
    link text,
    hash text,
    destinatarios jsonb,
    destinatario_advogados jsonb,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: task_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    office_id uuid,
    user_id uuid NOT NULL,
    role text DEFAULT 'assignee'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    conclusion_notes text,
    concluded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    due_date date,
    done_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    office_id uuid,
    created_by_user_id uuid,
    assigned_to_user_id uuid,
    due_at timestamp with time zone,
    status_v2 text DEFAULT 'open'::text,
    paused_at timestamp with time zone,
    pause_reason text,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    completed_by_user_id uuid,
    client_id uuid,
    case_id uuid,
    task_group_id uuid,
    last_assigned_by_user_id uuid,
    last_assigned_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    user_id uuid NOT NULL,
    office_id uuid,
    email text,
    display_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    oab_number text,
    oab_uf text
);


--
-- Name: Case Case_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Case"
    ADD CONSTRAINT "Case_pkey" PRIMARY KEY (id);


--
-- Name: Contact Contact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_pkey" PRIMARY KEY (id);


--
-- Name: Membership Membership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Membership"
    ADD CONSTRAINT "Membership_pkey" PRIMARY KEY (id);


--
-- Name: Organization Organization_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Organization"
    ADD CONSTRAINT "Organization_pkey" PRIMARY KEY (id);


--
-- Name: RefreshToken RefreshToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RefreshToken"
    ADD CONSTRAINT "RefreshToken_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: agenda_items agenda_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_items
    ADD CONSTRAINT agenda_items_pkey PRIMARY KEY (id);


--
-- Name: agenda_reminders agenda_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_reminders
    ADD CONSTRAINT agenda_reminders_pkey PRIMARY KEY (id);


--
-- Name: agendas agendas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendas
    ADD CONSTRAINT agendas_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: case_clients case_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_clients
    ADD CONSTRAINT case_clients_pkey PRIMARY KEY (case_id, client_id);


--
-- Name: cases cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (id);


--
-- Name: client_links client_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_links
    ADD CONSTRAINT client_links_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: finance_accounts finance_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_accounts
    ADD CONSTRAINT finance_accounts_pkey PRIMARY KEY (id);


--
-- Name: finance_categories finance_categories_office_id_type_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_office_id_type_name_key UNIQUE (office_id, type, name);


--
-- Name: finance_categories finance_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_pkey PRIMARY KEY (id);


--
-- Name: finance_categories finance_categories_user_id_type_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_user_id_type_name_key UNIQUE (user_id, type, name);


--
-- Name: finance_parties finance_parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_parties
    ADD CONSTRAINT finance_parties_pkey PRIMARY KEY (id);


--
-- Name: finance_splits finance_splits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_splits
    ADD CONSTRAINT finance_splits_pkey PRIMARY KEY (id);


--
-- Name: finance_transactions finance_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_pkey PRIMARY KEY (id);


--
-- Name: office_invites office_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_invites
    ADD CONSTRAINT office_invites_pkey PRIMARY KEY (id);


--
-- Name: office_members office_members_office_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_members
    ADD CONSTRAINT office_members_office_id_user_id_key UNIQUE (office_id, user_id);


--
-- Name: office_members office_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_members
    ADD CONSTRAINT office_members_pkey PRIMARY KEY (id);


--
-- Name: office_settings office_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_settings
    ADD CONSTRAINT office_settings_pkey PRIMARY KEY (office_id);


--
-- Name: offices offices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offices
    ADD CONSTRAINT offices_pkey PRIMARY KEY (id);


--
-- Name: publications publications_pje_comunicacao_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publications
    ADD CONSTRAINT publications_pje_comunicacao_id_key UNIQUE (pje_comunicacao_id);


--
-- Name: publications publications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publications
    ADD CONSTRAINT publications_pkey PRIMARY KEY (id);


--
-- Name: task_participants task_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_participants
    ADD CONSTRAINT task_participants_pkey PRIMARY KEY (id);


--
-- Name: task_participants task_participants_task_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_participants
    ADD CONSTRAINT task_participants_task_id_user_id_key UNIQUE (task_id, user_id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: Case_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Case_clientId_idx" ON public."Case" USING btree ("clientId");


--
-- Name: Case_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Case_organizationId_idx" ON public."Case" USING btree ("organizationId");


--
-- Name: Case_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Case_status_idx" ON public."Case" USING btree (status);


--
-- Name: Contact_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Contact_name_idx" ON public."Contact" USING btree (name);


--
-- Name: Contact_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Contact_organizationId_idx" ON public."Contact" USING btree ("organizationId");


--
-- Name: Membership_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Membership_organizationId_idx" ON public."Membership" USING btree ("organizationId");


--
-- Name: Membership_organizationId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON public."Membership" USING btree ("organizationId", "userId");


--
-- Name: Membership_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Membership_userId_idx" ON public."Membership" USING btree ("userId");


--
-- Name: RefreshToken_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON public."RefreshToken" USING btree ("tokenHash");


--
-- Name: RefreshToken_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RefreshToken_userId_idx" ON public."RefreshToken" USING btree ("userId");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: agenda_items_agenda_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_items_agenda_idx ON public.agenda_items USING btree (agenda_id);


--
-- Name: agenda_items_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_items_case_idx ON public.agenda_items USING btree (case_id);


--
-- Name: agenda_items_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_items_client_idx ON public.agenda_items USING btree (client_id);


--
-- Name: agenda_items_last_responsible_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_items_last_responsible_by_idx ON public.agenda_items USING btree (last_responsible_by_user_id);


--
-- Name: agenda_items_office_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_items_office_id_idx ON public.agenda_items USING btree (office_id);


--
-- Name: agenda_items_office_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_items_office_idx ON public.agenda_items USING btree (office_id);


--
-- Name: agenda_items_responsible_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_items_responsible_idx ON public.agenda_items USING btree (responsible_user_id);


--
-- Name: agenda_items_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_items_user_created_idx ON public.agenda_items USING btree (user_id, created_at DESC);


--
-- Name: agenda_items_user_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_items_user_due_idx ON public.agenda_items USING btree (user_id, due_date);


--
-- Name: agenda_items_user_starts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_items_user_starts_idx ON public.agenda_items USING btree (user_id, starts_at);


--
-- Name: agenda_reminders_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_reminders_item_idx ON public.agenda_reminders USING btree (agenda_item_id);


--
-- Name: agenda_reminders_office_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_reminders_office_idx ON public.agenda_reminders USING btree (office_id);


--
-- Name: agenda_reminders_send_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_reminders_send_at_idx ON public.agenda_reminders USING btree (status, send_at);


--
-- Name: agenda_reminders_to_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_reminders_to_client_idx ON public.agenda_reminders USING btree (to_client_id);


--
-- Name: agenda_reminders_to_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_reminders_to_user_idx ON public.agenda_reminders USING btree (to_user_id);


--
-- Name: agendas_default_one_per_office; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agendas_default_one_per_office ON public.agendas USING btree (office_id) WHERE is_default;


--
-- Name: agendas_office_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agendas_office_idx ON public.agendas USING btree (office_id);


--
-- Name: agendas_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agendas_owner_idx ON public.agendas USING btree (owner_user_id);


--
-- Name: audit_logs_case_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_case_created_idx ON public.audit_logs USING btree (case_id, created_at DESC);


--
-- Name: audit_logs_client_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_client_created_idx ON public.audit_logs USING btree (client_id, created_at DESC);


--
-- Name: audit_logs_office_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_office_created_idx ON public.audit_logs USING btree (office_id, created_at DESC);


--
-- Name: audit_logs_task_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_task_created_idx ON public.audit_logs USING btree (task_id, created_at DESC);


--
-- Name: audit_logs_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_user_created_idx ON public.audit_logs USING btree (user_id, created_at DESC);


--
-- Name: cases_client_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_client_id_idx ON public.cases USING btree (client_id);


--
-- Name: cases_office_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_office_id_idx ON public.cases USING btree (office_id);


--
-- Name: cases_process_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_process_number_idx ON public.cases USING btree (process_number);


--
-- Name: cases_responsible_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_responsible_user_id_idx ON public.cases USING btree (responsible_user_id);


--
-- Name: client_links_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_links_from_idx ON public.client_links USING btree (from_client_id);


--
-- Name: client_links_office_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_links_office_idx ON public.client_links USING btree (office_id);


--
-- Name: client_links_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_links_to_idx ON public.client_links USING btree (to_client_id);


--
-- Name: client_links_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX client_links_uniq ON public.client_links USING btree (office_id, from_client_id, to_client_id, relation_type);


--
-- Name: clients_office_cnpj_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clients_office_cnpj_uniq ON public.clients USING btree (office_id, cnpj) WHERE (cnpj IS NOT NULL);


--
-- Name: clients_office_cpf_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clients_office_cpf_uniq ON public.clients USING btree (office_id, cpf) WHERE (cpf IS NOT NULL);


--
-- Name: clients_office_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clients_office_id_idx ON public.clients USING btree (office_id);


--
-- Name: documents_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_case_idx ON public.documents USING btree (case_id, created_at DESC);


--
-- Name: documents_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_client_idx ON public.documents USING btree (client_id, created_at DESC);


--
-- Name: documents_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_user_idx ON public.documents USING btree (user_id, created_at DESC);


--
-- Name: finance_accounts_office_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_accounts_office_idx ON public.finance_accounts USING btree (office_id);


--
-- Name: finance_accounts_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_accounts_user_idx ON public.finance_accounts USING btree (user_id);


--
-- Name: finance_categories_office_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_categories_office_idx ON public.finance_categories USING btree (office_id);


--
-- Name: finance_categories_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_categories_user_idx ON public.finance_categories USING btree (user_id);


--
-- Name: finance_parties_office_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_parties_office_idx ON public.finance_parties USING btree (office_id);


--
-- Name: finance_parties_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_parties_user_idx ON public.finance_parties USING btree (user_id);


--
-- Name: finance_splits_tx_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_splits_tx_idx ON public.finance_splits USING btree (transaction_id);


--
-- Name: finance_tx_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_tx_due_idx ON public.finance_transactions USING btree (due_date);


--
-- Name: finance_tx_office_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_tx_office_idx ON public.finance_transactions USING btree (office_id, occurred_on DESC);


--
-- Name: finance_tx_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_tx_user_idx ON public.finance_transactions USING btree (user_id, occurred_on DESC);


--
-- Name: idx_finance_transactions_paid_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_transactions_paid_at ON public.finance_transactions USING btree (paid_at);


--
-- Name: idx_office_members_office_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_office_members_office_user ON public.office_members USING btree (office_id, user_id);


--
-- Name: office_invites_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX office_invites_email_idx ON public.office_invites USING btree (lower(email));


--
-- Name: office_invites_office_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX office_invites_office_created_idx ON public.office_invites USING btree (office_id, created_at DESC);


--
-- Name: office_invites_office_email_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX office_invites_office_email_uniq ON public.office_invites USING btree (office_id, lower(email));


--
-- Name: office_members_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX office_members_user_id_idx ON public.office_members USING btree (user_id);


--
-- Name: task_participants_office_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_participants_office_idx ON public.task_participants USING btree (office_id);


--
-- Name: task_participants_task_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_participants_task_idx ON public.task_participants USING btree (task_id);


--
-- Name: task_participants_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_participants_user_idx ON public.task_participants USING btree (user_id);


--
-- Name: tasks_assigned_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_assigned_to_idx ON public.tasks USING btree (assigned_to_user_id, due_at);


--
-- Name: tasks_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_case_idx ON public.tasks USING btree (case_id);


--
-- Name: tasks_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_client_idx ON public.tasks USING btree (client_id);


--
-- Name: tasks_due_alert_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_due_alert_idx ON public.tasks USING btree (due_at, status_v2);


--
-- Name: tasks_due_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_due_at_idx ON public.tasks USING btree (due_at);


--
-- Name: tasks_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_group_idx ON public.tasks USING btree (task_group_id, created_at DESC);


--
-- Name: tasks_last_assigned_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_last_assigned_by_idx ON public.tasks USING btree (last_assigned_by_user_id);


--
-- Name: tasks_office_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_office_id_idx ON public.tasks USING btree (office_id);


--
-- Name: tasks_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_user_id_created_at_idx ON public.tasks USING btree (user_id, created_at DESC);


--
-- Name: tasks_user_id_due_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_user_id_due_date_idx ON public.tasks USING btree (user_id, due_date);


--
-- Name: user_profiles_office_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_profiles_office_idx ON public.user_profiles USING btree (office_id);


--
-- Name: agenda_items tr_agenda_ensure_office_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_agenda_ensure_office_id BEFORE INSERT ON public.agenda_items FOR EACH ROW EXECUTE FUNCTION public._ensure_office_id();


--
-- Name: agenda_items tr_agenda_items_default_responsible; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_agenda_items_default_responsible BEFORE INSERT ON public.agenda_items FOR EACH ROW EXECUTE FUNCTION public._agenda_items_default_responsible();


--
-- Name: agenda_items tr_agenda_items_ensure_office; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_agenda_items_ensure_office BEFORE INSERT ON public.agenda_items FOR EACH ROW EXECUTE FUNCTION public._agenda_items_ensure_office();


--
-- Name: agenda_items tr_audit_agenda_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_audit_agenda_items AFTER INSERT OR DELETE OR UPDATE ON public.agenda_items FOR EACH ROW EXECUTE FUNCTION public._audit_log_row();


--
-- Name: agenda_reminders tr_audit_agenda_reminders; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_audit_agenda_reminders AFTER INSERT OR DELETE OR UPDATE ON public.agenda_reminders FOR EACH ROW EXECUTE FUNCTION public._audit_log_row();


--
-- Name: agendas tr_audit_agendas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_audit_agendas AFTER INSERT OR DELETE OR UPDATE ON public.agendas FOR EACH ROW EXECUTE FUNCTION public._audit_log_row();


--
-- Name: cases tr_audit_cases; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_audit_cases AFTER INSERT OR DELETE OR UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public._audit_log_row();


--
-- Name: client_links tr_audit_client_links; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_audit_client_links AFTER INSERT OR DELETE OR UPDATE ON public.client_links FOR EACH ROW EXECUTE FUNCTION public._audit_log_row();


--
-- Name: clients tr_audit_clients; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_audit_clients AFTER INSERT OR DELETE OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public._audit_log_row();


--
-- Name: documents tr_audit_documents; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_audit_documents AFTER INSERT OR DELETE OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public._audit_log_row();


--
-- Name: finance_transactions tr_audit_finance_transactions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_audit_finance_transactions AFTER INSERT OR DELETE OR UPDATE ON public.finance_transactions FOR EACH ROW EXECUTE FUNCTION public._audit_log_row();


--
-- Name: office_settings tr_audit_office_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_audit_office_settings AFTER INSERT OR DELETE OR UPDATE ON public.office_settings FOR EACH ROW EXECUTE FUNCTION public._audit_log_row();


--
-- Name: task_participants tr_audit_task_participants; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_audit_task_participants AFTER INSERT OR DELETE OR UPDATE ON public.task_participants FOR EACH ROW EXECUTE FUNCTION public._audit_log_row();


--
-- Name: tasks tr_audit_tasks; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_audit_tasks AFTER INSERT OR DELETE OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public._audit_log_row();


--
-- Name: cases tr_cases_ensure_office_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_cases_ensure_office_id BEFORE INSERT ON public.cases FOR EACH ROW EXECUTE FUNCTION public._ensure_office_id();


--
-- Name: clients tr_clients_ensure_office_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_clients_ensure_office_id BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public._ensure_office_id();


--
-- Name: clients tr_clients_normalize_docs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_clients_normalize_docs BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public._clients_normalize_docs();


--
-- Name: documents tr_documents_ensure_office_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_documents_ensure_office_id BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public._ensure_office_id();


--
-- Name: finance_accounts tr_finance_accounts_ensure_office_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_finance_accounts_ensure_office_id BEFORE INSERT ON public.finance_accounts FOR EACH ROW EXECUTE FUNCTION public._ensure_office_id();


--
-- Name: finance_categories tr_finance_categories_ensure_office_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_finance_categories_ensure_office_id BEFORE INSERT ON public.finance_categories FOR EACH ROW EXECUTE FUNCTION public._ensure_office_id();


--
-- Name: finance_parties tr_finance_parties_ensure_office_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_finance_parties_ensure_office_id BEFORE INSERT ON public.finance_parties FOR EACH ROW EXECUTE FUNCTION public._ensure_office_id();


--
-- Name: finance_splits tr_finance_splits_ensure_office_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_finance_splits_ensure_office_id BEFORE INSERT ON public.finance_splits FOR EACH ROW EXECUTE FUNCTION public._ensure_office_id();


--
-- Name: finance_transactions tr_finance_tx_ensure_office_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_finance_tx_ensure_office_id BEFORE INSERT ON public.finance_transactions FOR EACH ROW EXECUTE FUNCTION public._ensure_office_id();


--
-- Name: tasks tr_tasks_ensure_office_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_tasks_ensure_office_id BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public._ensure_office_id();


--
-- Name: user_profiles tr_user_profiles_ensure_office_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_user_profiles_ensure_office_id BEFORE INSERT ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public._ensure_office_id();


--
-- Name: tasks update_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: Case Case_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Case"
    ADD CONSTRAINT "Case_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Contact"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Case Case_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Case"
    ADD CONSTRAINT "Case_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Contact Contact_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Membership Membership_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Membership"
    ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Membership Membership_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Membership"
    ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: RefreshToken RefreshToken_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RefreshToken"
    ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agenda_items agenda_items_agenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_items
    ADD CONSTRAINT agenda_items_agenda_id_fkey FOREIGN KEY (agenda_id) REFERENCES public.agendas(id) ON DELETE SET NULL;


--
-- Name: agenda_items agenda_items_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_items
    ADD CONSTRAINT agenda_items_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL;


--
-- Name: agenda_items agenda_items_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_items
    ADD CONSTRAINT agenda_items_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: agenda_items agenda_items_last_responsible_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_items
    ADD CONSTRAINT agenda_items_last_responsible_by_user_id_fkey FOREIGN KEY (last_responsible_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agenda_items agenda_items_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_items
    ADD CONSTRAINT agenda_items_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE SET NULL;


--
-- Name: agenda_items agenda_items_responsible_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_items
    ADD CONSTRAINT agenda_items_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agenda_items agenda_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_items
    ADD CONSTRAINT agenda_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: agenda_reminders agenda_reminders_agenda_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_reminders
    ADD CONSTRAINT agenda_reminders_agenda_item_id_fkey FOREIGN KEY (agenda_item_id) REFERENCES public.agenda_items(id) ON DELETE CASCADE;


--
-- Name: agenda_reminders agenda_reminders_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_reminders
    ADD CONSTRAINT agenda_reminders_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE;


--
-- Name: agenda_reminders agenda_reminders_to_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_reminders
    ADD CONSTRAINT agenda_reminders_to_client_id_fkey FOREIGN KEY (to_client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: agenda_reminders agenda_reminders_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_reminders
    ADD CONSTRAINT agenda_reminders_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agendas agendas_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendas
    ADD CONSTRAINT agendas_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE;


--
-- Name: agendas agendas_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendas
    ADD CONSTRAINT agendas_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: case_clients case_clients_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_clients
    ADD CONSTRAINT case_clients_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;


--
-- Name: case_clients case_clients_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_clients
    ADD CONSTRAINT case_clients_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: cases cases_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: cases cases_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE SET NULL;


--
-- Name: cases cases_responsible_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: cases cases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: client_links client_links_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_links
    ADD CONSTRAINT client_links_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: client_links client_links_from_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_links
    ADD CONSTRAINT client_links_from_client_id_fkey FOREIGN KEY (from_client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_links client_links_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_links
    ADD CONSTRAINT client_links_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE;


--
-- Name: client_links client_links_to_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_links
    ADD CONSTRAINT client_links_to_client_id_fkey FOREIGN KEY (to_client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: clients clients_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE SET NULL;


--
-- Name: clients clients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: documents documents_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL;


--
-- Name: documents documents_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: documents documents_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE SET NULL;


--
-- Name: documents documents_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: documents documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_accounts finance_accounts_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_accounts
    ADD CONSTRAINT finance_accounts_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE;


--
-- Name: finance_accounts finance_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_accounts
    ADD CONSTRAINT finance_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_categories finance_categories_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE;


--
-- Name: finance_categories finance_categories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_parties finance_parties_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_parties
    ADD CONSTRAINT finance_parties_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE;


--
-- Name: finance_parties finance_parties_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_parties
    ADD CONSTRAINT finance_parties_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_splits finance_splits_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_splits
    ADD CONSTRAINT finance_splits_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE;


--
-- Name: finance_splits finance_splits_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_splits
    ADD CONSTRAINT finance_splits_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.finance_parties(id) ON DELETE CASCADE;


--
-- Name: finance_splits finance_splits_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_splits
    ADD CONSTRAINT finance_splits_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.finance_transactions(id) ON DELETE CASCADE;


--
-- Name: finance_splits finance_splits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_splits
    ADD CONSTRAINT finance_splits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_transactions finance_transactions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.finance_accounts(id) ON DELETE SET NULL;


--
-- Name: finance_transactions finance_transactions_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL;


--
-- Name: finance_transactions finance_transactions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.finance_categories(id) ON DELETE SET NULL;


--
-- Name: finance_transactions finance_transactions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: finance_transactions finance_transactions_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE;


--
-- Name: finance_transactions finance_transactions_partner_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_partner_party_id_fkey FOREIGN KEY (partner_party_id) REFERENCES public.finance_parties(id) ON DELETE SET NULL;


--
-- Name: finance_transactions finance_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: office_invites office_invites_accepted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_invites
    ADD CONSTRAINT office_invites_accepted_by_user_id_fkey FOREIGN KEY (accepted_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: office_invites office_invites_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_invites
    ADD CONSTRAINT office_invites_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: office_invites office_invites_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_invites
    ADD CONSTRAINT office_invites_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE;


--
-- Name: office_invites office_invites_revoked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_invites
    ADD CONSTRAINT office_invites_revoked_by_user_id_fkey FOREIGN KEY (revoked_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: office_members office_members_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_members
    ADD CONSTRAINT office_members_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE;


--
-- Name: office_members office_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_members
    ADD CONSTRAINT office_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: office_settings office_settings_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_settings
    ADD CONSTRAINT office_settings_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE;


--
-- Name: publications publications_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publications
    ADD CONSTRAINT publications_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL;


--
-- Name: publications publications_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publications
    ADD CONSTRAINT publications_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE;


--
-- Name: task_participants task_participants_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_participants
    ADD CONSTRAINT task_participants_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE;


--
-- Name: task_participants task_participants_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_participants
    ADD CONSTRAINT task_participants_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_participants task_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_participants
    ADD CONSTRAINT task_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_assigned_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_completed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_completed_by_user_id_fkey FOREIGN KEY (completed_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_last_assigned_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_last_assigned_by_user_id_fkey FOREIGN KEY (last_assigned_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_office_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE SET NULL;


--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: User; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;

--
-- Name: agenda_items agenda_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agenda_delete ON public.agenda_items FOR DELETE USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: agenda_items agenda_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agenda_insert ON public.agenda_items FOR INSERT WITH CHECK ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: agenda_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agenda_items ENABLE ROW LEVEL SECURITY;

--
-- Name: agenda_items agenda_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agenda_items_delete ON public.agenda_items FOR DELETE TO authenticated USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: agenda_items agenda_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agenda_items_insert ON public.agenda_items FOR INSERT TO authenticated WITH CHECK ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: agenda_items agenda_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agenda_items_select ON public.agenda_items FOR SELECT TO authenticated USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: agenda_items agenda_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agenda_items_update ON public.agenda_items FOR UPDATE TO authenticated USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: agenda_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agenda_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: agenda_reminders agenda_reminders_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agenda_reminders_delete ON public.agenda_reminders FOR DELETE USING (public.is_office_member(office_id));


--
-- Name: agenda_reminders agenda_reminders_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agenda_reminders_insert ON public.agenda_reminders FOR INSERT WITH CHECK (public.is_office_member(office_id));


--
-- Name: agenda_reminders agenda_reminders_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agenda_reminders_select ON public.agenda_reminders FOR SELECT USING (public.is_office_member(office_id));


--
-- Name: agenda_reminders agenda_reminders_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agenda_reminders_update ON public.agenda_reminders FOR UPDATE USING (public.is_office_member(office_id));


--
-- Name: agenda_items agenda_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agenda_select ON public.agenda_items FOR SELECT USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: agenda_items agenda_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agenda_update ON public.agenda_items FOR UPDATE USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: agendas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agendas ENABLE ROW LEVEL SECURITY;

--
-- Name: agendas agendas_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agendas_delete ON public.agendas FOR DELETE USING (public.is_office_admin(office_id));


--
-- Name: agendas agendas_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agendas_insert ON public.agendas FOR INSERT WITH CHECK (public.is_office_admin(office_id));


--
-- Name: agendas agendas_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agendas_select ON public.agendas FOR SELECT USING (public.is_office_member(office_id));


--
-- Name: agendas agendas_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agendas_update ON public.agendas FOR UPDATE USING (public.is_office_admin(office_id));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_delete ON public.audit_logs FOR DELETE USING (false);


--
-- Name: audit_logs audit_logs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT WITH CHECK (false);


--
-- Name: audit_logs audit_logs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR (user_id = auth.uid())));


--
-- Name: audit_logs audit_logs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_update ON public.audit_logs FOR UPDATE USING (false);


--
-- Name: case_clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.case_clients ENABLE ROW LEVEL SECURITY;

--
-- Name: case_clients case_clients_read_office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY case_clients_read_office ON public.case_clients FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.cases c
  WHERE ((c.id = case_clients.case_id) AND public.is_office_member(c.office_id)))));


--
-- Name: case_clients case_clients_write_office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY case_clients_write_office ON public.case_clients TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.cases c
  WHERE ((c.id = case_clients.case_id) AND public.is_office_member(c.office_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.cases c
  WHERE ((c.id = case_clients.case_id) AND public.is_office_member(c.office_id)))));


--
-- Name: cases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

--
-- Name: cases cases_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cases_delete ON public.cases FOR DELETE USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: cases cases_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cases_insert ON public.cases FOR INSERT WITH CHECK ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: cases cases_read_office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cases_read_office ON public.cases FOR SELECT TO authenticated USING (public.is_office_member(office_id));


--
-- Name: cases cases_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cases_select ON public.cases FOR SELECT USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: cases cases_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cases_update ON public.cases FOR UPDATE USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: cases cases_write_office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cases_write_office ON public.cases TO authenticated USING (public.is_office_member(office_id)) WITH CHECK (public.is_office_member(office_id));


--
-- Name: client_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_links ENABLE ROW LEVEL SECURITY;

--
-- Name: client_links client_links_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_links_delete ON public.client_links FOR DELETE USING (public.is_office_admin(office_id));


--
-- Name: client_links client_links_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_links_insert ON public.client_links FOR INSERT WITH CHECK (public.is_office_member(office_id));


--
-- Name: client_links client_links_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_links_select ON public.client_links FOR SELECT USING (public.is_office_member(office_id));


--
-- Name: client_links client_links_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_links_update ON public.client_links FOR UPDATE USING (public.is_office_admin(office_id));


--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: clients clients_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_delete ON public.clients FOR DELETE USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: clients clients_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_insert ON public.clients FOR INSERT WITH CHECK ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: clients clients_read_office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_read_office ON public.clients FOR SELECT TO authenticated USING (public.is_office_member(office_id));


--
-- Name: clients clients_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_select ON public.clients FOR SELECT USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: clients clients_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_update ON public.clients FOR UPDATE USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: clients clients_write_office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_write_office ON public.clients TO authenticated USING (public.is_office_member(office_id)) WITH CHECK (public.is_office_member(office_id));


--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: documents documents_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_delete ON public.documents FOR DELETE USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: documents documents_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_insert ON public.documents FOR INSERT WITH CHECK ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: documents documents_read_office_or_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_read_office_or_client ON public.documents FOR SELECT TO authenticated USING ((public.is_office_member(office_id) OR ((user_id = auth.uid()) OR ((is_public = true) AND (client_id IN ( SELECT clients.id
   FROM public.clients
  WHERE (clients.user_id = auth.uid())))))));


--
-- Name: documents documents_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_select ON public.documents FOR SELECT USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: documents documents_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_update ON public.documents FOR UPDATE USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: documents documents_write_office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_write_office ON public.documents TO authenticated USING (public.is_office_member(office_id)) WITH CHECK (public.is_office_member(office_id));


--
-- Name: finance_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_accounts finance_accounts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_accounts_delete ON public.finance_accounts FOR DELETE USING ((((office_id IS NOT NULL) AND public.is_office_finance(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_accounts finance_accounts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_accounts_insert ON public.finance_accounts FOR INSERT WITH CHECK ((((office_id IS NOT NULL) AND public.is_office_finance(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_accounts finance_accounts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_accounts_select ON public.finance_accounts FOR SELECT USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_accounts finance_accounts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_accounts_update ON public.finance_accounts FOR UPDATE USING ((((office_id IS NOT NULL) AND public.is_office_finance(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_categories finance_categories_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_categories_delete ON public.finance_categories FOR DELETE USING ((((office_id IS NOT NULL) AND public.is_office_finance(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_categories finance_categories_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_categories_insert ON public.finance_categories FOR INSERT WITH CHECK ((((office_id IS NOT NULL) AND public.is_office_finance(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_categories finance_categories_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_categories_select ON public.finance_categories FOR SELECT USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_categories finance_categories_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_categories_update ON public.finance_categories FOR UPDATE USING ((((office_id IS NOT NULL) AND public.is_office_finance(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_parties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_parties ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_parties finance_parties_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_parties_delete ON public.finance_parties FOR DELETE USING ((((office_id IS NOT NULL) AND public.is_office_finance(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_parties finance_parties_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_parties_insert ON public.finance_parties FOR INSERT WITH CHECK ((((office_id IS NOT NULL) AND public.is_office_finance(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_parties finance_parties_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_parties_select ON public.finance_parties FOR SELECT USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_parties finance_parties_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_parties_update ON public.finance_parties FOR UPDATE USING ((((office_id IS NOT NULL) AND public.is_office_finance(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_transactions finance_read_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_read_role ON public.finance_transactions FOR SELECT TO authenticated USING ((public.is_office_member(office_id) AND ((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.office_members
  WHERE ((office_members.office_id = finance_transactions.office_id) AND (office_members.user_id = auth.uid()) AND (office_members.role = ANY (ARRAY['admin'::text, 'finance'::text]))))))));


--
-- Name: finance_splits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_splits ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_splits finance_splits_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_splits_delete ON public.finance_splits FOR DELETE USING ((((office_id IS NOT NULL) AND public.is_office_finance(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_splits finance_splits_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_splits_insert ON public.finance_splits FOR INSERT WITH CHECK ((((office_id IS NOT NULL) AND public.is_office_finance(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_splits finance_splits_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_splits_select ON public.finance_splits FOR SELECT USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_splits finance_splits_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_splits_update ON public.finance_splits FOR UPDATE USING ((((office_id IS NOT NULL) AND public.is_office_finance(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_transactions finance_tx_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_tx_delete ON public.finance_transactions FOR DELETE USING ((((office_id IS NOT NULL) AND public.is_office_finance(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_transactions finance_tx_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_tx_insert ON public.finance_transactions FOR INSERT WITH CHECK ((((office_id IS NOT NULL) AND public.is_office_finance(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_transactions finance_tx_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_tx_select ON public.finance_transactions FOR SELECT USING ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_transactions finance_tx_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_tx_update ON public.finance_transactions FOR UPDATE USING ((((office_id IS NOT NULL) AND public.is_office_finance(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: finance_transactions finance_write_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_write_role ON public.finance_transactions TO authenticated USING ((public.is_office_member(office_id) AND ((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.office_members
  WHERE ((office_members.office_id = finance_transactions.office_id) AND (office_members.user_id = auth.uid()) AND (office_members.role = ANY (ARRAY['admin'::text, 'finance'::text])))))))) WITH CHECK ((public.is_office_member(office_id) AND ((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.office_members
  WHERE ((office_members.office_id = finance_transactions.office_id) AND (office_members.user_id = auth.uid()) AND (office_members.role = ANY (ARRAY['admin'::text, 'finance'::text]))))))));


--
-- Name: office_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.office_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: office_invites office_invites_read_mine_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY office_invites_read_mine_or_admin ON public.office_invites FOR SELECT TO authenticated USING (((lower(email) = public.current_user_email()) OR public.is_office_member(office_id)));


--
-- Name: office_invites office_invites_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY office_invites_write ON public.office_invites TO authenticated USING (((lower(email) = public.current_user_email()) OR public.is_office_member(office_id)));


--
-- Name: office_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.office_members ENABLE ROW LEVEL SECURITY;

--
-- Name: office_members office_members_admin_office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY office_members_admin_office ON public.office_members TO authenticated USING (public.is_office_member(office_id));


--
-- Name: office_members office_members_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY office_members_insert_self ON public.office_members FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: office_members office_members_read_office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY office_members_read_office ON public.office_members FOR SELECT TO authenticated USING (public.is_office_member(office_id));


--
-- Name: office_members office_members_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY office_members_read_own ON public.office_members FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: office_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.office_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: office_settings office_settings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY office_settings_select ON public.office_settings FOR SELECT USING (public.is_office_member(office_id));


--
-- Name: office_settings office_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY office_settings_update ON public.office_settings FOR UPDATE USING (public.is_office_admin(office_id));


--
-- Name: office_settings office_settings_upsert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY office_settings_upsert ON public.office_settings FOR INSERT WITH CHECK (public.is_office_admin(office_id));


--
-- Name: offices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;

--
-- Name: offices offices_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY offices_read ON public.offices FOR SELECT TO authenticated USING (public.is_office_member(id));


--
-- Name: offices offices_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY offices_write ON public.offices TO authenticated USING (public.is_office_member(id));


--
-- Name: publications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;

--
-- Name: publications publications_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY publications_delete_admin ON public.publications FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.office_members
  WHERE ((office_members.office_id = publications.office_id) AND (office_members.user_id = auth.uid()) AND (office_members.role = 'admin'::text)))));


--
-- Name: publications publications_insert_office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY publications_insert_office ON public.publications FOR INSERT TO authenticated WITH CHECK (public.is_office_member(office_id));


--
-- Name: publications publications_read_office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY publications_read_office ON public.publications FOR SELECT TO authenticated USING (public.is_office_member(office_id));


--
-- Name: publications publications_update_office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY publications_update_office ON public.publications FOR UPDATE TO authenticated USING (public.is_office_member(office_id)) WITH CHECK (public.is_office_member(office_id));


--
-- Name: task_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: task_participants task_participants_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_participants_delete ON public.task_participants FOR DELETE USING ((((office_id IS NOT NULL) AND public.is_office_admin(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: task_participants task_participants_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_participants_insert ON public.task_participants FOR INSERT WITH CHECK ((((office_id IS NOT NULL) AND public.is_office_member(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: task_participants task_participants_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_participants_select ON public.task_participants FOR SELECT USING ((((office_id IS NOT NULL) AND (public.is_office_admin(office_id) OR (user_id = auth.uid()))) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: task_participants task_participants_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_participants_update ON public.task_participants FOR UPDATE USING ((((office_id IS NOT NULL) AND (public.is_office_admin(office_id) OR (user_id = auth.uid()))) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks tasks_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_delete ON public.tasks FOR DELETE USING ((((office_id IS NOT NULL) AND public.is_office_admin(office_id)) OR ((office_id IS NULL) AND (user_id = auth.uid()))));


--
-- Name: tasks tasks_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_insert ON public.tasks FOR INSERT WITH CHECK ((((office_id IS NOT NULL) AND (public.is_office_admin(office_id) OR (assigned_to_user_id = auth.uid()))) OR ((office_id IS NULL) AND ((assigned_to_user_id = auth.uid()) OR (user_id = auth.uid())))));


--
-- Name: tasks tasks_read_office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_read_office ON public.tasks FOR SELECT TO authenticated USING (public.is_office_member(office_id));


--
-- Name: tasks tasks_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_select ON public.tasks FOR SELECT USING ((((office_id IS NOT NULL) AND (public.is_office_admin(office_id) OR (assigned_to_user_id = auth.uid()))) OR ((office_id IS NULL) AND ((assigned_to_user_id = auth.uid()) OR (user_id = auth.uid())))));


--
-- Name: tasks tasks_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_update ON public.tasks FOR UPDATE USING ((((office_id IS NOT NULL) AND (public.is_office_admin(office_id) OR (assigned_to_user_id = auth.uid()))) OR ((office_id IS NULL) AND ((assigned_to_user_id = auth.uid()) OR (user_id = auth.uid())))));


--
-- Name: tasks tasks_write_office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_write_office ON public.tasks TO authenticated USING (public.is_office_member(office_id)) WITH CHECK (public.is_office_member(office_id));


--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles user_profiles_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_profiles_read_all ON public.user_profiles FOR SELECT TO authenticated USING (true);


--
-- Name: user_profiles user_profiles_upsert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_profiles_upsert_self ON public.user_profiles TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- PostgreSQL database dump complete
--

\unrestrict vxRtcVVCO29egLH4ugjPs6e0Pc37r9nJNi5IDSodTRg2M8PQTdniBTmm1zPLmqK

