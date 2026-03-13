-- Expand clients fields for law office CRM: PF/PJ, whatsapp required, address, gov access notes.

-- 1) New columns
alter table public.clients add column if not exists person_type text; -- 'pf'|'pj'
alter table public.clients add column if not exists cnpj text;
alter table public.clients add column if not exists whatsapp text;

alter table public.clients add column if not exists rg text;
alter table public.clients add column if not exists birth_date date;
alter table public.clients add column if not exists profession text;
alter table public.clients add column if not exists civil_status text;

alter table public.clients add column if not exists address_cep text;
alter table public.clients add column if not exists address_street text;
alter table public.clients add column if not exists address_number text;
alter table public.clients add column if not exists address_complement text;
alter table public.clients add column if not exists address_neighborhood text;
alter table public.clients add column if not exists address_city text;
alter table public.clients add column if not exists address_state text;

alter table public.clients add column if not exists gov_notes text;
alter table public.clients add column if not exists gov_login_hint text;

-- 2) CNPJ validation
create or replace function public.is_valid_cnpj(p_cnpj text)
returns boolean
language plpgsql
immutable
as $$
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
$$;

-- 3) Constraints
alter table public.clients drop constraint if exists clients_person_type_valid;
alter table public.clients add constraint clients_person_type_valid
check (person_type is null or person_type in ('pf','pj'));

-- cpf/cnpj format validity (when set)
alter table public.clients drop constraint if exists clients_cnpj_valid;
alter table public.clients add constraint clients_cnpj_valid
check (cnpj is null or public.is_valid_cnpj(cnpj));

-- PF requires CPF, PJ requires CNPJ (allow NULL for legacy rows for now)
alter table public.clients drop constraint if exists clients_pf_pj_doc_required;
alter table public.clients add constraint clients_pf_pj_doc_required
check (
  person_type is null
  or (person_type = 'pf' and cpf is not null)
  or (person_type = 'pj' and cnpj is not null)
);

-- 4) Uniqueness per office
create unique index if not exists clients_office_cnpj_uniq
  on public.clients (office_id, cnpj)
  where cnpj is not null;

-- 5) Simple normalization helpers (optional): strip non-digits on insert/update
create or replace function public._clients_normalize_docs()
returns trigger
language plpgsql
as $$
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

drop trigger if exists tr_clients_normalize_docs on public.clients;
create trigger tr_clients_normalize_docs
before insert or update on public.clients
for each row execute function public._clients_normalize_docs();
