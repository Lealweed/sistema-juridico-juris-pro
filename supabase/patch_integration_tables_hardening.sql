-- patch_integration_tables_hardening.sql
-- Endurecimento das tabelas de integração

-- 1. Endurecimento de constraints
alter table public.whatsapp_messages
  alter column status set default 'sent',
  add constraint whatsapp_messages_status_check check (status in ('received','sent','delivered','read','failed'));

alter table public.whatsapp_messages
  alter column message_type set default 'text',
  add constraint whatsapp_messages_message_type_check check (message_type in ('text','media','location','contact'));

alter table public.integration_outbox
  add constraint integration_outbox_channel_check check (channel in ('whatsapp','email','sms','webhook')),
  add constraint integration_outbox_attempts_check check (attempts >= 0);

-- 2. RLS policies endurecidas
-- integration_webhook_logs: apenas service role pode acessar
revoke all on public.integration_webhook_logs from public;
create policy "service role only" on public.integration_webhook_logs for all to service_role using (true) with check (true);

-- integration_outbox: acesso restrito por office_id
create policy "office members can view integration outbox" on public.integration_outbox for select using (
  office_id is null or exists (select 1 from public.office_members om where om.office_id = integration_outbox.office_id and om.user_id = auth.uid())
);

-- 3. Índices adicionais
create index if not exists idx_whatsapp_messages_conversation_created_at on public.whatsapp_messages(conversation_id, created_at desc);
create index if not exists idx_integration_webhook_logs_office_id on public.integration_webhook_logs(provider, created_at desc);

-- 4. Unicidade de idempotency_key já garantida em integration_outbox
-- create unique index if not exists idx_integration_outbox_idempotency_key on public.integration_outbox(idempotency_key) where idempotency_key is not null;

-- 5. Marcação backend-only
comment on table public.integration_webhook_logs is 'backend-only: acesso apenas service role';
comment on table public.integration_outbox is 'backend-only: acesso apenas service role ou office';
