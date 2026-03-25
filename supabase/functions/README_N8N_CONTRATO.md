# Contrato de autenticação e payload das Edge Functions para automação n8n

## 1. clients-upsert-by-channel

- **URL:** https://gpazbahkzebixcminfrz.functions.supabase.co/clients-upsert-by-channel
- **Método:** POST
- **Autenticação:**
  - `Authorization: Bearer <N8N_MESSAGES_SEND_SECRET>`
  - `Content-Type: application/json`
- **Payload:**
```json
{
  "office_id": "<uuid>",
  "phone_e164": "+55XXXXXXXXXXX",
  "name": "<nome opcional>",
  "extra": { "campo": "valor" }
}
```
- **Resposta de sucesso:**
```json
{ "ok": true, "clientId": "<uuid>", "created": true }
{ "ok": true, "clientId": "<uuid>", "updated": true }
```

---

## 2. messages-send

- **URL:** https://gpazbahkzebixcminfrz.functions.supabase.co/messages-send
- **Método:** POST
- **Autenticação:**
  - `Authorization: Bearer <N8N_MESSAGES_SEND_SECRET>` **ou** JWT de usuário Supabase
  - `Content-Type: application/json`
- **Payload:**
```json
{
  "channel": "whatsapp",
  "destination": "+55XXXXXXXXXXX",
  "text": "<mensagem>",
  "officeId": "<uuid>",
  "clientId": "<uuid opcional>",
  "idempotencyKey": "<string opcional>"
}
```
- **Resposta de sucesso:**
```json
{ "ok": true, "messageId": "<uuid>", "outboxId": "<uuid>", "provider_message_id": "<id externo>" }
```

---

## 3. n8n-webhook-handler

- **URL:** https://gpazbahkzebixcminfrz.functions.supabase.co/n8n-webhook-handler
- **Método:** POST
- **Autenticação:**
  - `Authorization: Bearer <N8N_WEBHOOK_SECRET>` **ou** `?secret=<N8N_WEBHOOK_SECRET>`
  - `Content-Type: application/json`
- **Payload:**
```json
{
  "event_type": "<string>",
  "office_id": "<uuid>",
  "entity_type": "<string>",
  "entity_id": "<uuid>",
  "payload": { ... },
  "idempotency_key": "<string opcional>"
}
```
- **Resposta de sucesso:**
```json
{ "ok": true }
```

---

## 4. Status real de deploy

- clients-upsert-by-channel: PENDENTE (criada, precisa deployar via Supabase CLI ou painel)
- messages-send: AJUSTADA (pronta para uso via secret técnico)
- n8n-webhook-handler: CONCLUÍDO

---

**Atenção:**
- Para uso seguro, defina o segredo `N8N_MESSAGES_SEND_SECRET` nas variáveis de ambiente do Supabase.
- O deploy da nova function deve ser feito pelo painel Supabase ou CLI.
- Todos os endpoints aceitam apenas POST e exigem autenticação técnica para automação n8n.
