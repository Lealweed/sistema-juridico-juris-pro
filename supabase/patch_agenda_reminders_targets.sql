-- Improve agenda_reminders to support auto reminders without storing phone upfront

alter table public.agenda_reminders add column if not exists to_user_id uuid references auth.users(id) on delete set null;
alter table public.agenda_reminders add column if not exists to_client_id uuid references public.clients(id) on delete set null;

-- Allow to_phone to be null while we resolve it later (e.g., from client.whatsapp or user profile)
alter table public.agenda_reminders alter column to_phone drop not null;

-- Helpful index
create index if not exists agenda_reminders_to_user_idx on public.agenda_reminders(to_user_id);
create index if not exists agenda_reminders_to_client_idx on public.agenda_reminders(to_client_id);
