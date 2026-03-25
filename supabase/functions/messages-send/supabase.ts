// Utilitário para inserir registros nas tabelas de integração do Supabase
// Funções auxiliares para uso em Edge Functions

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
}

export async function insertWhatsappMessage({
  office_id,
  client_id,
  conversation_id,
  from_number,
  to_number,
  text_body,
  provider_message_id,
  status = 'sent',
  raw_payload = null,
}: {
  office_id: string;
  client_id?: string | null;
  conversation_id: string;
  from_number: string;
  to_number: string;
  text_body: string;
  provider_message_id?: string | null;
  status?: string;
  raw_payload?: any;
}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([
      {
        office_id,
        client_id,
        conversation_id,
        direction: 'outbound',
        provider: 'evolution',
        provider_message_id,
        from_number,
        to_number,
        message_type: 'text',
        text_body,
        status,
        raw_payload,
      },
    ]),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ao inserir whatsapp_message: ${err}`);
  }
  return (await res.json())[0];
}

export async function insertIntegrationOutbox({
  office_id,
  channel,
  event_type,
  destination,
  payload,
  status = 'pending',
  idempotency_key = null,
}: {
  office_id?: string | null;
  channel: string;
  event_type: string;
  destination?: string | null;
  payload: any;
  status?: string;
  idempotency_key?: string | null;
}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/integration_outbox`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([
      {
        office_id,
        channel,
        event_type,
        destination,
        payload,
        status,
        idempotency_key,
      },
    ]),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ao inserir integration_outbox: ${err}`);
  }
  return (await res.json())[0];
}
