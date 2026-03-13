-- Agenda: multi-agendas + reminders (WhatsApp/Google hooks)

-- 1) agendas
create table if not exists public.agendas (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  name text not null,
  color text not null default '#f59e0b',
  kind text not null default 'shared', -- shared|personal|sector (flex)
  owner_user_id uuid references auth.users(id) on delete set null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists agendas_office_idx on public.agendas(office_id);
create index if not exists agendas_owner_idx on public.agendas(owner_user_id);

alter table public.agendas enable row level security;

drop policy if exists agendas_select on public.agendas;
create policy agendas_select on public.agendas
for select using (public.is_office_member(office_id));

drop policy if exists agendas_insert on public.agendas;
create policy agendas_insert on public.agendas
for insert with check (public.is_office_admin(office_id));

drop policy if exists agendas_update on public.agendas;
create policy agendas_update on public.agendas
for update using (public.is_office_admin(office_id));

drop policy if exists agendas_delete on public.agendas;
create policy agendas_delete on public.agendas
for delete using (public.is_office_admin(office_id));

-- Ensure only one default per office (partial unique)
create unique index if not exists agendas_default_one_per_office
  on public.agendas(office_id)
  where is_default;

-- 2) agenda_items: attach to agenda + link client/case/responsible
alter table public.agenda_items add column if not exists office_id uuid;
alter table public.agenda_items add column if not exists agenda_id uuid references public.agendas(id) on delete set null;
alter table public.agenda_items add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.agenda_items add column if not exists case_id uuid references public.cases(id) on delete set null;
alter table public.agenda_items add column if not exists responsible_user_id uuid references auth.users(id) on delete set null;

create index if not exists agenda_items_office_idx on public.agenda_items(office_id);
create index if not exists agenda_items_agenda_idx on public.agenda_items(agenda_id);
create index if not exists agenda_items_client_idx on public.agenda_items(client_id);
create index if not exists agenda_items_case_idx on public.agenda_items(case_id);

-- Backfill office_id
update public.agenda_items ai
set office_id = coalesce(ai.office_id, c.office_id)
from public.cases c
where ai.case_id = c.id
  and ai.office_id is null;

update public.agenda_items ai
set office_id = coalesce(ai.office_id, cl.office_id)
from public.clients cl
where ai.client_id = cl.id
  and ai.office_id is null;

-- If still null, try infer from user_id membership (first office)
update public.agenda_items ai
set office_id = m.office_id
from public.office_members m
where ai.office_id is null
  and m.user_id = ai.user_id
  and m.office_id is not null;

-- Create default agenda per office (if none)
insert into public.agendas (office_id, name, color, kind, is_default)
select o.id, 'Agenda principal', '#f59e0b', 'shared', true
from public.offices o
where not exists (select 1 from public.agendas a where a.office_id = o.id and a.is_default);

-- Backfill agenda_id to default per office
update public.agenda_items ai
set agenda_id = a.id
from public.agendas a
where ai.agenda_id is null
  and ai.office_id = a.office_id
  and a.is_default;

-- Ensure office_id present moving forward
create or replace function public._agenda_items_ensure_office()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

drop trigger if exists tr_agenda_items_ensure_office on public.agenda_items;
create trigger tr_agenda_items_ensure_office
before insert on public.agenda_items
for each row execute function public._agenda_items_ensure_office();

-- Tighten RLS of agenda_items to office-aware if not already.
-- Keep legacy user_id fallback for safety.
alter table public.agenda_items enable row level security;

drop policy if exists agenda_items_select on public.agenda_items;
create policy agenda_items_select on public.agenda_items
for select using (
  (office_id is not null and public.is_office_member(office_id))
  or (office_id is null and user_id = auth.uid())
);

drop policy if exists agenda_items_insert on public.agenda_items;
create policy agenda_items_insert on public.agenda_items
for insert with check (
  (office_id is not null and public.is_office_member(office_id))
  or (office_id is null and user_id = auth.uid())
);

drop policy if exists agenda_items_update on public.agenda_items;
create policy agenda_items_update on public.agenda_items
for update using (
  (office_id is not null and public.is_office_member(office_id))
  or (office_id is null and user_id = auth.uid())
);

drop policy if exists agenda_items_delete on public.agenda_items;
create policy agenda_items_delete on public.agenda_items
for delete using (
  (office_id is not null and public.is_office_member(office_id))
  or (office_id is null and user_id = auth.uid())
);

-- 3) Reminders queue (WhatsApp/Email future)
create table if not exists public.agenda_reminders (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  agenda_item_id uuid not null references public.agenda_items(id) on delete cascade,
  channel text not null default 'whatsapp',
  to_kind text not null default 'internal', -- internal|client|custom
  to_phone text not null,
  message text not null,
  send_at timestamptz not null,
  status text not null default 'pending', -- pending|sent|error|cancelled
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists agenda_reminders_office_idx on public.agenda_reminders(office_id);
create index if not exists agenda_reminders_send_at_idx on public.agenda_reminders(status, send_at);
create index if not exists agenda_reminders_item_idx on public.agenda_reminders(agenda_item_id);

alter table public.agenda_reminders enable row level security;

drop policy if exists agenda_reminders_select on public.agenda_reminders;
create policy agenda_reminders_select on public.agenda_reminders
for select using (public.is_office_member(office_id));

drop policy if exists agenda_reminders_insert on public.agenda_reminders;
create policy agenda_reminders_insert on public.agenda_reminders
for insert with check (public.is_office_member(office_id));

drop policy if exists agenda_reminders_update on public.agenda_reminders;
create policy agenda_reminders_update on public.agenda_reminders
for update using (public.is_office_member(office_id));

drop policy if exists agenda_reminders_delete on public.agenda_reminders;
create policy agenda_reminders_delete on public.agenda_reminders
for delete using (public.is_office_member(office_id));

-- Audit
create trigger tr_audit_agendas
after insert or update or delete on public.agendas
for each row execute function public._audit_log_row();

create trigger tr_audit_agenda_reminders
after insert or update or delete on public.agenda_reminders
for each row execute function public._audit_log_row();
