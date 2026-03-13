-- Expand cases (processes) with extra law office fields

alter table public.cases add column if not exists area text;
alter table public.cases add column if not exists court text; -- vara/juizado/tribunal
alter table public.cases add column if not exists district text; -- comarca/cidade
alter table public.cases add column if not exists counterparty_name text;
alter table public.cases add column if not exists counterparty_doc text;
alter table public.cases add column if not exists counterparty_whatsapp text;
alter table public.cases add column if not exists claim_value numeric(14,2);
alter table public.cases add column if not exists distributed_at date;
alter table public.cases add column if not exists responsible_user_id uuid references auth.users(id) on delete set null;

create index if not exists cases_client_id_idx on public.cases(client_id);
create index if not exists cases_responsible_user_id_idx on public.cases(responsible_user_id);
