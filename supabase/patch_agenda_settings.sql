-- Agenda settings per office

create table if not exists public.office_settings (
  office_id uuid primary key references public.offices(id) on delete cascade,
  agenda_deadline_default_time time not null default '09:00',
  agenda_commitment_default_minutes_before int not null default 30,
  office_whatsapp text,
  timezone text not null default 'America/Sao_Paulo',
  updated_at timestamptz not null default now()
);

alter table public.office_settings enable row level security;

drop policy if exists office_settings_select on public.office_settings;
create policy office_settings_select on public.office_settings
for select using (public.is_office_member(office_id));

drop policy if exists office_settings_upsert on public.office_settings;
create policy office_settings_upsert on public.office_settings
for insert with check (public.is_office_admin(office_id));

drop policy if exists office_settings_update on public.office_settings;
create policy office_settings_update on public.office_settings
for update using (public.is_office_admin(office_id));

-- helper: ensure row exists
create or replace function public.ensure_office_settings(p_office_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.office_settings (office_id)
  values (p_office_id)
  on conflict (office_id) do nothing;
end;
$$;

revoke all on function public.ensure_office_settings(uuid) from public;
grant execute on function public.ensure_office_settings(uuid) to authenticated;

create trigger tr_audit_office_settings
after insert or update or delete on public.office_settings
for each row execute function public._audit_log_row();
