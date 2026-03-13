-- Agenda outbox: allow delegator to still SEE items they delegated (select-only)

alter table public.agenda_items enable row level security;

drop policy if exists agenda_items_select on public.agenda_items;
create policy agenda_items_select on public.agenda_items
for select using (
  (office_id is not null and (
    public.is_office_admin(office_id)
    or responsible_user_id = auth.uid()
    or last_responsible_by_user_id = auth.uid()
  ))
  or (office_id is null and user_id = auth.uid())
);
