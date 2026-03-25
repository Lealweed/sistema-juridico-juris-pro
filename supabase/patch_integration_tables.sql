-- patch_integration_tables.sql
-- Tabelas de integração para WhatsApp, eventos e outbox

create extension if not exists pgcrypto;

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  client_id uuid null references public.clients(id) on delete set null,
  phone_e164 text not null,
  status text not null default 'open' check (status in ('open', 'waiting_client', 'waiting_office', 'closed')),
  owner_user_id uuid null references auth.users(id) on delete set null,
  source text null,
  last_message_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_conversations_office_id on public.whatsapp_conversations(office_id);
create index if not exists idx_whatsapp_conversations_client_id on public.whatsapp_conversations(client_id);
create index if not exists idx_whatsapp_conversations_phone_e164 on public.whatsapp_conversations(phone_e164);
create unique index if not exists idx_whatsapp_conversations_office_phone_unique on public.whatsapp_conversations(office_id, phone_e164);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  client_id uuid null references public.clients(id) on delete set null,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider text not null default 'evolution',
  provider_message_id text null,
  from_number text not null,
  to_number text not null,
  message_type text not null default 'text',
  text_body text null,
  media_url text null,
  status text not null default 'received',
  raw_payload jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_messages_office_id on public.whatsapp_messages(office_id);
create index if not exists idx_whatsapp_messages_client_id on public.whatsapp_messages(client_id);
create index if not exists idx_whatsapp_messages_conversation_id on public.whatsapp_messages(conversation_id);
create index if not exists idx_whatsapp_messages_provider_message_id on public.whatsapp_messages(provider_message_id);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  office_id uuid null references public.offices(id) on delete cascade,
  event_type text not null,
  entity_type text null,
  entity_id uuid null,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  processed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_events_event_type on public.integration_events(event_type);
create index if not exists idx_integration_events_processed on public.integration_events(processed);
create index if not exists idx_integration_events_office_id on public.integration_events(office_id);

create table if not exists public.integration_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text null,
  headers jsonb null,
  payload jsonb not null,
  response_status integer null,
  response_body text null,
  error_message text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_webhook_logs_provider on public.integration_webhook_logs(provider);
create index if not exists idx_integration_webhook_logs_created_at on public.integration_webhook_logs(created_at desc);

create table if not exists public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  office_id uuid null references public.offices(id) on delete cascade,
  channel text not null,
  event_type text not null,
  destination text null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  idempotency_key text null,
  attempts integer not null default 0,
  last_error text null,
  sent_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_outbox_status on public.integration_outbox(status);
create index if not exists idx_integration_outbox_office_id on public.integration_outbox(office_id);
create unique index if not exists idx_integration_outbox_idempotency_key on public.integration_outbox(idempotency_key) where idempotency_key is not null;

-- RLS
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.integration_events enable row level security;
alter table public.integration_webhook_logs enable row level security;
alter table public.integration_outbox enable row level security;

-- Policies exemplo
create policy "office members can view whatsapp conversations" on public.whatsapp_conversations for select using (
  exists (select 1 from public.office_members om where om.office_id = whatsapp_conversations.office_id and om.user_id = auth.uid())
);

create policy "office members can view whatsapp messages" on public.whatsapp_messages for select using (
  exists (select 1 from public.office_members om where om.office_id = whatsapp_messages.office_id and om.user_id = auth.uid())
);

-- Trigger updated_at
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_whatsapp_conversations_updated_at on public.whatsapp_conversations;
create trigger trg_whatsapp_conversations_updated_at before update on public.whatsapp_conversations for each row execute function public.set_updated_at();
