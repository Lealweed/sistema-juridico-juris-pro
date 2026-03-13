-- Agenda items visibility: responsible-only; admin sees all

-- Ensure column exists (already added in earlier patch)
alter table public.agenda_items add column if not exists responsible_user_id uuid references auth.users(id) on delete set null;
create index if not exists agenda_items_responsible_idx on public.agenda_items(responsible_user_id);

-- Default responsible_user_id to auth.uid() when missing
create or replace function public._agenda_items_default_responsible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsible_user_id is null then
    new.responsible_user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists tr_agenda_items_default_responsible on public.agenda_items;
create trigger tr_agenda_items_default_responsible
before insert on public.agenda_items
for each row execute function public._agenda_items_default_responsible();

-- Replace RLS policies
alter table public.agenda_items enable row level security;

drop policy if exists agenda_items_select on public.agenda_items;
create policy agenda_items_select on public.agenda_items
for select using (
  (office_id is not null and (
    public.is_office_admin(office_id)
    or responsible_user_id = auth.uid()
  ))
  or (office_id is null and user_id = auth.uid())
);

drop policy if exists agenda_items_insert on public.agenda_items;
create policy agenda_items_insert on public.agenda_items
for insert with check (
  (office_id is not null and (
    public.is_office_admin(office_id)
    or responsible_user_id = auth.uid()
  ))
  or (office_id is null and user_id = auth.uid())
);

drop policy if exists agenda_items_update on public.agenda_items;
create policy agenda_items_update on public.agenda_items
for update using (
  (office_id is not null and (
    public.is_office_admin(office_id)
    or responsible_user_id = auth.uid()
  ))
  or (office_id is null and user_id = auth.uid())
);

drop policy if exists agenda_items_delete on public.agenda_items;
create policy agenda_items_delete on public.agenda_items
for delete using (
  (office_id is not null and (
    public.is_office_admin(office_id)
    or responsible_user_id = auth.uid()
  ))
  or (office_id is null and user_id = auth.uid())
);
